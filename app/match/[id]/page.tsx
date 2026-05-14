"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Trophy, Swords, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { useMatchRealtime } from "@/hooks/useMatchRealtime";
import type { MatchRoom, MatchParticipant, MatchAnswer } from "@/lib/types";

type AnswerResult = {
  gotPoint: boolean;
  isCorrect: boolean;
  correctAnswer: string;
} | null;

export default function MatchPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  // ── Initial fetch state ──────────────────────────────────────────────────────
  // We do a single HTTP fetch on mount, then hand off to useMatchRealtime.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialState, setInitialState] = useState<{
    match: MatchRoom | null;
    participants: MatchParticipant[];
    answers: MatchAnswer[];
  }>({ match: null, participants: [], answers: [] });

  // Stable ref used by useMatchRealtime so it can call fetchState without
  // being declared before it (avoids TDZ error while still being up-to-date).
  const fetchStateRef = useRef<(() => void) | null>(null);

  // Sequence counter: each fetchState call gets a monotonically increasing ID.
  // A response is only applied if no newer fetch has ALREADY RESOLVED — tracked
  // via lastAppliedSeqRef. This prevents a slow response from overwriting a
  // faster, more recent one, without cancelling in-flight concurrent fetches.
  const fetchSeqRef = useRef(0);
  const lastAppliedSeqRef = useRef(0);

  // ── Realtime (authoritative state after initial load) ────────────────────────
  const { match, participants, answers } = useMatchRealtime(
    params.id,
    initialState,
    { onNewParticipant: () => fetchStateRef.current?.() }
  );

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [readying, setReadying] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerResult, setAnswerResult] = useState<AnswerResult>(null);
  const [submitting, setSubmitting] = useState(false);
  const answeredQuestions = useRef<Set<number>>(new Set());
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  // ── fetchState — used for initial load + post-answer score sync ──────────────
  const fetchState = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    const res = await fetch(`/api/match/${params.id}`);
    // Only skip if a newer response has ALREADY been applied — not just started.
    // This way concurrent polls don't cancel each other; only stale ones lose.
    if (seq < lastAppliedSeqRef.current) return;
    if (!res.ok) {
      setError("Match not found");
      setLoading(false);
      return;
    }
    const data = await res.json();
    if (seq < lastAppliedSeqRef.current) return;
    lastAppliedSeqRef.current = seq;
    setInitialState({
      match: data.match,
      participants: data.participants ?? [],
      answers: data.answers ?? [],
    });
    setLoading(false);
  }, [params.id]);

  // Keep the ref in sync so useMatchRealtime always calls the latest fetchState
  fetchStateRef.current = fetchState;

  // handleJoin — used by both auto-join (silent) and the explicit "Join Match" button.
  const handleJoin = useCallback(async () => {
    setJoining(true);
    setJoinError(null);
    try {
      const r = await fetch(`/api/match/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: params.id }),
      });
      if (r.ok) {
        await fetchState();
      } else {
        const data = await r.json().catch(() => ({}));
        setJoinError(data.error ?? `Could not join (HTTP ${r.status})`);
      }
    } catch {
      setJoinError("Network error — please try again");
    } finally {
      setJoining(false);
    }
  }, [params.id, fetchState]);

  // Auto-join on page load: attempt silently if the user is not yet a participant.
  // Gate on `loading === false` so participants is authoritative DB state, not the
  // empty default — prevents a double-join race (ChallengeProvider join + auto-join).
  const hasAutoJoinedRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!match || !user) return;
    if (hasAutoJoinedRef.current) return;
    if (match.status !== "waiting") return;
    const alreadyIn = participants.some((p) => p.userId === user.id);
    if (alreadyIn) return;
    hasAutoJoinedRef.current = true;
    handleJoin();
  }, [loading, match, participants, user, handleJoin]);

  // Single fetch on mount — realtime takes over from here
  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // While waiting for opponent: poll every 1.5 s so the lobby stays in sync
  // even when Realtime events are delayed or missed. Catches waiting→active.
  useEffect(() => {
    if (!match) return;
    if (match.status !== "waiting") return;
    const interval = setInterval(fetchState, 1500);
    return () => clearInterval(interval);
  }, [match?.status, fetchState]);

  // When a new participant joins (Realtime INSERT), immediately re-fetch so the
  // host sees them and — crucially — catches any immediate status change.
  useEffect(() => {
    if (participants.length >= 2) {
      fetchState();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants.length]);

  // Clear answer UI when question advances
  useEffect(() => {
    if (!match) return;
    const idx = match.currentQuestionIndex;
    if (!answeredQuestions.current.has(idx)) {
      setSelectedAnswer(null);
      setAnswerResult(null);
    }
  }, [match?.currentQuestionIndex]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function handleReady() {
    setReadying(true);
    try {
      const res = await fetch(`/api/match/${params.id}/ready`, { method: "POST" });
      if (res.ok) {
        fetchState();
      } else {
        // Don't call fetchState on error — it would overwrite optimistic UI and
        // show "Ready Up" again without user action. Just log and reset spinner.
        const data = await res.json().catch(() => ({}));
        console.error("[handleReady] server error:", data.error);
      }
    } finally {
      setReadying(false);
    }
  }

  async function handleAnswer(choice: string) {
    if (!match || submitting || selectedAnswer !== null) return;
    const idx = match.currentQuestionIndex;
    if (answeredQuestions.current.has(idx)) return;
    answeredQuestions.current.add(idx);

    setSelectedAnswer(choice);
    setSubmitting(true);
    const res = await fetch(`/api/match/${params.id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionIndex: idx, answer: choice }),
    });
    const data = (await res.json()) as AnswerResult & { error?: string };
    setSubmitting(false);
    if (!res.ok) return;
    setAnswerResult(data);
    // Sync score after answering — realtime handles question advancement
    fetchState();
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const me = participants.find((p) => p.userId === user?.id);
  const opponent = participants.find((p) => p.userId !== user?.id);

  // ── Loading / error guards ───────────────────────────────────────────────────
  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (error || !match) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-gray-400">{error ?? "Match not found"}</p>
          <button
            onClick={() => router.push("/compete")}
            className="text-sm text-indigo-400 hover:underline"
          >
            Back to Compete
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => router.push("/compete")}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Compete
        </button>

        {match.status === "waiting" && (
          <LobbyView
            match={match}
            participants={participants}
            me={me}
            onReady={handleReady}
            readying={readying}
            onJoin={handleJoin}
            joining={joining}
            joinError={joinError}
          />
        )}
        {match.status === "active" && (
          <RaceView
            match={match}
            participants={participants}
            answers={answers}
            me={me}
            opponent={opponent}
            selectedAnswer={selectedAnswer}
            answerResult={answerResult}
            onAnswer={handleAnswer}
            submitting={submitting}
          />
        )}
        {match.status === "completed" && (
          <ResultsView
            match={match}
            participants={participants}
            answers={answers}
            me={me}
            opponent={opponent}
            onPlayAgain={() => router.push("/compete")}
          />
        )}
      </div>
    </AppShell>
  );
}

