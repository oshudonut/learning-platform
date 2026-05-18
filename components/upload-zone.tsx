"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Loader2,
  CheckCircle2,
  X,
  FileText,
  Image as ImageIcon,
  FileType,
  ScanLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ReviewerSetupModal } from "@/components/upload/ReviewerSetupModal";
import type { LearningMethod } from "@/lib/types";

type FileStatus = "pending" | "uploading" | "done" | "error";

type QueueItem = {
  id: string;
  file: File;
  status: FileStatus;
  error?: string;
  docId?: string;
};

type FolderOption = { id: string; name: string; color: string };

type SetupPending = {
  docId: string;
  defaultTitle: string;
  folders: FolderOption[];
};

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "webp"].includes(ext ?? "")) return ImageIcon;
  if (ext === "docx") return FileType;
  return FileText;
}

function FileRow({ item, onRemove }: { item: QueueItem; onRemove: (id: string) => void }) {
  const Icon = fileIcon(item.file.name);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm",
        item.status === "done" && "border-success/30 bg-success/5",
        item.status === "error" && "border-destructive/30 bg-destructive/5",
        item.status === "pending" && "border-border bg-card/50",
        item.status === "uploading" && "border-primary/30 bg-primary/5",
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate text-foreground">{item.file.name}</span>
      {item.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />}
      {item.status === "done" && <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />}
      {item.status === "error" && (
        <span className="text-xs text-destructive max-w-[140px] truncate">{item.error}</span>
      )}
      {item.status === "pending" && (
        <button
          onClick={() => onRemove(item.id)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </motion.div>
  );
}

const ACCEPTED = ".pdf,.docx,.png,.jpg,.jpeg,.webp";

export function UploadZone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [setupPending, setSetupPending] = useState<SetupPending | null>(null);

  const addFiles = useCallback((files: File[]) => {
    const items: QueueItem[] = files.map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      status: "pending",
    }));
    setQueue((prev) => [...prev, ...items]);
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) addFiles(files);
    },
    [addFiles],
  );

  const uploadAll = useCallback(async () => {
    const pending = queue.filter((item) => item.status === "pending");
    if (!pending.length) return;

    setProcessing(true);
    let firstDocId: string | null = null;
    let firstTitle: string | null = null;

    for (const item of pending) {
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "uploading" } : q)),
      );

      try {
        // Step 1: Get a signed storage upload URL (bypasses Vercel's 4.5 MB body limit)
        const presignRes = await fetch("/api/upload/presign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ filename: item.file.name }),
        });
        if (!presignRes.ok) {
          const err = await presignRes.json().catch(() => ({})) as { error?: string };
          throw new Error(err.error ?? "Failed to prepare upload");
        }
        const { uploadUrl, storageKey } = await presignRes.json() as { uploadUrl: string; storageKey: string };

        // Step 2: Upload the file directly to Supabase Storage — no Vercel function in the path
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          body: item.file,
          headers: { "content-type": item.file.type || "application/octet-stream" },
        });
        if (!putRes.ok) throw new Error("Storage upload failed");

        // Step 3: Trigger server-side processing with a tiny JSON payload
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ storageKey, filename: item.file.name, ocr: ocrEnabled }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(err.error ?? `Upload failed (${res.status})`);
        }
        const data = await res.json() as { id: string; title: string; duplicate?: boolean };
        if (!firstDocId) { firstDocId = data.id; firstTitle = data.title; }
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: "done", docId: data.id } : q)),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: "error", error: message } : q)),
        );
      }
    }

    setProcessing(false);

    if (firstDocId && firstTitle) {
      // Fetch folders to show in setup modal
      let folders: FolderOption[] = [];
      try {
        const res = await fetch("/api/folders");
        if (res.ok) {
          const data = await res.json() as { folders?: FolderOption[] };
          folders = data.folders ?? [];
        }
      } catch { /* ignore — modal still works with empty folder list */ }

      setSetupPending({ docId: firstDocId, defaultTitle: firstTitle, folders });
    }
  }, [queue, ocrEnabled]);

  async function handleSetupConfirm(opts: {
    reviewerName: string;
    folderId: string | null;
    learningMethod: LearningMethod | null;
  }) {
    if (!setupPending) return;
    const { docId, defaultTitle } = setupPending;

    try {
      if (opts.reviewerName !== defaultTitle) {
        await fetch("/api/folders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "rename_document", docId, title: opts.reviewerName }),
        });
      }
      if (opts.folderId) {
        await fetch("/api/folders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "move_document", docId, folderId: opts.folderId }),
        });
      }
    } catch { /* non-critical — still navigate */ }

    setSetupPending(null);
    const params = opts.learningMethod ? `?method=${opts.learningMethod}` : "";
    router.push(`/document/${docId}${params}`);
  }

  function handleSetupCancel() {
    if (!setupPending) return;
    const docId = setupPending.docId;
    setSetupPending(null);
    router.push(`/document/${docId}`);
  }

  const pendingCount = queue.filter((q) => q.status === "pending").length;
  const isEmpty = queue.length === 0;

  return (
    <>
    <AnimatePresence>
      {setupPending && (
        <ReviewerSetupModal
          docId={setupPending.docId}
          defaultTitle={setupPending.defaultTitle}
          folders={setupPending.folders}
          onConfirm={handleSetupConfirm}
          onCancel={handleSetupCancel}
        />
      )}
    </AnimatePresence>
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-2xl space-y-3"
    >
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !processing && inputRef.current?.click()}
        className={cn(
          "relative rounded-2xl border-2 border-dashed p-10 text-center transition-all cursor-pointer",
          "bg-background/60 backdrop-blur-sm",
          dragOver
            ? "border-accent bg-accent/5 scale-[1.01]"
            : "border-border hover:border-accent/50",
          processing && "pointer-events-none opacity-75",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) addFiles(files);
            e.target.value = "";
          }}
        />

        <div className="flex flex-col items-center gap-3">
          <div className="rounded-2xl bg-accent/10 p-4">
            <Upload className="h-7 w-7 text-accent" />
          </div>
          <div>
            <p className="text-base font-semibold">
              {isEmpty ? "Drop files to begin" : "Drop more files"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              PDF, DOCX, PNG, JPG, or WEBP — up to 25MB each
            </p>
          </div>
          <Button variant="accent" size="sm" type="button">
            <Upload className="h-4 w-4" />
            Choose files
          </Button>
        </div>
      </div>

      {/* OCR toggle */}
      <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
        <div
          onClick={() => setOcrEnabled(!ocrEnabled)}
          className={cn(
            "relative h-5 w-9 rounded-full transition-colors",
            ocrEnabled ? "bg-primary" : "bg-border",
          )}
        >
          <div
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
              ocrEnabled ? "translate-x-4" : "translate-x-0.5",
            )}
          />
        </div>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ScanLine className="h-3.5 w-3.5" />
          Force OCR (for scanned PDFs)
        </span>
      </label>

      {/* Queue */}
      <AnimatePresence mode="popLayout">
        {queue.map((item) => (
          <FileRow key={item.id} item={item} onRemove={removeFromQueue} />
        ))}
      </AnimatePresence>

      {/* Upload button */}
      {pendingCount > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Button
            variant="accent"
            className="w-full"
            onClick={uploadAll}
            disabled={processing}
          >
            {processing ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Processing…</>
            ) : (
              <><Upload className="h-4 w-4" />Upload {pendingCount} file{pendingCount !== 1 ? "s" : ""}</>
            )}
          </Button>
        </motion.div>
      )}

      {isEmpty && (
        <p className="text-center text-xs text-muted-foreground">
          Supports PDF, DOCX, PNG, JPG, WEBP · Up to 25MB each
        </p>
      )}
    </motion.div>
    </>
  );
}
