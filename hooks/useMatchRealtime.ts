"use client";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { mapMatchRoomPayload, mapParticipantPayload, mapAnswerPayload } from "@/lib/match-mappers";
import type { MatchRoom, MatchParticipant, MatchAnswer } from "@/lib/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

export function useMatchRealtime(
  matchId: string,
  initial: { match: MatchRoom | null; participants: MatchParticipant[]; answers: MatchAnswer[] }
): { match: MatchRoom | null; participants: MatchParticipant[]; answers: MatchAnswer[] } {
  const [match, setMatch] = useState<MatchRoom | null>(initial.match);
  const [participants, setParticipants] = useState<MatchParticipant[]>(initial.participants);
  const [answers, setAnswers] = useState<MatchAnswer[]>(initial.answers);

  // Seed state whenever initial changes (e.g., server-side refresh)
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
      .on(
        "postgres_changes" as const,
        { event: "*", schema: "public", table: "match_participants", filter: `room_id=eq.${matchId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Record<string, unknown>;
            setParticipants((prev) => {
              if (prev.find((p) => p.id === row.id)) return prev; // dedupe
              return [
                ...prev,
                {
                  id: row.id as string,
                  roomId: row.room_id as string,
                  userId: row.user_id as string,
                  score: (row.score as number) ?? 0,
                  isReady: (row.is_ready as boolean) ?? false,
                  joinedAt: row.joined_at as string,
                  profile: undefined,
                },
              ];
            });
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Record<string, unknown>;
            const updates = mapParticipantPayload(row);
            setParticipants((prev) =>
              prev.map((p) => (p.id === row.id ? { ...p, ...updates } : p))
            );
          }
        }
      )
      // ── match_answers ─────────────────────────────────────────────────────────
      .on(
        "postgres_changes" as const,
        { event: "INSERT", schema: "public", table: "match_answers", filter: `room_id=eq.${matchId}` },
        (payload) => {
          const answer = mapAnswerPayload(payload.new as Record<string, unknown>);
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
