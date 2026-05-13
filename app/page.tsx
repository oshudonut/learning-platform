import { Suspense } from "react";
import Link from "next/link";
import { Brain, Sparkles, BookOpen, Layers, BarChart3, ArrowRight, Zap } from "lucide-react";
import { UploadZone } from "@/components/upload-zone";
import { AppShell } from "@/components/layout/AppShell";
import { listDocuments } from "@/lib/store";
import { formatDistanceToNow } from "@/lib/utils";

type DocSummary = Awaited<ReturnType<typeof listDocuments>>[number] & {
  hasReviewer?: boolean;
  hasQuiz?: boolean;
};

async function RecentDocuments() {
  let docs: DocSummary[] = [];
  try {
    docs = (await listDocuments()) as DocSummary[];
  } catch {
    return null;
  }

  if (!docs.length) return null;

  const recent = docs.slice(0, 6);

  return (
    <div className="mt-16">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-foreground">Recent Documents</h2>
        <Link
          href="/library"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recent.map((doc) => (
          <Link
            key={doc.id}
            href={`/document/${doc.id}`}
            className="group rounded-xl border border-border bg-white/50 p-4 card-hover block"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-foreground/8 ring-1 ring-foreground/12 group-hover:bg-foreground/12 transition-colors">
                <BookOpen className="h-4 w-4 text-foreground/70" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm truncate group-hover:text-foreground/70 transition-colors">
                  {doc.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDistanceToNow(doc.createdAt)}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  {doc.hasReviewer && (
                    <span className="text-[10px] bg-foreground/8 text-foreground/70 px-2 py-0.5 rounded-full">
                      Reviewed
                    </span>
                  )}
                  {doc.hasQuiz && (
                    <span className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full">
                      Quiz ready
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Accent border class cycles: mint, sky, coral, mint, sky, coral
const accentBorders = [
  "feature-card-mint",
  "feature-card-sky",
  "feature-card-coral",
  "feature-card-mint",
  "feature-card-sky",
  "feature-card-coral",
];

const features = [
  {
    icon: BookOpen,
    title: "AI Reviewer",
    description: "Structured notes, key concepts, mnemonics, and must-memorize facts",
    iconColor: "text-[#6EE7B7]",
  },
  {
    icon: Zap,
    title: "Adaptive Quizzes",
    description: "Deep explanation for every answer — teaches while it tests",
    iconColor: "text-[#7DD3FC]",
  },
  {
    icon: Layers,
    title: "Spaced Flashcards",
    description: "SM-2 spaced repetition for long-term memory retention",
    iconColor: "text-[#FCA5A5]",
  },
  {
    icon: Brain,
    title: "AI Professor",
    description: "Harvard-level tutor that guides you to understanding, not answers",
    iconColor: "text-[#6EE7B7]",
  },
  {
    icon: Sparkles,
    title: "RAG-Powered",
    description: "AI draws from your exact materials — no hallucinations",
    iconColor: "text-[#7DD3FC]",
  },
  {
    icon: BarChart3,
    title: "Progress Analytics",
    description: "Track mastery, weak topics, retention, and study streaks",
    iconColor: "text-[#FCA5A5]",
  },
];

export default function HomePage() {
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-8 py-12">
          {/* Hero */}
          <div className="text-center mb-12">
            <div className="hero-badge gap-2 mb-6">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Powered by Claude AI</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground mb-4">
              Your personal{" "}
              <span className="gradient-text">AI professor</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Upload any study material and transform it into structured reviewers, adaptive quizzes,
              flashcards, and an intelligent tutor that teaches you to think — not just memorize.
            </p>
          </div>

          {/* Upload Zone */}
          <div className="flex justify-center">
            <UploadZone />
          </div>

          {/* Recent docs */}
          <Suspense fallback={null}>
            <RecentDocuments />
          </Suspense>

          {/* Features */}
          <div className="mt-20">
            <div className="text-center mb-8">
              <span className="section-label mb-4">Our Features</span>
              <h2 className="text-xl font-extrabold text-foreground mt-3">
                Everything you need to master any subject
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, description, iconColor }, i) => (
                <div
                  key={title}
                  className={`rounded-2xl bg-card p-5 space-y-3 ${accentBorders[i]}`}
                >
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                    <Icon className={`h-4 w-4 ${iconColor}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-card-foreground text-sm">{title}</h3>
                    <p className="text-xs text-card-foreground/60 mt-1 leading-relaxed">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
      </div>
    </AppShell>
  );
}
