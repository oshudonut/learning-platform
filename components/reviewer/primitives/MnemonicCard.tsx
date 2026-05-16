"use client";

import { Star } from "lucide-react";

interface MnemonicCardProps {
  concept: string;
  aid: string;
}

export function MnemonicCard({ concept, aid }: MnemonicCardProps) {
  return (
    <div className="rounded-xl border border-primary/20 bg-card p-4 space-y-1.5">
      <div className="flex items-center gap-2">
        <Star className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-semibold text-foreground">{concept}</span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed pl-5">{aid}</p>
    </div>
  );
}
