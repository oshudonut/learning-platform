"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, PanelRight, PenLine, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NoteCoach } from "@/components/reviewer/NoteCoach";
import type { NoteCoachTopic } from "@/components/reviewer/NoteCoach";

// ── Types ─────────────────────────────────────────────────────────────────────

type SaveState = "idle" | "saving" | "saved" | "error";

export interface WorkspacePanelProps {
  documentId: string;
  topicIndex: number;
  initialNote?: { noteText: string; confusionLevel: number | null } | null;
  topic: NoteCoachTopic;
  studyMode?: string;
}

// ── Confusion level config ────────────────────────────────────────────────────

const CONFUSION_LABELS: Record<number, string> = {
  1: "Clear",
  2: "Mostly clear",
  3: "Somewhat confused",
  4: "Confused",
  5: "Very confused",
};

const CONFUSION_COLORS: Record<number, string> = {
  1: "text-emerald-500 border-emerald-500/40 bg-emerald-500/8",
  2: "text-sky-500 border-sky-500/40 bg-sky-500/8",
  3: "text-amber-500 border-amber-500/40 bg-amber-500/8",
  4: "text-orange-500 border-orange-500/40 bg-orange-500/8",
  5: "text-red-500 border-red-500/40 bg-red-500/8",
};

const PANEL_MIN = 260;
const PANEL_MAX = 520;
const PANEL_DEFAULT = 320;

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkspacePanel({
  documentId,
  topicIndex,
  initialNote,
  topic,
  studyMode,
}: WorkspacePanelProps) {
  // ── Persisted layout state ────────────────────────────────────────────────
  const [panelOpen, setPanelOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("ws_panel_open");
    return stored === null ? true : stored === "true";
  });

  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return PANEL_DEFAULT;
    const stored = parseInt(localStorage.getItem("ws_panel_width") ?? "", 10);
    return isNaN(stored) ? PANEL_DEFAULT : Math.min(PANEL_MAX, Math.max(PANEL_MIN, stored));
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  // ── Note content state ────────────────────────────────────────────────────
  const [noteText, setNoteText] = useState(initialNote?.noteText ?? "");
  const [confusionLevel, setConfusionLevel] = useState<number | null>(initialNote?.confusionLevel ?? null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // ── Refs ──────────────────────────────────────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);
  const prevTopicRef = useRef({ topicIndex, documentId });
  const noteTextRef = useRef(noteText);
  const confusionLevelRef = useRef(confusionLevel);

  // Keep refs synced to state
  useEffect(() => { noteTextRef.current = noteText; }, [noteText]);
  useEffect(() => { confusionLevelRef.current = confusionLevel; }, [confusionLevel]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Persist panel open/closed ─────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem("ws_panel_open", String(panelOpen));
  }, [panelOpen]);

  // ── Save function ─────────────────────────────────────────────────────────
  const saveNote = useCallback(async (
    text: string,
    level: number | null,
    docId: string,
    topIdx: number,
  ) => {
    if (!text.trim() && level === null) return;
    if (isMounted.current) setSaveState("saving");
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId: docId,
          topicIndex: topIdx,
          noteText: text,
          confusionLevel: level,
        }),
      });
      if (!isMounted.current) return;
      if (!res.ok) throw new Error("save failed");
      setSaveState("saved");
      setTimeout(() => { if (isMounted.current) setSaveState("idle"); }, 2000);
    } catch {
      if (isMounted.current) setSaveState("error");
    }
  }, []);

  const scheduleAutoSave = useCallback((text: string, level: number | null) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveNote(text, level, documentId, topicIndex);
    }, 500);
  }, [saveNote, documentId, topicIndex]);

  // ── Topic change: flush pending save for PREVIOUS topic, reinit state ─────
  useEffect(() => {
    const prev = prevTopicRef.current;
    const topicChanged = prev.topicIndex !== topicIndex || prev.documentId !== documentId;

    if (topicChanged) {
      // Cancel pending debounced save for previous topic
      if (debounceRef.current) clearTimeout(debounceRef.current);

      // Fire-and-forget immediate save for the PREVIOUS topic
      const prevText = noteTextRef.current;
      const prevLevel = confusionLevelRef.current;
      if (prevText.trim() || prevLevel !== null) {
        void saveNote(prevText, prevLevel, prev.documentId, prev.topicIndex);
      }

      // Update the ref to the new topic
      prevTopicRef.current = { topicIndex, documentId };

      // Reset state to new topic's note
      setNoteText(initialNote?.noteText ?? "");
      setConfusionLevel(initialNote?.confusionLevel ?? null);
      setSaveState("idle");
    }
  // We intentionally only react to topicIndex/documentId/initialNote changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicIndex, documentId, initialNote]);

  // ── Resize handle ─────────────────────────────────────────────────────────
  const resizeDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  function handleResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    resizeDragRef.current = { startX: e.clientX, startWidth: panelWidth };

    function onMove(ev: MouseEvent) {
      if (!resizeDragRef.current) return;
      const { startX, startWidth } = resizeDragRef.current;
      const newWidth = Math.min(PANEL_MAX, Math.max(PANEL_MIN, startWidth + (startX - ev.clientX)));
      setPanelWidth(newWidth);
      localStorage.setItem("ws_panel_width", String(newWidth));
    }

    function onUp() {
      resizeDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Input handlers ────────────────────────────────────────────────────────
  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setNoteText(val);
    setSaveState("idle");
    scheduleAutoSave(val, confusionLevel);
  }

  function handleConfusionChange(level: number) {
    const next = confusionLevel === level ? null : level;
    setConfusionLevel(next);
    scheduleAutoSave(noteText, next);
  }

  // ── Panel content ─────────────────────────────────────────────────────────
  const panelContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border flex-shrink-0">
        <PenLine className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-semibold text-foreground flex-1">My Notes</span>

        {/* Save state indicator */}
        <div className="flex items-center gap-1 text-[10px] flex-shrink-0">
          {saveState === "saving" && (
            <><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Saving…</span></>
          )}
          {saveState === "saved" && (
            <><Check className="h-3 w-3 text-emerald-500" /><span className="text-emerald-500">Saved</span></>
          )}
          {saveState === "error" && (
            <span className="text-destructive">Save failed</span>
          )}
        </div>

        {/* Collapse / close */}
        <button
          onClick={() => { setPanelOpen(false); setMobileOpen(false); }}
          className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          title="Close notes"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto flex-1 p-3 space-y-3">
        {/* Topic label */}
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-semibold truncate">
          {topic.title}
        </p>

        {/* Clarity picker */}
        <div className="space-y-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
            Clarity:
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                onClick={() => handleConfusionChange(level)}
                className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded border transition-all",
                  confusionLevel === level
                    ? CONFUSION_COLORS[level]
                    : "text-muted-foreground border-transparent hover:border-muted-foreground/30",
                )}
              >
                {level} – {CONFUSION_LABELS[level]}
              </button>
            ))}
          </div>
        </div>

        {/* Note textarea */}
        <textarea
          value={noteText}
          onChange={handleTextChange}
          placeholder="Write your notes here… confusing points, mnemonics, questions"
          rows={8}
          className={cn(
            "w-full resize-none rounded-lg border bg-muted/30 px-3 py-2 text-sm text-foreground",
            "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40",
            "leading-relaxed transition-colors",
          )}
        />

        {/* AI Study Coach */}
        <NoteCoach
          noteText={noteText}
          topic={topic}
          studyMode={studyMode}
          confusionLevel={confusionLevel}
          onApplyRewrite={(text) => {
            setNoteText(text);
            scheduleAutoSave(text, confusionLevel);
          }}
        />
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop ─────────────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col flex-shrink-0 relative"
        style={{ width: panelOpen ? panelWidth : 40 }}
      >
        {panelOpen ? (
          <>
            {/* Resize handle — left edge */}
            <div
              onMouseDown={handleResizeMouseDown}
              className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-primary/20 transition-colors"
            />

            {/* Sticky panel card */}
            <div
              className="sticky top-4 ml-2 flex flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden"
              style={{ maxHeight: "calc(100vh - 6rem)" }}
            >
              {panelContent}
            </div>
          </>
        ) : (
          /* Collapsed pill — just a reopen button */
          <div className="sticky top-4 ml-1 flex flex-col items-center gap-2">
            <button
              onClick={() => setPanelOpen(true)}
              title="Open Notes"
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shadow-sm"
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Mobile floating button ───────────────────────────────────────── */}
      <button
        className="lg:hidden fixed bottom-20 right-4 z-40 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
        onClick={() => setMobileOpen(true)}
        aria-label="Open notes"
      >
        <PenLine className="h-5 w-5" />
      </button>

      {/* ── Mobile slide-over ────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="lg:hidden fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="absolute right-0 top-0 bottom-0 w-[85vw] max-w-sm bg-background border-l border-border flex flex-col"
            >
              {panelContent}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
