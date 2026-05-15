"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen,
  MoreVertical,
  Trash2,
  Pencil,
  FolderInput,
  Zap,
  Layers,
  MessageSquare,
  Check,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "@/lib/utils";

const FOLDER_COLOR_DOTS: Record<string, string> = {
  blue: "bg-blue-400", purple: "bg-purple-400", green: "bg-green-400",
  amber: "bg-amber-400", rose: "bg-rose-400", sky: "bg-sky-400",
  indigo: "bg-indigo-400", emerald: "bg-emerald-400",
};

type FolderOption = { id: string; name: string; color: string };

type DocMeta = {
  id: string;
  title: string;
  filename: string;
  textLength: number;
  createdAt: number;
  folderId: string | null;
  hasReviewer: boolean;
  hasQuiz: boolean;
  hasFlashcards: boolean;
  conceptCount: number;
  questionCount: number;
  flashcardCount: number;
};

type DocumentCardProps = {
  doc: DocMeta;
  index: number;
  folders: FolderOption[];
  onDelete: (id: string, title: string) => void;
  onRename: (id: string, currentTitle: string) => void;
  onMove: (id: string, folderId: string | null) => void;
};

export function DocumentCard({ doc, index, folders, onDelete, onRename, onMove }: DocumentCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [movingOpen, setMovingOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setMovingOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="group rounded-xl border border-border bg-card p-4 sm:p-5 hover:border-border/80 transition-colors"
    >
      <div className="flex items-start gap-3 sm:gap-5">
        {/* Icon */}
        <div className="flex h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15 mt-0.5">
          <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <Link href={`/document/${doc.id}`}>
            <h3 className="font-semibold text-foreground hover:text-primary transition-colors truncate">
              {doc.title}
            </h3>
          </Link>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {doc.filename} · {Math.round(doc.textLength / 1000)}k chars · {formatDistanceToNow(doc.createdAt)}
          </p>

          {/* Status pills */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2.5">
            {doc.hasReviewer && (
              <Link
                href={`/document/${doc.id}?tab=review`}
                className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/15 px-2 py-0.5 rounded-full hover:bg-primary/15 transition-colors"
              >
                <BookOpen className="h-2.5 w-2.5" />
                {doc.conceptCount} concepts
              </Link>
            )}
            {doc.hasQuiz && (
              <Link
                href={`/document/${doc.id}?tab=quiz`}
                className="inline-flex items-center gap-1 text-[10px] bg-success/10 text-success border border-success/15 px-2 py-0.5 rounded-full hover:bg-success/15 transition-colors"
              >
                <Zap className="h-2.5 w-2.5" />
                {doc.questionCount} questions
              </Link>
            )}
            {doc.hasFlashcards && (
              <Link
                href={`/document/${doc.id}?tab=flashcards`}
                className="inline-flex items-center gap-1 text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/15 px-2 py-0.5 rounded-full hover:bg-sky-500/15 transition-colors"
              >
                <Layers className="h-2.5 w-2.5" />
                {doc.flashcardCount} cards
              </Link>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <Link href={`/tutor?doc=${doc.id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" title="Ask tutor">
              <MessageSquare className="h-4 w-4" />
            </Button>
          </Link>
          <Link href={`/document/${doc.id}`}>
            <Button variant="outline" size="sm" className="hidden sm:flex opacity-0 group-hover:opacity-100 transition-opacity">
              Open
            </Button>
          </Link>

          {/* Three-dot menu */}
          <div className="relative" ref={menuRef}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => { setMenuOpen((v) => !v); setMovingOpen(false); }}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>

            {menuOpen && !movingOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
                <Link href={`/document/${doc.id}`} className="flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors">
                  <BookOpen className="h-4 w-4 text-muted-foreground" /> Open
                </Link>
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors text-left"
                  onClick={() => { setMenuOpen(false); onRename(doc.id, doc.title); }}
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" /> Rename
                </button>
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors text-left"
                  onClick={() => setMovingOpen(true)}
                >
                  <FolderInput className="h-4 w-4 text-muted-foreground" /> Move to folder
                </button>
                <div className="border-t border-border my-1" />
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-destructive/10 text-destructive transition-colors text-left"
                  onClick={() => { setMenuOpen(false); onDelete(doc.id, doc.title); }}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
            )}

            {menuOpen && movingOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
                  Move to folder
                </div>
                <button
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors text-left",
                    doc.folderId === null && "bg-muted/30",
                  )}
                  onClick={() => { setMenuOpen(false); setMovingOpen(false); onMove(doc.id, null); }}
                >
                  <Inbox className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">Unfiled</span>
                  {doc.folderId === null && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
                {folders.map((f) => (
                  <button
                    key={f.id}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors text-left",
                      doc.folderId === f.id && "bg-muted/30",
                    )}
                    onClick={() => { setMenuOpen(false); setMovingOpen(false); onMove(doc.id, f.id); }}
                  >
                    <span className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0", FOLDER_COLOR_DOTS[f.color] ?? "bg-blue-400")} />
                    <span className="flex-1 truncate">{f.name}</span>
                    {doc.folderId === f.id && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
