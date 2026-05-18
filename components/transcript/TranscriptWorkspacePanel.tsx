"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  Check,
  Highlighter,
  HelpCircle,
  Loader2,
  PanelRight,
  PenLine,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NoteCoach } from "@/components/reviewer/NoteCoach";
import type { TranscriptPage } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const PANEL_MIN = 260;
const PANEL_MAX = 520;
const PANEL_DEFAULT = 320;

// Transcript page notes use this offset to avoid collision with reviewer
// topic indices (0–N range). 10000 + pageNumber is the stored topicIndex.
const TRANSCRIPT_NOTE_OFFSET = 10000;

type WorkspaceTab = "notes" | "coach" | "highlights" | "questions";

type SaveState = "idle" | "saving" | "saved" | "error";

type NoteData = { noteText: string; confusionLevel: number | null };

const CONFUSION_LABELS: Record<number, string> = {
  1: "Clear", 2: "Mostly clear", 3: "Somewhat confused", 4: "Confused", 5: "Very confused",
};

const CONFUSION_COLORS: Record<number, string> = {
  1: "text-emerald-500 border-emerald-500/40 bg-emerald-500/8",
  2: "text-sky-500 border-sky-500/40 bg-sky-500/8",
  3: "text-amber-500 border-amber-500/40 bg-amber-500/8",
  4: "text-orange-500 border-orange-500/40 bg-orange-500/8",
  5: "text-red-500 border-red-500/40 bg-red-500/8",
};

