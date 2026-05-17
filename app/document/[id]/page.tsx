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
  Lock,
  Star,
  Download,
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ReviewerView } from "@/components/reviewer/ReviewerView";
import { MethodSelection } from "@/components/reviewer/MethodSelection";
import { QuizEngine } from "@/components/quiz/QuizEngine";
import { FlashcardStudy } from "@/components/flashcard/FlashcardStudy";
import { TutorChat } from "@/components/tutor/TutorChat";
import { Button } from "@/components/ui/button";
import type { AnyReviewer, Flashcard, DocumentProgression, ExtendedQuizQuestion, QuizDifficultyLevel, LearningMethod, StudyMode } from "@/lib/types";
import type { ReviewerHighlight } from "@/lib/store";
import { cn } from "@/lib/utils";

type Tab = "review" | "quiz" | "flashcards" | "tutor";

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

function GenerateButton({ label, onGenerate, loading }: { label: string; onGenerate: () => void; loading: boolean }) {
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
          <><Loader2 className="h-4 w-4 animate-spin" />Generating with Claude…</>
        ) : (
          <><Zap className="h-4 w-4" />Generate {label}</>
        )}
      </Button>
      {loading && (
        <p className="text-xs text-muted-foreground">This usually takes 30–90 seconds depending on document size</p>
      )}
    </div>
  );
}

