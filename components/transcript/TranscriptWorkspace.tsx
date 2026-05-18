"use client";

import { useEffect, useState } from "react";
import { AlertCircle, BookOpen, Loader2, RefreshCw, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TranscriptHeader } from "./TranscriptHeader";
import { TranscriptPageBlock } from "./TranscriptPageBlock";
import { TranscriptWorkspacePanel } from "./TranscriptWorkspacePanel";
import { TransformForStudyModal } from "./TransformForStudyModal";
import type { RawTranscript, StudyPreset } from "@/lib/types";

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; transcript: RawTranscript };

interface TranscriptWorkspaceProps {
  documentId: string;
  hasReviewer: boolean;
  onGenerateReviewer: (preset: StudyPreset) => Promise<void>;
  onViewReviewer: () => void;
  scrollToPageId?: string | null;
}

export function TranscriptWorkspace({
  documentId,
  hasReviewer,
  onGenerateReviewer,
  onViewReviewer,
  scrollToPageId,
}: TranscriptWorkspaceProps) {
  const [fetchState, setFetchState] = useState<FetchState>({ status: "loading" });
  const [activePageNumber, setActivePageNumber] = useState(1);
  const [showModal, setShowModal] = useState(false);

  // Navigate to the requested page when transcript is loaded and scrollToPageId is set.
  // pageId format is "page_N" — parse the page number from that.
  useEffect(() => {
    if (!scrollToPageId || fetchState.status !== "success") return;
    const match = scrollToPageId.match(/^page_(\d+)$/);
    if (!match) return;
    const pageNum = parseInt(match[1], 10);
    const page = fetchState.transcript.pages.find((p) => p.pageNumber === pageNum);
    if (page) setActivePageNumber(page.pageNumber);
  }, [scrollToPageId, fetchState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setFetchState({ status: "loading" });
    fetch("/api/transcript", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: documentId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        if (!data.transcript) throw new Error("No transcript returned");
        setFetchState({ status: "success", transcript: data.transcript as RawTranscript });
      })
      .catch((err: unknown) => {
        setFetchState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }, [documentId]);

  if (fetchState.status === "loading") {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading transcript…</p>
      </div>
    );
  }

  if (fetchState.status === "error") {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground">{fetchState.message}</p>
        <Button
          variant="outline"
          onClick={() => setFetchState({ status: "loading" })}
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  const { transcript } = fetchState;
  const activePage = transcript.pages.find((p) => p.pageNumber === activePageNumber) ?? null;

  async function handleGenerate(preset: StudyPreset) {
    await onGenerateReviewer(preset);
  }

  return (
    <>
      <div className="flex gap-4 items-start">
        {/* ── LEFT: transcript content ────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <TranscriptHeader transcript={transcript} />

          <div className="space-y-2 mt-4">
            {transcript.pages.map((page) => (
              <TranscriptPageBlock
                key={page.id}
                page={page}
                active={page.pageNumber === activePageNumber}
                onActivate={() => setActivePageNumber(page.pageNumber)}
              />
            ))}
          </div>

          {/* ── "Transform for Study" sticky CTA ──────────────────────── */}
          <div className="sticky bottom-0 mt-8 py-4 bg-background/90 backdrop-blur-sm border-t border-border/60">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Ready to study this material?
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Generate an adaptive reviewer, quiz, or flashcard deck from this source.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {hasReviewer && (
                  <Button variant="outline" size="sm" onClick={onViewReviewer}>
                    <BookOpen className="h-4 w-4" />
                    View Reviewer
                  </Button>
                )}
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => setShowModal(true)}
                  className="gap-1.5"
                >
                  <Sparkles className="h-4 w-4" />
                  {hasReviewer ? "Re-generate" : "Transform for Study"}
                  <Zap className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: workspace panel ──────────────────────────────────── */}
        <TranscriptWorkspacePanel
          documentId={documentId}
          activePage={activePage}
        />
      </div>

      {/* ── Transform modal ─────────────────────────────────────────────── */}
      <TransformForStudyModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onGenerate={handleGenerate}
        hasTranscript
      />
    </>
  );
}
