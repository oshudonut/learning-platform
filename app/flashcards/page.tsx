"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Layers, Plus, ArrowRight, Trophy, Loader2 } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type DocWithCards = {
  id: string;
  title: string;
  flashcardCount: number;
  hasFlashcards: boolean;
};

export default function FlashcardsPage() {
  const [docs, setDocs] = useState<DocWithCards[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/library")
      .then((r) => r.json())
      .then((data) => setDocs(data.documents ?? []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const withCards = docs.filter((d) => d.hasFlashcards);
  const withoutCards = docs.filter((d) => !d.hasFlashcards);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Flashcards</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Spaced repetition · SM-2 algorithm · Long-term retention
              </p>
            </div>
            <Link href="/">
              <Button variant="accent">
                <Plus className="h-4 w-4" />
                Upload Document
              </Button>
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center text-center py-24 gap-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <Layers className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">No documents yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload a document to generate flashcard decks
                </p>
              </div>
              <Link href="/">
                <Button variant="accent">Get started</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Decks ready to study */}
              {withCards.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                    Ready to Study
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {withCards.map((doc, i) => (
                      <motion.div
                        key={doc.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                      >
                        <Link href={`/document/${doc.id}?tab=flashcards`}>
                          <div className="group rounded-xl border border-border bg-card p-5 card-hover space-y-4">
                            <div className="flex items-start justify-between">
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 ring-1 ring-sky-500/20">
                                <Layers className="h-5 w-5 text-sky-400" />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {doc.flashcardCount} cards
                              </span>
                            </div>
                            <div>
                              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors text-sm">
                                {doc.title}
                              </h3>
                              <div className="mt-3 space-y-1.5">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Deck size</span>
                                  <span>{doc.flashcardCount} cards</span>
                                </div>
                                <Progress value={doc.flashcardCount} max={25} color="primary" />
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                              <span>Study now</span>
                              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents without cards */}
              {withoutCards.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                    Generate Flashcards
                  </h2>
                  <div className="space-y-2">
                    {withoutCards.map((doc) => (
                      <Link key={doc.id} href={`/document/${doc.id}?tab=flashcards`}>
                        <div className="flex items-center gap-4 rounded-xl border border-dashed border-border bg-card/50 px-5 py-4 hover:border-primary/20 hover:bg-card transition-all group">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                            <Trophy className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <span className="flex-1 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                            {doc.title}
                          </span>
                          <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                            Generate →
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