// ─── Lobby ────────────────────────────────────────────────────────────────────

function LobbyView({
  match,
  participants,
  me,
  onReady,
  readying,
  onJoin,
  joining,
  joinError,
}: {
  match: MatchRoom;
  participants: MatchParticipant[];
  me?: MatchParticipant;
  onReady: () => void;
  readying: boolean;
  onJoin: () => void;
  joining: boolean;
  joinError: string | null;
}) {
  const slots: (MatchParticipant | undefined)[] = [
    participants[0],
    participants[1],
  ];
  const bothConnected = !!slots[0] && !!slots[1];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gray-800 border border-gray-700 p-8 text-center">
        {/* Title + subtitle */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-white mb-1">Match Lobby</h2>
          <p className="text-sm text-gray-400">
            {bothConnected
              ? "Both players connected! Ready up to start."
              : "Waiting for opponent..."}
          </p>
        </div>

        {/* Player slots */}
        <div className="flex items-center justify-center gap-8 mb-6">
          {slots.map((p, i) => (
            <div key={i} className="flex flex-col items-center gap-2 w-28">
              {p ? (
                <>
                  <div className="h-14 w-14 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xl font-bold ring-4 ring-indigo-500/20">
                    {(p.profile?.displayName || "?")[0].toUpperCase()}
                  </div>
                  <p className="text-sm text-white font-medium truncate w-full text-center">
                    {p.profile?.displayName ?? "Player"}
                  </p>
                  {p.isReady ? (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                      <Check className="h-3 w-3" /> Ready
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">Not ready</span>
                  )}
                </>
              ) : (
                <>
                  <div className="h-14 w-14 rounded-full bg-gray-700/60 border-2 border-dashed border-gray-600 flex items-center justify-center animate-pulse">
                    <span className="text-gray-600 text-lg">?</span>
                  </div>
                  <p className="text-sm text-gray-600">Open slot</p>
                </>
              )}
            </div>
          ))}

          {/* VS badge between players */}
          {bothConnected && (
            <div className="absolute flex flex-col items-center">
              <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
                <Swords className="h-4 w-4 text-gray-500" />
              </div>
            </div>
          )}
        </div>

        {/* Document info */}
        <p className="text-xs text-gray-500 mb-6">
          {match.totalQuestions} question{match.totalQuestions !== 1 ? "s" : ""} &middot; First correct answer wins each point
        </p>

        {/* If this user is not yet a participant, show join button instead of ready */}
        {!me ? (
          <div className="space-y-2">
            <button
              onClick={onJoin}
              disabled={joining}
              className="w-full max-w-xs mx-auto rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 transition-colors flex items-center justify-center gap-2"
            >
              {joining ? "Joining..." : "Join Match"}
            </button>
            {joinError && (
              <p className="text-xs text-red-400 text-center">{joinError}</p>
            )}
          </div>
        ) : (
          <button
            onClick={onReady}
            disabled={readying || !!me?.isReady}
            className="w-full max-w-xs mx-auto rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 transition-colors flex items-center justify-center gap-2"
          >
            {me?.isReady ? (
              <>
                <Check className="h-4 w-4" /> You&apos;re Ready!
              </>
            ) : readying ? (
              "Readying up..."
            ) : (
              "Ready Up"
            )}
          </button>
        )}

        <p className="text-xs text-gray-500 mt-3">
          Game starts automatically when both players are ready
        </p>
      </div>
    </div>
  );
}