const TABS: Array<{ id: WorkspaceTab; label: string; Icon: React.ElementType; comingSoon?: boolean }> = [
  { id: "notes",      label: "Notes",      Icon: PenLine },
  { id: "coach",      label: "AI Coach",   Icon: Brain },
  { id: "highlights", label: "Highlights", Icon: Highlighter, comingSoon: true },
  { id: "questions",  label: "Questions",  Icon: HelpCircle,  comingSoon: true },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface TranscriptWorkspacePanelProps {
  documentId: string;
  activePage: TranscriptPage | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TranscriptWorkspacePanel({
  documentId,
  activePage,
}: TranscriptWorkspacePanelProps) {

  // ── Layout state (persisted) ───────────────────────────────────────────────
  const [panelOpen, setPanelOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("ts_ws_open") !== "false";
  });
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return PANEL_DEFAULT;
    const v = parseInt(localStorage.getItem("ts_ws_width") ?? "", 10);
    return isNaN(v) ? PANEL_DEFAULT : Math.min(PANEL_MAX, Math.max(PANEL_MIN, v));
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("notes");

  useEffect(() => { localStorage.setItem("ts_ws_open", String(panelOpen)); }, [panelOpen]);

  // ── Notes map (fetched once on mount) ─────────────────────────────────────
  const [notesMap, setNotesMap] = useState<Map<number, NoteData>>(new Map());

  useEffect(() => {
    fetch(`/api/notes?documentId=${documentId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data.notes)) return;
        const map = new Map<number, NoteData>();
        for (const n of data.notes) {
          map.set(n.topicIndex as number, {
            noteText: n.noteText as string,
            confusionLevel: (n.confusionLevel as number | null) ?? null,
          });
        }
        setNotesMap(map);
      })
      .catch(() => null);
  }, [documentId]);

  // ── Active page note state ────────────────────────────────────────────────
  const [noteText, setNoteText] = useState("");
  const [confusionLevel, setConfusionLevel] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const isMounted = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteTextRef = useRef(noteText);
  const confusionRef = useRef(confusionLevel);
  const prevPageRef = useRef<{ pageNumber: number } | null>(null);

  useEffect(() => { noteTextRef.current = noteText; }, [noteText]);
  useEffect(() => { confusionRef.current = confusionLevel; }, [confusionLevel]);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Sync note state when active page or notes map changes
  useEffect(() => {
    if (!activePage) return;

    const prev = prevPageRef.current;
    if (prev && prev.pageNumber !== activePage.pageNumber) {
      // Flush pending save for previous page
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const prevText = noteTextRef.current;
      const prevLevel = confusionRef.current;
      if (prevText.trim() || prevLevel !== null) {
        void persistNote(prevText, prevLevel, documentId, TRANSCRIPT_NOTE_OFFSET + prev.pageNumber);
      }
    }

    prevPageRef.current = { pageNumber: activePage.pageNumber };
    const stored = notesMap.get(TRANSCRIPT_NOTE_OFFSET + activePage.pageNumber);
    setNoteText(stored?.noteText ?? "");
    setConfusionLevel(stored?.confusionLevel ?? null);
    setSaveState("idle");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage?.pageNumber, notesMap]);

  async function persistNote(text: string, level: number | null, docId: string, topicIndex: number) {
    if (!text.trim() && level === null) return;
    await fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ documentId: docId, topicIndex, noteText: text, confusionLevel: level }),
    }).catch(() => null);
  }

  const saveNote = useCallback(async (text: string, level: number | null) => {
    if (!activePage) return;
    const topicIndex = TRANSCRIPT_NOTE_OFFSET + activePage.pageNumber;
    if (!text.trim() && level === null) return;
    if (isMounted.current) setSaveState("saving");
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId, topicIndex, noteText: text, confusionLevel: level }),
      });
      if (!isMounted.current) return;
      if (!res.ok) throw new Error("save failed");
      // Update local map
      setNotesMap((prev) => new Map(prev).set(topicIndex, { noteText: text, confusionLevel: level }));
      setSaveState("saved");
      setTimeout(() => { if (isMounted.current) setSaveState("idle"); }, 2000);
    } catch {
      if (isMounted.current) setSaveState("error");
    }
  }, [activePage, documentId]);

  const scheduleAutoSave = useCallback((text: string, level: number | null) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveNote(text, level), 500);
  }, [saveNote]);

  // ── Resize handle ──────────────────────────────────────────────────────────
  const resizeDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  function handleResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    resizeDragRef.current = { startX: e.clientX, startWidth: panelWidth };
    function onMove(ev: MouseEvent) {
      if (!resizeDragRef.current) return;
      const w = Math.min(PANEL_MAX, Math.max(PANEL_MIN,
        resizeDragRef.current.startWidth + (resizeDragRef.current.startX - ev.clientX)));
      setPanelWidth(w);
      localStorage.setItem("ts_ws_width", String(w));
    }
    function onUp() {
      resizeDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── NoteCoach topic derived from active page ───────────────────────────────
  const coachTopic = activePage
    ? {
        title: activePage.title,
        coreIdea: activePage.content.slice(0, 300),
        keyPoints: activePage.content
          .split("\n")
          .filter((l) => l.trim().length > 30)
          .slice(0, 4)
          .map((l) => l.trim().slice(0, 120)),
        mustMemorize: [] as string[],
        boardTips: [] as string[],
      }
    : null;

  // ── Panel content ──────────────────────────────────────────────────────────
  const panelContent = (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border flex-shrink-0 overflow-x-auto scrollbar-none">
        {TABS.map(({ id, label, Icon, comingSoon }) => (
          <button
            key={id}
            onClick={() => !comingSoon && setActiveTab(id)}
            title={comingSoon ? "Coming soon" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all whitespace-nowrap flex-shrink-0",
              activeTab === id && !comingSoon
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground",
              comingSoon && "opacity-35 cursor-not-allowed",
            )}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => { setPanelOpen(false); setMobileOpen(false); }}
          className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Active page label */}
      {activePage && (
        <div className="px-3 py-1.5 border-b border-border/40 bg-muted/15 flex-shrink-0">
          <p className="text-[10px] text-muted-foreground/55 uppercase tracking-wider font-semibold truncate">
            {activePage.title}
          </p>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!activePage ? (
          <p className="text-xs text-muted-foreground/40 text-center pt-6">
            Click a page to start taking notes
          </p>
        ) : activeTab === "notes" ? (
          <>
            {/* Save indicator */}
            <div className="flex items-center justify-end h-4">
              {saveState === "saving" && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />Saving…
                </span>
              )}
              {saveState === "saved" && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                  <Check className="h-3 w-3" />Saved
                </span>
              )}
              {saveState === "error" && (
                <span className="text-[10px] text-destructive">Save failed</span>
              )}
            </div>

            {/* Clarity picker */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Clarity:
              </span>
              <div className="flex items-center gap-1 flex-wrap">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    onClick={() => {
                      const next = confusionLevel === level ? null : level;
                      setConfusionLevel(next);
                      scheduleAutoSave(noteText, next);
                    }}
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

            {/* Textarea */}
            <textarea
              value={noteText}
              onChange={(e) => {
                setNoteText(e.target.value);
                setSaveState("idle");
                scheduleAutoSave(e.target.value, confusionLevel);
              }}
              placeholder="Write your notes on this section…"
              rows={8}
              className={cn(
                "w-full resize-none rounded-lg border bg-muted/30 px-3 py-2 text-sm text-foreground",
                "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40",
                "leading-relaxed transition-colors",
              )}
            />
          </>
        ) : activeTab === "coach" ? (
          <>
            {coachTopic && noteText.trim() ? (
              <NoteCoach
                noteText={noteText}
                topic={coachTopic}
                confusionLevel={confusionLevel}
                onApplyRewrite={(text) => {
                  setNoteText(text);
                  scheduleAutoSave(text, confusionLevel);
                }}
              />
            ) : (
              <p className="text-xs text-muted-foreground/50 text-center pt-6">
                Write notes on this page to activate AI coaching
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 pt-8">
            <Sparkles className="h-5 w-5 text-muted-foreground/25" />
            <p className="text-xs text-muted-foreground/40 text-center">Coming soon</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop ────────────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col flex-shrink-0 relative"
        style={{ width: panelOpen ? panelWidth : 40 }}
      >
        {panelOpen ? (
          <>
            <div
              onMouseDown={handleResizeMouseDown}
              className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-primary/20 transition-colors"
            />
            <div
              className="sticky top-4 ml-2 flex flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden"
              style={{ maxHeight: "calc(100vh - 6rem)" }}
            >
              {panelContent}
            </div>
          </>
        ) : (
          <div className="sticky top-4 ml-1 flex flex-col items-center gap-2">
            <button
              onClick={() => setPanelOpen(true)}
              title="Open workspace"
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shadow-sm"
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Mobile floating button ──────────────────────────────────────── */}
      <button
        className="lg:hidden fixed bottom-20 right-4 z-40 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
        onClick={() => setMobileOpen(true)}
        aria-label="Open workspace"
      >
        <PenLine className="h-5 w-5" />
      </button>

      {/* ── Mobile slide-over ────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
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
