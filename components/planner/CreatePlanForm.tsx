"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Doc = { id: string; title: string; hasReviewer: boolean };

type Props = {
  onCancel?: () => void;
};

export function CreatePlanForm({ onCancel }: Props) {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("Board Exam Study Plan");
  const [examDate, setExamDate] = useState("");
  const [dailyHours, setDailyHours] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/library")
      .then((r) => r.json())
      .then((data) => {
        const withReviewer = (data.documents ?? []).filter((d: Doc) => d.hasReviewer);
        setDocs(withReviewer);
      })
      .catch(() => null);
  }, []);

  function toggleDoc(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!examDate || selected.size === 0) {
      setError("Select an exam date and at least one document.");
      return;
    }
    const examMs = new Date(examDate + "T00:00:00Z").getTime();
    if (examMs <= Date.now()) {
      setError("Exam date must be in the future.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/planner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          examDate: examMs,
          dailyHours,
          documentIds: [...selected],
        }),
      });
      const data = await res.json() as { plan?: { id: string }; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create plan");
      router.push(`/planner/${data.plan!.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create plan");
      setSubmitting(false);
    }
  }

  // Min date = tomorrow
  const minDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Plan title */}
      <div>
        <label className="text-xs font-semibold text-foreground block mb-1.5">Plan title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={80}
          className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      {/* Exam date + daily hours side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-foreground block mb-1.5 flex items-center gap-1.5">
            <CalendarDays className="h-3 w-3" />
            Exam date
          </label>
          <input
            type="date"
            value={examDate}
            min={minDate}
            onChange={(e) => setExamDate(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-foreground block mb-1.5">
            Daily study hours
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0.5}
              max={8}
              step={0.5}
              value={dailyHours}
              onChange={(e) => setDailyHours(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="text-sm font-semibold text-foreground w-8 text-right">{dailyHours}h</span>
          </div>
        </div>
      </div>

      {/* Document selector */}
      <div>
        <label className="text-xs font-semibold text-foreground block mb-1.5">
          Documents to include{" "}
          <span className="text-muted-foreground font-normal">(with reviewer only)</span>
        </label>
        {docs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No documents with a reviewer found.</p>
        ) : (
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {docs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => toggleDoc(doc.id)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-all",
                  selected.has(doc.id)
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-4 w-4 rounded flex-shrink-0 border flex items-center justify-center transition-colors",
                    selected.has(doc.id) ? "bg-primary border-primary" : "border-muted-foreground/40",
                  )}
                >
                  {selected.has(doc.id) && <span className="text-white text-[10px] font-bold">✓</span>}
                </span>
                <span className="truncate">{doc.title}</span>
              </button>
            ))}
          </div>
        )}
        {selected.size > 0 && (
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {selected.size} document{selected.size !== 1 ? "s" : ""} selected
          </p>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-3 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || selected.size === 0 || !examDate}
          className="ml-auto flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {submitting ? "Generating schedule…" : "Create Plan"}
        </button>
      </div>
    </form>
  );
}