// ─── Race Game ────────────────────────────────────────────────────────────────

function RaceView({
  match,
  participants,
  answers,
  me,
  opponent,
  selectedAnswer,
  answerResult,
  onAnswer,
  submitting,
}: {
  match: MatchRoom;
  participants: MatchParticipant[];
  answers: MatchAnswer[];
  me?: MatchParticipant;
  opponent?: MatchParticipant;
  selectedAnswer: string | null;
  answerResult: AnswerResult;
  onAnswer: (choice: string) => void;
  submitting: boolean;
}) {
  // Silence unused-variable warning — participants array is available for future use
  void participants;

  const q = match.quizSnapshot[match.currentQuestionIndex];
  if (!q) return null;

  const correctAnswer = q.choices[q.correctIndex];
  const opponentAnswered = answers.some(
    (a) =>
      a.questionIndex === match.currentQuestionIndex &&
      a.userId === opponent?.userId
  );

  function choiceClass(choice: string) {
    const base =
      "w-full text-left rounded-xl border px-5 py-4 text-sm font-medium transition-all ";
    if (!selectedAnswer)
      return (
        base +
        "border-gray-600 bg-gray-700/50 text-white hover:border-indigo-400 hover:bg-indigo-500/10"
      );
    if (choice === correctAnswer)
      return base + "border-emerald-500 bg-emerald-500/10 text-emerald-300";
    if (choice === selectedAnswer && choice !== correctAnswer)
      return base + "border-red-500 bg-red-500/10 text-red-300";
    return base + "border-gray-700 bg-gray-800 text-gray-500";
  }

  return (
    <div className="space-y-4">
      {/* Scoreboard */}
      <div className="rounded-2xl bg-gray-800 border border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <p className="text-xs text-gray-500 mb-1">
              {me?.profile?.displayName ?? "You"}
            </p>
            <p className="text-3xl font-bold text-white">{me?.score ?? 0}</p>
          </div>
          <div className="text-center px-4">
            <Swords className="h-5 w-5 text-gray-500 mx-auto" />
            <p className="text-xs text-gray-600 mt-1">
              {match.currentQuestionIndex + 1} / {match.totalQuestions}
            </p>
          </div>
          <div className="text-center flex-1">
            <p className="text-xs text-gray-500 mb-1">
              {opponent?.profile?.displayName ?? "Opponent"}
            </p>
            <p className="text-3xl font-bold text-white">
              {opponent?.score ?? 0}
            </p>
          </div>
        </div>
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={match.currentQuestionIndex}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="rounded-2xl bg-gray-800 border border-gray-700 p-6 space-y-5"
        >
          <p className="text-lg font-semibold text-white leading-snug">
            {q.question}
          </p>

          {answerResult && (
            <div
              className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
                answerResult.gotPoint
                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                  : answerResult.isCorrect
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  : "bg-red-500/15 text-red-300 border border-red-500/30"
              }`}
            >
              {answerResult.gotPoint
                ? "You got the point!"
                : answerResult.isCorrect
                ? "Correct, but opponent was faster!"
                : `Wrong. Correct: ${answerResult.correctAnswer}`}
            </div>
          )}

          <div className="space-y-2">
            {q.choices.map((choice) => (
              <button
                key={choice}
                onClick={() => onAnswer(choice)}
                disabled={!!selectedAnswer || submitting}
                className={choiceClass(choice)}
              >
                {choice}
              </button>
            ))}
          </div>

          {opponentAnswered && !selectedAnswer && (
            <p className="text-xs text-amber-400">
              Opponent answered — hurry!
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Results ──────────────────────────────────────────────────────────────────

function ResultsView({
  match,
  participants,
  answers,
  me,
  opponent,
  onPlayAgain,
}: {
  match: MatchRoom;
  participants: MatchParticipant[];
  answers: MatchAnswer[];
  me?: MatchParticipant;
  opponent?: MatchParticipant;
  onPlayAgain: () => void;
}) {
  const myScore = me?.score ?? 0;
  const oppScore = opponent?.score ?? 0;
  const iWon = myScore > oppScore;
  const isTie = myScore === oppScore;

  return (
    <div className="space-y-6">
      {/* Winner banner */}
      <div className="rounded-2xl bg-gray-800 border border-gray-700 p-8 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring" }}
        >
          <Trophy
            className={`h-12 w-12 mx-auto mb-3 ${
              isTie
                ? "text-gray-400"
                : iWon
                ? "text-amber-400"
                : "text-gray-500"
            }`}
          />
          <h2 className="text-2xl font-bold text-white mb-1">
            {isTie
              ? "It's a Tie!"
              : iWon
              ? "You Win!"
              : `${opponent?.profile?.displayName ?? "Opponent"} Wins!`}
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            {me?.profile?.displayName ?? "You"} {myScore} — {oppScore}{" "}
            {opponent?.profile?.displayName ?? "Opponent"}
          </p>
          <div className="flex items-center justify-center gap-6 mb-6">
            {participants.map((p) => (
              <div key={p.id} className="text-center">
                <div className="h-12 w-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold mx-auto mb-2">
                  {(p.profile?.displayName || "?")[0].toUpperCase()}
                </div>
                <p className="text-sm text-white">{p.profile?.displayName}</p>
                <p className="text-2xl font-bold text-white mt-1">{p.score}</p>
              </div>
            ))}
          </div>
          <button
            onClick={onPlayAgain}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 transition-colors"
          >
            Play Again
          </button>
        </motion.div>
      </div>

      {/* Per-question breakdown */}
      <div className="rounded-2xl bg-gray-800 border border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-white mb-4">
          Question Breakdown
        </h3>
        <div className="space-y-3">
          {match.quizSnapshot.map((q, i) => {
            const pointAnswer = answers.find(
              (a) => a.questionIndex === i && a.gotPoint
            );
            const myAnswer = answers.find(
              (a) => a.questionIndex === i && a.userId === me?.userId
            );
            const pointWinner = pointAnswer
              ? participants.find((p) => p.userId === pointAnswer.userId)
              : null;
            return (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="text-gray-600 w-5 flex-shrink-0 text-right">
                  {i + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-300 truncate">{q.question}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {pointWinner ? (
                      <span className="text-emerald-400">
                        {pointWinner.userId === me?.userId
                          ? "You"
                          : pointWinner.profile?.displayName}{" "}
                        got the point
                      </span>
                    ) : (
                      <span className="text-gray-600">
                        No one got the point
                      </span>
                    )}
                    {myAnswer && !myAnswer.isCorrect && (
                      <span className="text-red-400 ml-2">
                        &middot; You answered wrong
                      </span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
