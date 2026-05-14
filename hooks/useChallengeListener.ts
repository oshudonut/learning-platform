"use client";
import { useEffect } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

export function useChallengeListener(
  userId: string | null | undefined,
  onChallenge: (matchId: string) => void
) {
  useEffect(() => {
    if (!userId) return;
    const supabase = createSupabaseBrowser();
    const channel = supabase
      .channel(`invitations:${userId}`)
      .on(
        "postgres_changes" as const,
        {
          event: "INSERT",
          schema: "public",
          table: "match_rooms",
          filter: `invited_user_id=eq.${userId}`,
        },
        (payload) => {
          onChallenge(payload.new.id as string);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]); // intentionally omit onChallenge — stable ref enforced at call site
}
