"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen,
  Trash2,
  Plus,
  Search,
  FileText,
  Loader2,
  Zap,
  Layers,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "@/lib/utils";

type DocMeta = {
  id: string;
  title: string;
  filename: string;
  textLength: number;
  createdAt: number;
  hasReviewer: boolean;
  hasQuiz: boolean;
  hasFlashcards: boolean;
  conceptCount: number;
  questionCount: number;
  flashcardCount: number;
};

export default function LibraryPage() {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  async function fetchDocs() {
    setLoading(true);
    try {
      const res = await fetch("/api/library");
      const data = await res.json();
      setDocs(data.documents ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchDocs();
  }, []);

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await fetch("/api/library", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  const filtered = docs.filter(
    (d) =>
      !search ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.filename.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Library</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {docs.length} document{docs.length !== 1 ? "s" : ""} · All your study materials
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={fetchDocs}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Link href="/">
                <Button variant="accent">
                  <Plus className="h-4 w-4" />
                  Upload Document
                </Button>
              </Link>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/30 transition-colors"
            />
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center text-center py-24 gap-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <FileText className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  {search ? "No documents match your search" : "No documents yet"}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {search ? "Try a different search term" : "Upload a PDF to get started"}
                </p>
              </div>
              {!search && (
                <Link href="/">
                  <Button variant="accent">
                    <Plus className="h-4 w-4" />
                    Upload your first document
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((doc, i) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="group rounded-xl border border-border bg-card p-5 flex items-center gap-5 card-hover"
                >
                  {/* Icon */}
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15">
                    <BookOpen className="h-5 w-5 text-primary" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <Link href={`/document/${doc.id}`}>
                      <h3 className="font-semibold text-foreground hover:text-primary transition-colors truncate">
                        {doc.title}
                      </h3>
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {doc.filename} · {Math.round(doc.textLength / 1000)}k chars · {formatDistanceToNow(doc.createdAt)}
                    </p>

                    {/* Status pills */}
                    <div className="flex items-center gap-2 mt-2.5">
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
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/tutor?doc=${doc.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Ask tutor">
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Link href={`/document/${doc.id}`}>
                      <Button variant="outline" size="sm">
                        Open
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(doc.id, doc.title)}
                      disabled={deleting === doc.id}
                      title="Delete"
                    >
                      {deleting === doc.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
