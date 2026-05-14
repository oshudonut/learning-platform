"use client";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { mapMatchRoomPayload, mapParticipantPayload, mapAnswerPayload } from "@/lib/match-mappers";
import type { MatchRoom, MatchParticipant, MatchAnswer } from "@/lib/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseMatchRealtimeOpts {
  // Called whenever a new participant joins via Realtime — use to trigger a
  // full fetchState() so the lobby displays participant profiles correctly.
  onNewParticipant?: () => void;
}

export function useMatchRealtime(
  matchId: string,
  initial: { match: MatchRoom | null; participants: MatchParticipant[]; answers: MatchAnswer[] },
  opts?: UseMatchRealtimeOpts
): { match: MatchRoom | null; participants: MatchParticipant[]; answers: MatchAnswer[] } {
  const [match, setMatch] = useState<MatchRoom | null>(initial.match);
  const [participants, setParticipants] = useState<MatchParticipant[]>(initial.participants);
  const [answers, setAnswers] = useState<MatchAnswer[]>(initial.answers);

  // Stable ref so the Realtime closure always calls the latest callback
  const onNewParticipantRef = useRef(opts?.onNewParticipant);
  useEffect(() => {
    onNewParticipantRef.current = opts?.onNewParticipant;
  });

  // Seed state whenever initial changes (e.g., server-side refresh after join)
  useEffect(() => {
    setMatch(initial.match);
    setParticipants(initial.participants);
    setAnswers(initial.answers);
  }, [initial]);

  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    // Only set up the channel once — ignore initial changes after mount
    if (channelRef.current) return;

    const supabase = createSupabaseBrowser();

    const channel = supabase
      .channel(`match:${matchId}`)
      // ── match_rooms ──────────────────────────────────────────────────────────
      // Filter on PK (id) — safe without REPLICA IDENTITY FULL
      .on(
        "postgres_changes" as const,
        { event: "*", schema: "public", table: "match_rooms", filter: `id=eq.${matchId}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setMatch((prev) =>
              prev ? { ...prev, ...mapMatchRoomPayload(payload.new as Record<string, unknown>) } : prev
            );
          } else if (payload.eventType === "DELETE") {
            setMatch(null);
          }
        }
      )
      // ── match_participants ────────────────────────────────────────────────────
      // NO server-side filter: room_id is not the PK, so Supabase Realtime
      // requires REPLICA IDENTITY FULL to filter on it — without that setting,
      // events are silently dropped. Subscribe to all rows and filter client-side.
      .on(
        "postgres_changes" as const,
        { event: "*", schema: "public", table: "match_participants" },
        (payload) => {
          const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Record<string, unknown>;
          if (row.room_id !== matchId) return; // client-side filter
          if (payload.eventType === "INSERT") {
            const newRow = payload.new as Record<string, unknown>;
            setParticipants((prev) => {
              if (prev.find((p) => p.id === newRow.id)) return prev; // dedupe
              return [
                ...prev,
                {
                  id: newRow.id as string,
                  roomId: newRow.room_id as string,
                  userId: newRow.user_id as string,
                  score: (newRow.score as number) ?? 0,
                  isReady: (newRow.is_ready as boolean) ?? false,
                  joinedAt: newRow.joined_at as string,
                  profile: undefined, // profile fetched via onNewParticipant → fetchState
                },
              ];
            });
            // Trigger a full refresh so the lobby gets participant display names
            onNewParticipantRef.current?.();
          } else if (payload.eventType === "UPDATE") {
            const newRow = payload.new as Record<string, unknown>;
            const updates = mapParticipantPayload(newRow);
            setParticipants((prev) =>
              prev.map((p) => (p.id === newRow.id ? { ...p, ...updates } : p))
            );
          }
        }
      )
      // ── match_answers ─────────────────────────────────────────────────────────
      // NO server-side filter: same reason as match_participants above.
      .on(
        "postgres_changes" as const,
        { event: "INSERT", schema: "public", table: "match_answers" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.room_id !== matchId) return; // client-side filter
          const answer = mapAnswerPayload(row);
          setAnswers((prev) => [...prev, answer]);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  return { match, participants, answers };
}
