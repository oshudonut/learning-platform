"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ThumbsUp,
  ThumbsDown,
  Minus,
  RotateCcw,
  Trophy,
  ChevronRight,
  Lightbulb,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Flashcard, FlashcardReviewState, LearningMethod } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MethodBadge, getMethodHint } from "@/lib/learning-methods";

// SM-2 algorithm
function sm2(state: FlashcardReviewState, quality: number): FlashcardReviewState {
  const q = Math.max(0, Math.min(5, quality));
  const newEase = Math.max(
    1.3,
    state.easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02),
  );

  let newInterval: number;
  if (q < 3) {
    newInterval = 1;
  } else if (state.repetitions === 0) {
    newInterval = 1;
  } else if (state.repetitions === 1) {
    newInterval = 6;
  } else {
    newInterval = Math.round(state.interval * newEase);
  }

  return {
    ...state,
    interval: newInterval,
    easeFactor: newEase,
    repetitions: q < 3 ? 0 : state.repetitions + 1,
    nextReview: Date.now() + newInterval * 86_400_000,
    lastQuality: q,
  };
}

function initStates(cards: Flashcard[]): FlashcardReviewState[] {
  return cards.map((_, i) => ({
    cardIndex: i,
    interval: 1,
    easeFactor: 2.5,
    repetitions: 0,
    nextReview: Date.now(),
    lastQuality: 0,
  }));
}

function FlashCard({
  card,
  flipped,
  onFlip,
}: {
  card: Flashcard;
  flipped: boolean;
  onFlip: () => void;
}) {
  const diffVariant = { easy: "easy", medium: "medium", hard: "hard" } as const;

  return (
    <div
      className="perspective-1000 w-full cursor-pointer"
      style={{ perspective: "1000px" }}
      onClick={onFlip}
    >
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        className="relative w-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Front */}
        <div
          className="w-full rounded-2xl border border-sky-200/60 bg-[#D8ECF4] p-8 text-center"
          style={{ backfaceVisibility: "hidden", minHeight: "240px" }}
        >
          <div className="flex flex-col items-center justify-center h-full min-h-[160px] gap-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={diffVariant[card.difficulty]}>{card.difficulty}</Badge>
              <Badge variant="outline">{card.topic}</Badge>
            </div>
            <p className="text-lg font-medium text-foreground leading-relaxed">
              {card.front}
            </p>
            {card.hint && !flipped && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                <Lightbulb className="h-3 w-3" />
                <span>{card.hint}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-auto">
              <Eye className="h-3 w-3" />
              <span>Click to reveal answer</span>
            </div>
          </div>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 w-full rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            minHeight: "240px",
          }}
        >
          <div className="flex flex-col items-center justify-center h-full min-h-[160px] gap-4">
            <p className="text-base text-foreground/90 leading-relaxed">
              {card.back}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function FlashcardStudy({
  cards,
  documentId,
  documentTitle,
  initialStates,
  learningMethod = null,
  onSessionComplete,
}: {
  cards: Flashcard[];
  documentId: string;
  documentTitle: string;
  initialStates?: FlashcardReviewState[];
  learningMethod?: LearningMethod | null;
  onSessionComplete?: () => void;
}) {
  const [states, setStates] = useState<FlashcardReviewState[]>(
    () => initialStates ?? initStates(cards),
  );
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionResults, setSessionResults] = useState<number[]>([]); // quality scores
  const [done, setDone] = useState(false);

  const card = cards[current];
  const methodHint = getMethodHint(learningMethod, "flashcard");

  const handleFlip = useCallback(() => setFlipped((f) => !f), []);

  function handleQuality(quality: number) {
    const newStates = [...states];
    newStates[current] = sm2(states[current], quality);
    setStates(newStates);
    setSessionResults((r) => [...r, quality]);
    setFlipped(false);

    if (current + 1 >= cards.length) {
      finishSession(newStates, [...sessionResults, quality]);
    } else {
      setCurrent((c) => c + 1);
    }
  }

  async function finishSession(
    finalStates: FlashcardReviewState[],
    results: number[],
  ) {
    setDone(true);

    // Save review states
    await fetch(`/api/flashcard-states`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ documentId, states: finalStates }),
    }).catch(() => null);

    // Record session analytics
    const avgQuality = results.reduce((a, b) => a + b, 0) / results.length;
    await fetch("/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "flashcard_session",
        data: {
          documentId,
          documentTitle,
          cardsStudied: results.length,
          avgQuality,
          completedAt: Date.now(),
        },
      }),
    }).catch(() => null);

    // Notify parent that a full session was completed (used to gate quiz unlock)
    onSessionComplete?.();
  }

  function handleRestart() {
    setCurrent(0);
    setFlipped(false);
    setSessionResults([]);
    setDone(false);
    setStates(initStates(cards));
  }

  if (done) {
    const avgQ = sessionResults.reduce((a, b) => a + b, 0) / sessionResults.length;
    const mastery = Math.round((avgQ / 5) * 100);
    const knew = sessionResults.filter((q) => q >= 3).length;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center space-y-8"
      >
        <div className="space-y-3">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/20">
            <Trophy className="h-10 w-10 text-primary" />
          </div>
          <div>
            <h2 className="text-3xl font-bold gradient-text">Session Complete</h2>
            <p className="text-muted-foreground mt-1">
              You reviewed all {cards.length} cards
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Cards Reviewed", value: cards.length },
            { label: "Knew Well", value: `${knew}/${cards.length}` },
            { label: "Mastery", value: `${mastery}%` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-sky-200/60 bg-[#D8ECF4] p-4">
              <div className="text-2xl font-bold text-foreground">{value}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </div>
          ))}
        </div>

        <Progress value={mastery} color={mastery >= 80 ? "success" : mastery >= 60 ? "primary" : "warning"} className="h-3" />

        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={handleRestart}>
            <RotateCcw className="h-4 w-4" />
            Study Again
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center justify-between text-sm text-muted-foreground gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span>
            Card {current + 1} of {cards.length}
          </span>
          <MethodBadge method={learningMethod} />
        </div>
        <span>{sessionResults.filter((q) => q >= 3).length} known</span>
      </div>
      <Progress value={current} max={cards.length} />

      {methodHint && (
        <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <Lightbulb className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground italic leading-relaxed">{methodHint}</p>
        </div>
      )}

      {/* Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
        >
          <FlashCard card={card} flipped={flipped} onFlip={handleFlip} />
        </motion.div>
      </AnimatePresence>

      {/* Controls — shown after flip */}
      <AnimatePresence>
        {flipped && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="space-y-3"
          >
            <p className="text-center text-sm text-muted-foreground">
              How well did you know this?
            </p>
            <div className="flex items-center gap-3 justify-center">
              <Button
                variant="outline"
                className="flex-1 border-destructive/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
                onClick={() => handleQuality(1)}
              >
                <ThumbsDown className="h-4 w-4" />
                Didn&apos;t know
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleQuality(3)}
              >
                <Minus className="h-4 w-4" />
                Almost
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-success/30 hover:bg-success/10 hover:text-success hover:border-success/50"
                onClick={() => handleQuality(5)}
              >
                <ThumbsUp className="h-4 w-4" />
                Got it!
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!flipped && (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={handleFlip} className="text-muted-foreground">
            Reveal Answer
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
