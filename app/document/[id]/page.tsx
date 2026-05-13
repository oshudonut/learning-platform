"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Zap,
  Layers,
  MessageSquare,
  Loader2,
  AlertCircle,
  RefreshCw,
  FileText,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { Sidebar } from "@/components/layout/Sidebar";
import { ReviewerView } from "@/components/reviewer/ReviewerView";
import { QuizEngine } from "@/components/quiz/QuizEngine";
import { FlashcardStudy } from "@/components/flashcard/FlashcardStudy";
import { TutorChat } from "@/components/tutor/TutorChat";
import { Button } from "@/components/ui/button";
import type { Reviewer, Quiz, Flashcard } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "review" | "quiz" | "flashcards" | "tutor";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "review", label: "Review", icon: BookOpen },
  { id: "quiz", label: "Quiz", icon: Zap },
  { id: "flashcards", label: "Flashcards", icon: Layers },
  { id: "tutor", label: "AI Tutor", icon: MessageSquare },
];

type DocMeta = {
  id: string;
  title: string;
  filename: string;
  textLength: number;
  createdAt: number;
  hasReviewer: boolean;
  hasQuiz: boolean;
  hasFlashcards: boolean;
};

type LoadState<T> = { status: "idle" | "loading" | "success" | "error"; data?: T; error?: string };

function GenerateButton({
  label,
  onGenerate,
  loading,
}: {
  label: string;
  onGenerate: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <div className="h-14 w-14 rounded-full bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
        <FileText className="h-7 w-7 text-primary" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground">Not generated yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Generate your {label.toLowerCase()} with Claude AI — results are cached
        </p>
      </div>
      <Button variant="accent" onClick={onGenerate} disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating with Claude…
          </>
        ) : (
          <>
            <Zap className="h-4 w-4" />
            Generate {label}
          </>
        )}
      </Button>
      {loading && (
        <p className="text-xs text-muted-foreground">
          This usually takes 30–90 seconds depending on document size
        </p>
      )}
    </div>
  );
}

