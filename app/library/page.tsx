"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  FileText,
  Loader2,
  RefreshCw,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { FolderCard } from "@/components/library/FolderCard";
import { DocumentCard } from "@/components/library/DocumentCard";

type FolderMeta = { id: string; name: string; color: string };

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

export default function LibraryPage() {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  // Rename dialog
  const [renamingDoc, setRenamingDoc] = useState<{ id: string; title: string } | null>(null);
  const [renameInput, setRenameInput] = useState("");

  async function fetchAll() {
    setLoading(true);
    try {
      const [libRes, folderRes] = await Promise.all([
        fetch("/api/library"),
        fetch("/api/folders"),
      ]);
      const libData = await libRes.json() as { documents?: DocMeta[] };
      const folderData = await folderRes.json() as { folders?: FolderMeta[] };
      setDocs(libData.documents ?? []);
      setFolders(folderData.folders ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchAll(); }, []);

  // ─── Folder CRUD ────────────────────────────────────────────────────────────

  async function handleFolderRename(id: string, name: string) {
    const prev = folders;
    setFolders((f) => f.map((x) => (x.id === id ? { ...x, name } : x)));
    try {
      await fetch("/api/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update", id, name }),
      });
    } catch {
      setFolders(prev);
    }
  }

  async function handleFolderDelete(id: string) {
    const prev = folders;
    setFolders((f) => f.filter((x) => x.id !== id));
    // Move affected docs to unfiled optimistically
    setDocs((d) => d.map((doc) => (doc.folderId === id ? { ...doc, folderId: null } : doc)));
    if (activeFolder === id) setActiveFolder(null);
    try {
      await fetch("/api/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
    } catch {
      setFolders(prev);
    }
  }

  // ─── Document CRUD ───────────────────────────────────────────────────────────

  async function handleDocDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDocs((d) => d.filter((x) => x.id !== id));
    try {
      await fetch("/api/library", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch { void fetchAll(); }
  }

  function handleDocRenameOpen(id: string, currentTitle: string) {
    setRenamingDoc({ id, title: currentTitle });
    setRenameInput(currentTitle);
  }

  async function submitDocRename() {
    if (!renamingDoc) return;
    const trimmed = renameInput.trim();
    if (!trimmed) { setRenamingDoc(null); return; }
    setDocs((d) => d.map((x) => (x.id === renamingDoc.id ? { ...x, title: trimmed } : x)));
    setRenamingDoc(null);
    await fetch("/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rename_document", docId: renamingDoc.id, title: trimmed }),
    });
  }

  async function handleDocMove(id: string, folderId: string | null) {
    setDocs((d) => d.map((x) => (x.id === id ? { ...x, folderId } : x)));
    await fetch("/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "move_document", docId: id, folderId }),
    });
  }

  // ─── Derived state ───────────────────────────────────────────────────────────

  const searchFilter = (d: DocMeta) =>
    !search ||
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    d.filename.toLowerCase().includes(search.toLowerCase());

  const activeFolderMeta = folders.find((f) => f.id === activeFolder) ?? null;

  const visibleDocs = activeFolder !== null
    ? docs.filter((d) => d.folderId === activeFolder && searchFilter(d))
    : docs.filter((d) => d.folderId === null && searchFilter(d));

  const docCountInFolder = (folderId: string) => docs.filter((d) => d.folderId === folderId).length;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Rename dialog */}
      {renamingDoc && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 shadow-2xl">
            <h2 className="text-sm font-semibold text-foreground mb-3">Rename document</h2>
            <input
              autoFocus
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void submitDocRename(); if (e.key === "Escape") setRenamingDoc(null); }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex gap-2 mt-4 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setRenamingDoc(null)}>Cancel</Button>
              <Button size="sm" onClick={() => void submitDocRename()}>Rename</Button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6 sm:mb-8">
          <div className="min-w-0">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <button
                className="hover:text-foreground transition-colors"
                onClick={() => setActiveFolder(null)}
              >
                Library
              </button>
              {activeFolderMeta && (
                <>
                  <ChevronRight className="h-3.5 w-3.5" />
                  <span className="text-foreground font-medium">{activeFolderMeta.name}</span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {activeFolder === null
                ? `${folders.length} folder${folders.length !== 1 ? "s" : ""} · ${docs.filter((d) => d.folderId === null).length} unfiled`
                : `${visibleDocs.length} document${visibleDocs.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="ghost" size="icon" onClick={() => void fetchAll()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Link href="/">
              <Button variant="accent" className="min-h-[44px]">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Upload Document</span>
                <span className="sm:hidden">Upload</span>
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

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
        ) : activeFolder === null ? (
          <>
            {/* Folder grid */}
            {folders.length > 0 && (
              <section className="mb-8">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Folders</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {folders.map((folder) => (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      docCount={docCountInFolder(folder.id)}
                      onSelect={() => setActiveFolder(folder.id)}
                      onRename={handleFolderRename}
                      onDelete={handleFolderDelete}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Unfiled documents */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Inbox className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unfiled</h2>
              </div>
              {visibleDocs.length === 0 ? (
                <div className="flex flex-col items-center text-center py-16 gap-4">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">
                      {search ? "No documents match" : "No unfiled documents"}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {search ? "Try a different search" : "All documents are in folders"}
                    </p>
                  </div>
                  {!search && (
                    <Link href="/">
                      <Button variant="accent" size="sm">
                        <Plus className="h-4 w-4" />
                        Upload a document
                      </Button>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleDocs.map((doc, i) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      index={i}
                      folders={folders}
                      onDelete={handleDocDelete}
                      onRename={handleDocRenameOpen}
                      onMove={handleDocMove}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          /* Folder drill-down view */
          <section>
            {visibleDocs.length === 0 ? (
              <div className="flex flex-col items-center text-center py-24 gap-4">
                <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                  <FileText className="h-7 w-7 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    {search ? "No documents match" : "This folder is empty"}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {search ? "Try a different search" : "Upload a document and move it here"}
                  </p>
                </div>
                {!search && (
                  <Link href="/">
                    <Button variant="accent">
                      <Plus className="h-4 w-4" />
                      Upload Document
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {visibleDocs.map((doc, i) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    index={i}
                    folders={folders}
                    onDelete={handleDocDelete}
                    onRename={handleDocRenameOpen}
                    onMove={handleDocMove}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
