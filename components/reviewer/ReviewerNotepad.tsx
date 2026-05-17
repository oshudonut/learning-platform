"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PenLine, ChevronDown, ChevronUp, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

type ReviewerNotepadProps = {
  documentId: string;
  topicIndex: number;
  initialNote?: { noteText: string; confusionLevel: number | null } | null;
};

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

export function ReviewerNotepad({ documentId, topicIndex, initialNote }: ReviewerNotepadProps) {
  const [open, setOpen] = useState(Boolean(initialNote?.noteText));
  const [noteText, setNoteText] = useState(initialNote?.noteText ?? "");
  const [confusionLevel, setConfusionLevel] = useState<number | null>(initialNote?.confusionLevel ?? null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const saveNote = useCallback(async (text: string, level: number | null) => {
    if (!text.trim() && level === null) return;
    setSaveState("saving");
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId, topicIndex, noteText: text, confusionLevel: level }),
      });
      if (!isMounted.current) return;
      if (!res.ok) throw new Error("save failed");
      setSaveState("saved");
      setTimeout(() => { if (isMounted.current) setSaveState("idle"); }, 2000);
    } catch {
      if (isMounted.current) setSaveState("error");
    }
  }, [documentId, topicIndex]);

  const scheduleAutoSave = useCallback((text: string, level: number | null) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveNote(text, level), 500);
  }, [saveNote]);

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

  const hasContent = Boolean(noteText.trim() || confusionLevel !== null);

  return (
    <div className="mt-4 border-t border-muted-foreground/10 pt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors group w-full"
      >
        <PenLine className="h-3.5 w-3.5" />
        <span>My Notes</span>
        {hasContent && !open && (
          <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
        )}
        <span className="ml-auto">
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {/* Confusion level picker */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              Clarity:
            </span>
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

          {/* Note textarea */}
          <div className="relative">
            <textarea
              value={noteText}
              onChange={handleTextChange}
              placeholder="Write your notes here… confusing points, mnemonics, questions"
              rows={3}
              className={cn(
                "w-full resize-none rounded-lg border bg-muted/30 px-3 py-2 text-sm text-foreground",
                "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40",
                "leading-relaxed transition-colors",
              )}
            />

            {/* Save indicator */}
            <div className="absolute bottom-2 right-2 flex items-center gap-1 text-[10px]">
              {saveState === "saving" && (
                <><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Saving…</span></>
              )}
              {saveState === "saved" && (
                <><Check className="h-3 w-3 text-success" /><span className="text-success">Saved</span></>
              )}
              {saveState === "error" && (
                <span className="text-destructive">Save failed</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
