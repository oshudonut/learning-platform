"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, ChevronRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FlashCard } from "@/components/flashcard/FlashCard";
import type { Flashcard } from "@/lib/types";

export function CheckpointChallenge({
  documentId,
  checkpointIndex,
  onComplete,
}: {
  documentId: string;
  checkpointIndex: number;
  onComplete: () => void;
}) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      // Try to get existing cards first
      const getRes = await fetch("/api/checkpoint-flashcards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "get", documentId, checkpointIndex }),
      });
      const getData = await getRes.json();

      if (getData.cards?.length) {
        setCards(getData.cards);
      } else {
        // Generate new cards
        const genRes = await fetch("/api/checkpoint-flashcards", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "generate", documentId, checkpointIndex }),
        });
        const genData = await genRes.json();
        setCards(genData.cards ?? []);
      }
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [documentId, checkpointIndex]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  function handleNext() {
    setFlipped(false);
    if (current + 1 >= cards.length) {
      setDone(true);
    } else {
      setCurrent((c) => c + 1);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-primary/20 bg-primary/5 p-10 text-center space-y-4">
        <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto" />
        <div>
          <p className="font-semibold text-foreground">Generating Checkpoint {checkpointIndex + 1}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Creating targeted flashcards for what you just studied…
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border-2 border-success/30 bg-success/5 p-10 text-center space-y-4"
      >
        <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
        <div>
          <h3 className="text-lg font-bold text-foreground">
            Checkpoint {checkpointIndex + 1} Cleared!
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Great recall. Continue to the next section.
          </p>
        </div>
        <Button variant="accent" onClick={onComplete}>
          Continue
          <ChevronRight className="h-4 w-4" />
        </Button>
      </motion.div>
    );
  }

  if (!cards.length) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center space-y-4">
        <p className="text-muted-foreground">No checkpoint cards available.</p>
        <Button variant="outline" onClick={onComplete}>Skip Checkpoint</Button>
      </div>
    );
  }

  const card = cards[current];

  return (
    <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </div>
        <div>
          <p className="font-semibold text-foreground text-sm">
            Checkpoint {checkpointIndex + 1} of 5
          </p>
          <p className="text-xs text-muted-foreground">
            Card {current + 1} of {cards.length} — complete all to continue
          </p>
        </div>
      </div>

      <Progress value={current} max={cards.length} />

      {/* Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
        >
          <FlashCard card={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
        </motion.div>
      </AnimatePresence>

      {flipped ? (
        <div className="flex justify-center">
          <Button variant="accent" onClick={handleNext}>
            {current + 1 === cards.length ? "Complete Checkpoint" : "Next Card"}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={() => setFlipped(true)} className="text-muted-foreground">
            Reveal Answer
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
