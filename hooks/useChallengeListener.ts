"use client";
import { useEffect, useRef } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

export function useChallengeListener(
  userId: string | null | undefined,
  onChallenge: (matchId: string) => void
) {
  // Track which match IDs we've already surfaced to avoid duplicate modals
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    const supabase = createSupabaseBrowser();

    // No server-side filter — filter client-side instead.
    // Server-side column filters on match_rooms require REPLICA IDENTITY FULL
    // AND can still miss events during the ~500ms subscription setup window.
    // Client-side filtering is unconditionally reliable.
    const channel = supabase
      .channel(`invitations:${userId}`)
      .on(
        "postgres_changes" as const,
        {
          event: "INSERT",
          schema: "public",
          table: "match_rooms",
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.invited_user_id !== userId) return;
          const matchId = row.id as string;
          if (seenRef.current.has(matchId)) return;
          seenRef.current.add(matchId);
          onChallenge(matchId);
        }
      )
      .subscribe();

    // Belt-and-suspenders: poll every 10 s to catch any Realtime misses
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/match/invitations");
        if (!res.ok) return;
        const data = await res.json();
        const invitations = (data.invitations ?? []) as Array<{ id: string }>;
        for (const inv of invitations) {
          if (!seenRef.current.has(inv.id)) {
            seenRef.current.add(inv.id);
            onChallenge(inv.id);
          }
        }
      } catch {
        // network error — silently skip
      }
    }, 10_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]); // onChallenge intentionally omitted — stable ref enforced at call site
}
