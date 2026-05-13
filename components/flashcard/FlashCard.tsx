"use client";

import { motion } from "framer-motion";
import { Lightbulb, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Flashcard } from "@/lib/types";

export function FlashCard({
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