function DocumentPageInner() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(tabParam ?? "review");
  const [doc, setDoc] = useState<DocMeta | null>(null);
  const [docLoading, setDocLoading] = useState(true);

  const [reviewer, setReviewer] = useState<LoadState<Reviewer>>({ status: "idle" });
  const [quiz, setQuiz] = useState<LoadState<Quiz>>({ status: "idle" });
  const [flashcards, setFlashcards] = useState<LoadState<Flashcard[]>>({ status: "idle" });

  // Load document metadata
  useEffect(() => {
    fetch(`/api/document?id=${id}`)
      .then((r) => r.json())
      .then((data) => {
        setDoc(data.document);
        // Pre-load reviewer if available
        if (data.document?.hasReviewer) loadReviewer(false);
      })
      .catch(() => null)
      .finally(() => setDocLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadReviewer = useCallback(
    async (force = false) => {
      setReviewer({ status: "loading" });
      try {
        const res = await fetch("/api/reviewer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, force }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setReviewer({ status: "success", data: data.reviewer });
        if (!doc?.hasReviewer) setDoc((d) => d && { ...d, hasReviewer: true });
      } catch (err) {
        setReviewer({ status: "error", error: (err as Error).message });
      }
    },
    [id, doc],
  );

  const loadQuiz = useCallback(
    async (force = false) => {
      setQuiz({ status: "loading" });
      try {
        const res = await fetch("/api/quiz", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, force }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setQuiz({ status: "success", data: data.quiz });
        if (!doc?.hasQuiz) setDoc((d) => d && { ...d, hasQuiz: true });
      } catch (err) {
        setQuiz({ status: "error", error: (err as Error).message });
      }
    },
    [id, doc],
  );

  const loadFlashcards = useCallback(
    async (force = false) => {
      setFlashcards({ status: "loading" });
      try {
        const res = await fetch("/api/flashcards", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, force }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setFlashcards({ status: "success", data: data.flashcards });
        if (!doc?.hasFlashcards) setDoc((d) => d && { ...d, hasFlashcards: true });
      } catch (err) {
        setFlashcards({ status: "error", error: (err as Error).message });
      }
    },
    [id, doc],
  );

  // Auto-load when switching tabs
  useEffect(() => {
    if (activeTab === "review" && reviewer.status === "idle") {
      void loadReviewer();
    }
    if (activeTab === "quiz" && quiz.status === "idle") {
      // Don't auto-load quiz — let user choose
    }
    if (activeTab === "flashcards" && flashcards.status === "idle") {
      // Don't auto-load flashcards — let user choose
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (docLoading) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 ml-60 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </main>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 ml-60 flex flex-col items-center justify-center gap-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">Document not found</h2>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-8">
            <div className="flex items-start gap-4">
              <Link href="/library" className="flex-shrink-0 mt-1">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{doc.title}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {doc.filename} · {Math.round(doc.textLength / 1000)}k characters extracted
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {[
                { label: "Reviewed", active: doc.hasReviewer },
                { label: "Quiz ready", active: doc.hasQuiz },
                { label: "Flashcards", active: doc.hasFlashcards },
              ].map(({ label, active }) =>
                active ? (
                  <span
                    key={label}
                    className="text-xs bg-success/10 text-success border border-success/20 px-2.5 py-1 rounded-full"
                  >
                    ✓ {label}
                  </span>
                ) : null,
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 rounded-xl bg-secondary/50 p-1 mb-8 w-fit">
            {TABS.map(({ id: tabId, label, icon: Icon }) => (
              <button
                key={tabId}
                onClick={() => setActiveTab(tabId)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                  activeTab === tabId
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {/* REVIEW TAB */}
              {activeTab === "review" && (
                <div>
                  {reviewer.status === "idle" || reviewer.status === "loading" ? (
                    <div className="flex flex-col items-center gap-4 py-16">
                      <Loader2 className="h-8 w-8 text-primary animate-spin" />
                      <div className="text-center">
                        <p className="font-medium text-foreground">
                          Claude is building your reviewer…
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Analyzing structure, extracting concepts, building memory aids
                        </p>
                      </div>
                    </div>
                  ) : reviewer.status === "error" ? (
                    <div className="flex flex-col items-center gap-4 py-16">
                      <AlertCircle className="h-10 w-10 text-destructive" />
                      <div className="text-center">
                        <p className="font-semibold text-foreground">Generation failed</p>
                        <p className="text-sm text-muted-foreground mt-1">{reviewer.error}</p>
                      </div>
                      <Button variant="outline" onClick={() => loadReviewer(true)}>
                        <RefreshCw className="h-4 w-4" />
                        Try Again
                      </Button>
                    </div>
                  ) : reviewer.data ? (
                    <div>
                      <div className="flex justify-end mb-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadReviewer(true)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Regenerate
                        </Button>
                      </div>
                      <ReviewerView reviewer={reviewer.data} />
                    </div>
                  ) : null}
                </div>
              )}

              {/* QUIZ TAB */}
              {activeTab === "quiz" && (
                <div>
                  {quiz.status === "idle" ? (
                    <GenerateButton
                      label="Quiz"
                      onGenerate={() => loadQuiz()}
                      loading={false}
                    />
                  ) : quiz.status === "loading" ? (
                    <GenerateButton label="Quiz" onGenerate={() => {}} loading={true} />
                  ) : quiz.status === "error" ? (
                    <div className="flex flex-col items-center gap-4 py-16">
                      <AlertCircle className="h-10 w-10 text-destructive" />
                      <p className="text-sm text-muted-foreground">{quiz.error}</p>
                      <Button variant="outline" onClick={() => loadQuiz(true)}>
                        <RefreshCw className="h-4 w-4" />
                        Try Again
                      </Button>
                    </div>
                  ) : quiz.data ? (
                    <div>
                      <div className="flex justify-end mb-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadQuiz(true)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          New Quiz
                        </Button>
                      </div>
                      <QuizEngine
                        quiz={quiz.data}
                        documentId={doc.id}
                        documentTitle={doc.title}
                      />
                    </div>
                  ) : null}
                </div>
              )}

              {/* FLASHCARDS TAB */}
              {activeTab === "flashcards" && (
                <div>
                  {flashcards.status === "idle" ? (
                    <GenerateButton
                      label="Flashcards"
                      onGenerate={() => loadFlashcards()}
                      loading={false}
                    />
                  ) : flashcards.status === "loading" ? (
                    <GenerateButton label="Flashcards" onGenerate={() => {}} loading={true} />
                  ) : flashcards.status === "error" ? (
                    <div className="flex flex-col items-center gap-4 py-16">
                      <AlertCircle className="h-10 w-10 text-destructive" />
                      <p className="text-sm text-muted-foreground">{flashcards.error}</p>
                      <Button variant="outline" onClick={() => loadFlashcards(true)}>
                        <RefreshCw className="h-4 w-4" />
                        Try Again
                      </Button>
                    </div>
                  ) : flashcards.data ? (
                    <div>
                      <div className="flex items-center justify-between mb-6">
                        <p className="text-sm text-muted-foreground">
                          {flashcards.data.length} cards · SM-2 spaced repetition
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadFlashcards(true)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          New Deck
                        </Button>
                      </div>
                      <FlashcardStudy
                        cards={flashcards.data}
                        documentId={doc.id}
                        documentTitle={doc.title}
                      />
                    </div>
                  ) : null}
                </div>
              )}

              {/* TUTOR TAB */}
              {activeTab === "tutor" && (
                <TutorChat documentId={doc.id} documentTitle={doc.title} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default function DocumentPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 ml-60 flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </main>
      </div>
    }>
      <DocumentPageInner />
    </Suspense>
  );
}
