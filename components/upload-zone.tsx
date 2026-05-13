"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Upload, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Phase = "idle" | "uploading" | "error";

export function UploadZone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setFilename(file.name);
      setPhase("uploading");

      const form = new FormData();
      form.append("file", file);

      try {
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: form,
        });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          throw new Error(err.error || `Upload failed (${uploadRes.status})`);
        }
        const { id } = (await uploadRes.json()) as { id: string };
        router.push(`/document/${id}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setPhase("error");
      }
    },
    [router],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const busy = phase === "uploading";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-2xl"
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !busy && inputRef.current?.click()}
        className={cn(
          "relative rounded-2xl border-2 border-dashed p-12 text-center transition-all cursor-pointer",
          "bg-background/60 backdrop-blur-sm",
          dragOver
            ? "border-accent bg-accent/5 scale-[1.01]"
            : "border-border hover:border-accent/50",
          busy && "pointer-events-none opacity-90",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />

        <div className="flex flex-col items-center gap-4">
          {phase === "idle" && (
            <>
              <div className="rounded-2xl bg-accent/10 p-4">
                <Upload className="h-8 w-8 text-accent" />
              </div>
              <div>
                <p className="text-lg font-semibold">Drop a PDF to begin</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Textbook chapter, lecture notes, research paper — anything you
                  need to learn
                </p>
              </div>
              <Button variant="accent" size="lg" type="button">
                <Upload className="h-4 w-4" />
                Choose file
              </Button>
            </>
          )}

          {phase === "uploading" && (
            <>
              <div className="rounded-2xl bg-accent/10 p-4">
                <Loader2 className="h-8 w-8 text-accent animate-spin" />
              </div>
              <div>
                <p className="text-lg font-semibold">Reading {filename}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Extracting text and structure
                </p>
              </div>
            </>
          )}

          {phase === "error" && (
            <>
              <div className="rounded-2xl bg-destructive/10 p-4">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <div>
                <p className="text-lg font-semibold">Something went wrong</p>
                <p className="mt-1 text-sm text-muted-foreground max-w-md">
                  {error}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setPhase("idle");
                  setError(null);
                  setFilename(null);
                }}
              >
                Try again
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        PDFs up to 25MB. Scanned documents will need OCR (coming soon).
      </p>
    </motion.div>
  );
}
