"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Trophy, Swords, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/components/auth/AuthProvider";
import type { MatchRoom, MatchParticipant, MatchAnswer } from "@/lib/types";

type AnswerResult = { gotPoint: boolean; isCorrect: boolean; correctAnswer: string } | null;

export default function MatchPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [match, setMatch] = useState<MatchRoom | null>(null);
  const [participants, setParticipants] = useState<MatchParticipant[]>([]);
  const [answers, setAnswers] = useState<MatchAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);
  const [readying, setReadying] = useState(false);

  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerResult, setAnswerResult] = useState<AnswerResult>(null);
  const [submitting, setSubmitting] = useState(false);
  const answeredQuestions = useRef<Set<number>>(new Set());

  const fetchState = useCallback(async () => {
    const res = await fetch(`/api/match/${params.id}`);
    if (!res.ok) { setError("Match not found"); setLoading(false); return; }
    const data = await res.json();
    setMatch(data.match);
    setParticipants(data.participants ?? []);
    setAnswers(data.answers ?? []);
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Auto-join if user is authenticated but not yet a participant (e.g. navigated directly to URL)
  useEffect(() => {
    if (!user || !match || match.status !== "waiting") return;
    const isParticipant = participants.some((p) => p.userId === user.id);
    if (isParticipant || participants.length >= 2) return;
    fetch(`/api/match/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode: match.roomCode }),
    }).then(() => fetchState());
  }, [user, match?.id, match?.status, participants.length, fetchState]);

  // Poll while active or waiting
  useEffect(() => {
    if (!match || match.status === "completed") return;
    const interval = setInterval(fetchState, 1000);
    return () => clearInterval(interval);
  }, [match?.status, fetchState]);

  // Clear answer UI when question advances
  useEffect(() => {
    if (!match) return;
    const idx = match.currentQuestionIndex;
    if (!answeredQuestions.current.has(idx)) {
      setSelectedAnswer(null);
      setAnswerResult(null);
    }
  }, [match?.currentQuestionIndex]);

  async function handleReady() {
    setReadying(true);
    await fetch(`/api/match/${params.id}/ready`, { method: "POST" });
    setReadying(false);
    fetchState();
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
    const data = await res.json() as AnswerResult & { error?: string };
    setSubmitting(false);
    if (!res.ok) return;
    setAnswerResult(data);
    fetchState();
  }

  function copyCode() {
    if (!match) return;
    navigator.clipboard.writeText(match.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const me = participants.find((p) => p.userId === user?.id);
  const opponent = participants.find((p) => p.userId !== user?.id);

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
          <button onClick={() => router.push("/compete")} className="text-sm text-indigo-400 hover:underline">
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

        {match.status === "waiting" && <LobbyView match={match} participants={participants} me={me} onReady={handleReady} readying={readying} onCopy={copyCode} copied={copied} />}
        {match.status === "active" && <RaceView match={match} participants={participants} answers={answers} me={me} opponent={opponent} selectedAnswer={selectedAnswer} answerResult={answerResult} onAnswer={handleAnswer} submitting={submitting} />}
        {match.status === "completed" && <ResultsView match={match} participants={participants} answers={answers} me={me} opponent={opponent} onPlayAgain={() => router.push("/compete")} />}
      </div>
    </AppShell>
  );
}

// ─── Lobby ────────────────────────────────────────────────────────────────────

function LobbyView({ match, participants, me, onReady, readying, onCopy, copied }: {
  match: MatchRoom;
  participants: MatchParticipant[];
  me?: MatchParticipant;
  onReady: () => void;
  readying: boolean;
  onCopy: () => void;
  copied: boolean;
}) {
  const slots = [participants[0], participants[1]];
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gray-800 border border-gray-700 p-8 text-center">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-2">Room Code</p>
        <div className="flex items-center justify-center gap-3 mb-6">
          <span className="text-5xl font-mono font-bold text-white tracking-widest">{match.roomCode}</span>
          <button onClick={onCopy} className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors text-gray-400">
            {copied ? <Check className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5" />}
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-6">Share this code with your opponent</p>

        {/* Player slots */}
        <div className="flex items-center justify-center gap-6 mb-6">
          {slots.map((p, i) => (
            <div key={i} className="flex flex-col items-center gap-2 w-32">
              {p ? (
                <>
                  <div className="h-12 w-12 rounded-full bg-indigo-600 flex items-center justify-center text-white text-lg font-bold">
                    {(p.profile?.displayName || "?")[0].toUpperCase()}
                  </div>
                  <p className="text-sm text-white font-medium truncate w-full text-center">{p.profile?.displayName ?? "Player"}</p>
                  {p.isReady
                    ? <span className="text-xs text-emerald-400 flex items-center gap-1"><Check className="h-3 w-3" /> Ready</span>
                    : <span className="text-xs text-gray-500">Waiting...</span>
                  }
                </>
              ) : (
                <>
                  <div className="h-12 w-12 rounded-full bg-gray-700 border-2 border-dashed border-gray-600 flex items-center justify-center animate-pulse">
                    <span className="text-gray-600 text-lg">?</span>
                  </div>
                  <p className="text-sm text-gray-600">Waiting...</p>
                </>
              )}
            </div>
          ))}
          {slots[0] && slots[1] && (
            <div className="absolute">
              <Swords className="h-6 w-6 text-gray-600" />
            </div>
          )}
        </div>

        <button
          onClick={onReady}
          disabled={readying || me?.isReady}
          className="w-full max-w-xs mx-auto rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 transition-colors flex items-center justify-center gap-2"
        >
          {me?.isReady ? <><Check className="h-4 w-4" /> You&apos;re Ready!</> : readying ? "Readying up..." : "Ready Up"}
        </button>

        <p className="text-xs text-gray-500 mt-3">Game starts automatically when both players are ready</p>
      </div>
    </div>
  );
}

// ─── Race Game ────────────────────────────────────────────────────────────────

function RaceView({ match, participants, answers, me, opponent, selectedAnswer, answerResult, onAnswer, submitting }: {
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
  const q = match.quizSnapshot[match.currentQuestionIndex];
  if (!q) return null;

  const correctAnswer = q.choices[q.correctIndex];
  const opponentAnswered = answers.some(
    (a) => a.questionIndex === match.currentQuestionIndex && a.userId === opponent?.userId
  );

  function choiceClass(choice: string) {
    const base = "w-full text-left rounded-xl border px-5 py-4 text-sm font-medium transition-all ";
    if (!selectedAnswer) return base + "border-gray-600 bg-gray-700/50 text-white hover:border-indigo-400 hover:bg-indigo-500/10";
    if (choice === correctAnswer) return base + "border-emerald-500 bg-emerald-500/10 text-emerald-300";
    if (choice === selectedAnswer && choice !== correctAnswer) return base + "border-red-500 bg-red-500/10 text-red-300";
    return base + "border-gray-700 bg-gray-800 text-gray-500";
  }

  return (
    <div className="space-y-4">
      {/* Scoreboard */}
      <div className="rounded-2xl bg-gray-800 border border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <p className="text-xs text-gray-500 mb-1">{me?.profile?.displayName ?? "You"}</p>
            <p className="text-3xl font-bold text-white">{me?.score ?? 0}</p>
          </div>
          <div className="text-center px-4">
            <Swords className="h-5 w-5 text-gray-500 mx-auto" />
            <p className="text-xs text-gray-600 mt-1">{match.currentQuestionIndex + 1} / {match.totalQuestions}</p>
          </div>
          <div className="text-center flex-1">
            <p className="text-xs text-gray-500 mb-1">{opponent?.profile?.displayName ?? "Opponent"}</p>
            <p className="text-3xl font-bold text-white">{opponent?.score ?? 0}</p>
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
          <p className="text-lg font-semibold text-white leading-snug">{q.question}</p>

          {answerResult && (
            <div className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
              answerResult.gotPoint ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" :
              answerResult.isCorrect ? "bg-amber-500/15 text-amber-300 border border-amber-500/30" :
              "bg-red-500/15 text-red-300 border border-red-500/30"
            }`}>
              {answerResult.gotPoint ? "You got the point!" :
               answerResult.isCorrect ? "Correct, but opponent was faster!" :
               `Wrong. Correct: ${answerResult.correctAnswer}`}
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
            <p className="text-xs text-amber-400">Opponent answered — hurry!</p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Results ──────────────────────────────────────────────────────────────────

function ResultsView({ match, participants, answers, me, opponent, onPlayAgain }: {
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
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring" }}>
          <Trophy className={`h-12 w-12 mx-auto mb-3 ${isTie ? "text-gray-400" : iWon ? "text-amber-400" : "text-gray-500"}`} />
          <h2 className="text-2xl font-bold text-white mb-1">
            {isTie ? "It's a Tie!" : iWon ? "You Win!" : `${opponent?.profile?.displayName ?? "Opponent"} Wins!`}
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            {me?.profile?.displayName ?? "You"} {myScore} — {oppScore} {opponent?.profile?.displayName ?? "Opponent"}
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
        <h3 className="text-sm font-semibold text-white mb-4">Question Breakdown</h3>
        <div className="space-y-3">
          {match.quizSnapshot.map((q, i) => {
            const pointAnswer = answers.find((a) => a.questionIndex === i && a.gotPoint);
            const myAnswer = answers.find((a) => a.questionIndex === i && a.userId === me?.userId);
            const pointWinner = pointAnswer ? participants.find((p) => p.userId === pointAnswer.userId) : null;
            return (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="text-gray-600 w-5 flex-shrink-0 text-right">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-300 truncate">{q.question}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {pointWinner
                      ? <span className="text-emerald-400">{pointWinner.userId === me?.userId ? "You" : pointWinner.profile?.displayName} got the point</span>
                      : <span className="text-gray-600">No one got the point</span>
                    }
                    {myAnswer && !myAnswer.isCorrect && <span className="text-red-400 ml-2">· You answered wrong</span>}
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