function QuizLockedState({ progression }: { progression: DocumentProgression | null }) {
  const completedSections = progression?.sectionStatuses.filter(s => s.completed).length ?? 0;
  const totalSections = progression?.sectionStatuses.length ?? 0;
  const allSectionsDone = completedSections === totalSections && totalSections > 0;
  const flashcardsDone = progression?.flashcardChallengeCompleted ?? false;

  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
        <Lock className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h3 className="font-semibold text-foreground text-lg">Quiz Locked</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
          Complete the reviewer and flashcard challenge to unlock Quiz Mode.
        </p>
      </div>
      <div className="flex gap-6 text-sm">
        <div className="text-center">
          <div className={cn("text-2xl font-bold", allSectionsDone ? "text-success" : "text-foreground")}>
            {completedSections}/{totalSections}
          </div>
          <div className="text-muted-foreground text-xs mt-0.5">Sections</div>
        </div>
        <div className="w-px bg-border" />
        <div className="text-center">
          <div className={cn("text-2xl font-bold", flashcardsDone ? "text-success" : "text-foreground")}>
            {flashcardsDone ? "Done" : "—"}
          </div>
          <div className="text-muted-foreground text-xs mt-0.5">Flashcard Challenge</div>
        </div>
      </div>
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

  const [reviewer, setReviewer] = useState<LoadState<AnyReviewer>>({ status: "idle" });
  const [quiz, setQuiz] = useState<LoadState<{ questions: ExtendedQuizQuestion[] }>>({ status: "idle" });
  const [flashcards, setFlashcards] = useState<LoadState<Flashcard[]>>({ status: "idle" });
  const [progression, setProgression] = useState<DocumentProgression | null>(null);
  const [remediationActive, setRemediationActive] = useState(false);
  const [notes, setNotes] = useState<Map<number, { noteText: string; confusionLevel: number | null }>>(new Map());
  const [highlights, setHighlights] = useState<ReviewerHighlight[]>([]);
  // reviewerKey increments on freshProgression — forces ReviewerView remount to clear stale localIdx
  const [reviewerKey, setReviewerKey] = useState(0);
  // stored so the "Try Again" error-retry button can pass method/mode to the reviewer API
  const [pendingMethod, setPendingMethod] = useState<LearningMethod | null>(null);
  const [pendingMode, setPendingMode] = useState<StudyMode | null>(null);

  // Load document metadata + progression
  useEffect(() => {
    fetch(`/api/document?id=${id}`)
      .then((r) => r.json())
      .then((data) => {
        setDoc(data.document);
        if (data.document?.hasReviewer) loadReviewer(false);
      })
      .catch(() => null)
      .finally(() => setDocLoading(false));

    // Load progression
    fetch("/api/progression", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "get", documentId: id }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.progression) {
          setProgression(data.progression);
          setRemediationActive(data.progression.remediationActive);
        }
      })
      .catch(() => null);

    // Load notes (non-blocking — failure is silently ignored)
    fetch(`/api/notes?documentId=${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.notes)) {
          const map = new Map<number, { noteText: string; confusionLevel: number | null }>();
          for (const n of data.notes) {
            map.set(n.topicIndex as number, { noteText: n.noteText as string, confusionLevel: (n.confusionLevel as number | null) ?? null });
          }
          setNotes(map);
        }
      })
      .catch(() => null);

    // Load highlights (non-blocking)
    fetch(`/api/highlights?documentId=${id}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data.highlights)) setHighlights(data.highlights as ReviewerHighlight[]); })
      .catch(() => null);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadReviewer = useCallback(async (force = false, method?: LearningMethod, mode?: StudyMode) => {
    setReviewer({ status: "loading" });
    try {
      const res = await fetch("/api/reviewer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, force, learningMethod: method, studyMode: mode }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setReviewer({ status: "success", data: data.reviewer });
      if (!doc?.hasReviewer) setDoc((d) => d && { ...d, hasReviewer: true });

      if (data.freshProgression) {
        // Reviewer API reset progression — apply the fresh state directly without
        // a server re-fetch so rebuildSectionStatuses can't restore old completed state.
        setProgression(data.freshProgression);
        setRemediationActive(data.freshProgression.remediationActive ?? false);
        // Force ReviewerView remount so useState(serverIdx) reinitializes from 0,
        // not from the stale localIdx value the old instance held.
        setReviewerKey((k) => k + 1);
        // Refetch highlights to reflect stale status set by the reviewer API
        fetch(`/api/highlights?documentId=${id}`)
          .then((r) => r.json())
          .then((d) => { if (Array.isArray(d.highlights)) setHighlights(d.highlights as ReviewerHighlight[]); })
          .catch(() => null);
      } else if (force || !progression) {
        // Re-fetch progression after force-regeneration (error retry) or initial load
        const progRes = await fetch("/api/progression", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "get", documentId: id }),
        });
        const progData = await progRes.json();
        if (progData.progression) {
          setProgression(progData.progression);
          setRemediationActive(progData.progression.remediationActive);
        }
      }
    } catch (err) {
      setReviewer({ status: "error", error: (err as Error).message });
    }
  }, [id, doc, progression]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMethodSelect = useCallback(async (method: LearningMethod, mode: StudyMode) => {
    // Store method/mode so the error-retry "Try Again" path can pass them to the API
    setPendingMethod(method);
    setPendingMode(mode);
    // Save profile to progression first, then generate reviewer
    await fetch("/api/progression", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save_learning_profile", documentId: id, learningMethod: method, studyMode: mode }),
    }).catch(() => null);
    await loadReviewer(true, method, mode);
  }, [id, loadReviewer]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadQuiz = useCallback(async (force = false) => {
    setQuiz({ status: "loading" });
    try {
      const difficultyLevel: QuizDifficultyLevel = progression?.currentDifficultyLevel ?? "beginner";
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, force, difficultyLevel }),
      });
      if (res.status === 423) {
        setQuiz({ status: "error", error: "locked" });
        return;
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQuiz({ status: "success", data: data.quiz });
      if (!doc?.hasQuiz) setDoc((d) => d && { ...d, hasQuiz: true });
    } catch (err) {
      setQuiz({ status: "error", error: (err as Error).message });
    }
  }, [id, doc, progression]);

  const loadFlashcards = useCallback(async (force = false) => {
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
  }, [id, doc]);

  const handleSectionComplete = useCallback(async (sectionIndex: number) => {
    const res = await fetch("/api/progression", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "complete_section", documentId: id, sectionIndex }),
    });
    const data = await res.json();
    if (data.progression) setProgression(data.progression);
  }, [id]);

  // Called when the reviewer's "complete" screen CTA is clicked — switches to
  // the flashcards tab and auto-loads cards if not already loaded.
  const handleStartFlashcards = useCallback(async () => {
    setActiveTab("flashcards");
    if (flashcards.status === "idle") {
      void loadFlashcards();
    }
  }, [flashcards.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Called when a flashcard session finishes — marks the challenge complete
  // server-side, which in turn sets quizUnlocked when all sections are done.
  const handleFlashcardChallengeComplete = useCallback(async () => {
    const res = await fetch("/api/progression", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "complete_flashcard_challenge", documentId: id }),
    });
    const data = await res.json();
    if (data.progression) {
      setProgression(data.progression);
    }
  }, [id]);

  const handleQuizComplete = useCallback(async (passed: boolean, weakTopics: string[]) => {
    const progRes = await fetch("/api/progression", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "get", documentId: id }),
    });
    const progData = await progRes.json();
    if (progData.progression) {
      setProgression(progData.progression);
      setRemediationActive(progData.progression.remediationActive);
    }
    if (!passed && weakTopics.length > 0) {
      setRemediationActive(true);
    }
  }, [id]);

  useEffect(() => {
    if (activeTab === "review" && reviewer.status === "idle") {
      void loadReviewer();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (docLoading) {
    return (
      <AppShell mainClassName="flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </AppShell>
    );
  }

  if (!doc) {
    return (
      <AppShell mainClassName="flex flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold">Document not found</h2>
        <Link href="/"><Button variant="outline"><ArrowLeft className="h-4 w-4" />Back to Home</Button></Link>
      </AppShell>
    );
  }

  const quizLocked = progression ? !progression.quizUnlocked : false;

  const TABS = [
    { id: "review" as Tab, label: "Review", icon: BookOpen },
    {
      id: "quiz" as Tab,
      label: "Quiz",
      icon: quizLocked ? Lock : Zap,
      locked: quizLocked,
    },
    { id: "flashcards" as Tab, label: "Flashcards", icon: Layers },
    { id: "tutor" as Tab, label: "AI Tutor", icon: MessageSquare },
  ];

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-6 sm:mb-8">
            <div className="flex items-start gap-3 min-w-0">
              <Link href="/library" className="flex-shrink-0 mt-1">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground break-words">{doc.title}</h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">
                  {doc.filename} · {Math.round(doc.textLength / 1000)}k characters extracted
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5 flex-shrink-0 max-w-[40%] sm:max-w-none">
              {progression?.masteredAt && (
                <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 sm:px-2.5 py-1 rounded-full flex items-center gap-1 whitespace-nowrap">
                  <Star className="h-3 w-3" /> Mastered
                </span>
              )}
              {progression && (
                <span className="text-xs bg-primary/10 text-primary border border-primary/15 px-2 sm:px-2.5 py-1 rounded-full whitespace-nowrap">
                  {progression.sectionStatuses.filter(s => s.completed).length}/{progression.sectionStatuses.length} sections
                </span>
              )}
              {doc.hasFlashcards && (
                <span className="text-xs bg-success/10 text-success border border-success/20 px-2 sm:px-2.5 py-1 rounded-full whitespace-nowrap">
                  ✓ Cards
                </span>
              )}
              {progression?.quizUnlocked && doc.hasReviewer && (
                <div className="flex items-center gap-1.5">
                  <a href={`/api/export?id=${doc.id}`} download title="Download reviewer as DOCX">
                    <Button variant="outline" size="sm" className="gap-1 sm:gap-1.5 px-2 sm:px-3 min-h-[36px]">
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">DOCX</span>
                    </Button>
                  </a>
                  <a href={`/api/export/pdf?id=${doc.id}`} download title="Download reviewer as PDF">
                    <Button variant="outline" size="sm" className="gap-1 sm:gap-1.5 px-2 sm:px-3 min-h-[36px]">
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">PDF</span>
                    </Button>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Tabs — horizontally scrollable on mobile */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-1 rounded-xl bg-secondary/50 p-1 w-full overflow-x-auto scrollbar-none sm:w-fit">
              {TABS.map(({ id: tabId, label, icon: Icon, locked }) => (
                <button
                  key={tabId}
                  onClick={() => setActiveTab(tabId)}
                  title={locked ? "Complete all reviewer sections and flashcard checkpoints to unlock Quiz Mode." : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 sm:px-4 py-2 text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 min-h-[44px]",
                    activeTab === tabId
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                    locked && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
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
                  {reviewer.status === "idle" ? (
                    <MethodSelection onGenerate={handleMethodSelect} />
                  ) : reviewer.status === "loading" ? (
                    <div className="flex flex-col items-center gap-4 py-16">
                      <Loader2 className="h-8 w-8 text-primary animate-spin" />
                      <div className="text-center">
                        <p className="font-medium text-foreground">Claude is building your adaptive reviewer…</p>
                        <p className="text-sm text-muted-foreground mt-1">Applying your learning method and study mode</p>
                      </div>
                    </div>
                  ) : reviewer.status === "error" ? (
                    <div className="flex flex-col items-center gap-4 py-16">
                      <AlertCircle className="h-10 w-10 text-destructive" />
                      <div className="text-center">
                        <p className="font-semibold text-foreground">Generation failed</p>
                        <p className="text-sm text-muted-foreground mt-1">{reviewer.error}</p>
                      </div>
                      <Button variant="outline" onClick={() => loadReviewer(true, pendingMethod ?? undefined, pendingMode ?? undefined)}>
                        <RefreshCw className="h-4 w-4" />Try Again
                      </Button>
                    </div>
                  ) : reviewer.data ? (
                    <div>
                      <div className="flex justify-end mb-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm("Regenerating will reset your section progress. Continue?")) {
                              setReviewer({ status: "idle" });
                              setProgression(null);
                              setRemediationActive(false);
                            }
                          }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />Regenerate
                        </Button>
                      </div>
                      {highlights.some((h) => h.isStale) && (
                        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                          <span className="font-semibold">Some highlights are stale</span>
                          <span className="text-amber-600/80 dark:text-amber-500/80">— the reviewer was regenerated. Click stale highlights to remove them.</span>
                        </div>
                      )}
                      <ReviewerView
                        key={reviewerKey}
                        reviewer={reviewer.data}
                        progression={progression ?? undefined}
                        documentId={id}
                        learningMethod={progression?.learningMethod}
                        studyMode={progression?.studyMode}
                        notes={notes}
                        highlights={highlights}
                        onHighlightCreated={(h) => setHighlights((prev) => [...prev, h])}
                        onHighlightDeleted={(hId) => setHighlights((prev) => prev.filter((h) => h.id !== hId))}
                        onSectionComplete={handleSectionComplete}
                        onStartFlashcards={handleStartFlashcards}
                      />
                    </div>
                  ) : null}
                </div>
              )}

              {/* QUIZ TAB */}
              {activeTab === "quiz" && (
                <div>
                  {quizLocked ? (
                    <QuizLockedState progression={progression} />
                  ) : remediationActive ? (
                    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 space-y-4">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        <h3 className="font-semibold text-foreground">Remediation Mode</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        You need to review your weak areas before retrying the quiz. Go to the Review tab to study the remediation material.
                      </p>
                      <div className="flex gap-3">
                        <Button variant="outline" onClick={() => setActiveTab("review")}>
                          <BookOpen className="h-4 w-4" />Go to Review
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={async () => {
                            await fetch("/api/remediation", {
                              method: "POST",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ action: "complete", documentId: id }),
                            });
                            setRemediationActive(false);
                            const progRes = await fetch("/api/progression", {
                              method: "POST",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ action: "get", documentId: id }),
                            });
                            const progData = await progRes.json();
                            if (progData.progression) setProgression(progData.progression);
                          }}
                        >
                          Skip Remediation
                        </Button>
                      </div>
                    </div>
                  ) : quiz.status === "idle" ? (
                    <GenerateButton label="Quiz" onGenerate={() => void loadQuiz()} loading={false} />
                  ) : quiz.status === "loading" ? (
                    <GenerateButton label="Quiz" onGenerate={() => {}} loading={true} />
                  ) : quiz.status === "error" ? (
                    <div className="flex flex-col items-center gap-4 py-16">
                      <AlertCircle className="h-10 w-10 text-destructive" />
                      <p className="text-sm text-muted-foreground">{quiz.error}</p>
                      <Button variant="outline" onClick={() => void loadQuiz(true)}>
                        <RefreshCw className="h-4 w-4" />Try Again
                      </Button>
                    </div>
                  ) : quiz.data ? (
                    <div>
                      <div className="flex justify-end mb-4">
                        <Button variant="ghost" size="sm" onClick={() => void loadQuiz(true)} className="text-muted-foreground hover:text-foreground">
                          <RefreshCw className="h-3.5 w-3.5" />New Quiz
                        </Button>
                      </div>
                      <QuizEngine
                        quiz={quiz.data}
                        documentId={doc.id}
                        documentTitle={doc.title}
                        difficultyLevel={progression?.currentDifficultyLevel ?? "beginner"}
                        learningMethod={progression?.learningMethod ?? null}
                        onQuizComplete={handleQuizComplete}
                      />
                    </div>
                  ) : null}
                </div>
              )}

              {/* FLASHCARDS TAB */}
              {activeTab === "flashcards" && (
                <div>
                  {flashcards.status === "idle" ? (
                    <GenerateButton label="Flashcards" onGenerate={() => void loadFlashcards()} loading={false} />
                  ) : flashcards.status === "loading" ? (
                    <GenerateButton label="Flashcards" onGenerate={() => {}} loading={true} />
                  ) : flashcards.status === "error" ? (
                    <div className="flex flex-col items-center gap-4 py-16">
                      <AlertCircle className="h-10 w-10 text-destructive" />
                      <p className="text-sm text-muted-foreground">{flashcards.error}</p>
                      <Button variant="outline" onClick={() => void loadFlashcards(true)}>
                        <RefreshCw className="h-4 w-4" />Try Again
                      </Button>
                    </div>
                  ) : flashcards.data ? (
                    <div>
                      <div className="flex items-center justify-between mb-6">
                        <p className="text-sm text-muted-foreground">{flashcards.data.length} cards · SM-2 spaced repetition</p>
                        <Button variant="ghost" size="sm" onClick={() => void loadFlashcards(true)} className="text-muted-foreground hover:text-foreground">
                          <RefreshCw className="h-3.5 w-3.5" />New Deck
                        </Button>
                      </div>
                      <FlashcardStudy
                        cards={flashcards.data}
                        documentId={doc.id}
                        documentTitle={doc.title}
                        learningMethod={progression?.learningMethod ?? null}
                        onSessionComplete={handleFlashcardChallengeComplete}
                      />
                    </div>
                  ) : null}
                </div>
              )}

              {/* TUTOR TAB */}
              {activeTab === "tutor" && (
                <TutorChat
                  documentId={doc.id}
                  documentTitle={doc.title}
                  learningMethod={progression?.learningMethod ?? null}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
    </AppShell>
  );
}

export default function DocumentPage() {
  return (
    <Suspense fallback={
      <AppShell mainClassName="flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </AppShell>
    }>
      <DocumentPageInner />
    </Suspense>
  );
}
