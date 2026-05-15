"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  FileText,
  BookOpen,
  Loader2,
  RefreshCw,
  ChevronRight,
  Inbox,
  FolderPlus,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { FolderCard } from "@/components/library/FolderCard";
import { DocumentCard } from "@/components/library/DocumentCard";
import { cn } from "@/lib/utils";

const COLOR_OPTIONS = ["blue","purple","green","amber","rose","sky","indigo","emerald"];
const COLOR_DOTS: Record<string, string> = {
  blue: "bg-blue-400", purple: "bg-purple-400", green: "bg-green-400",
  amber: "bg-amber-400", rose: "bg-rose-400", sky: "bg-sky-400",
  indigo: "bg-indigo-400", emerald: "bg-emerald-400",
};

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

  // New folder dialog
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("blue");
  const [newFolderCreating, setNewFolderCreating] = useState(false);

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

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name || newFolderCreating) return;
    setNewFolderCreating(true);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", name, color: newFolderColor }),
      });
      const data = await res.json() as { folder?: FolderMeta };
      if (data.folder) setFolders((f) => [...f, data.folder!]);
    } finally {
      setNewFolderCreating(false);
      setNewFolderOpen(false);
      setNewFolderName("");
      setNewFolderColor("blue");
    }
  }

  async function handleFolderColorChange(id: string, color: string) {
    setFolders((f) => f.map((x) => (x.id === id ? { ...x, color } : x)));
    await fetch("/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update", id, color }),
    });
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
      {/* New folder dialog */}
      {newFolderOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 shadow-2xl">
            <h2 className="text-sm font-semibold text-foreground mb-3">New folder</h2>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreateFolder(); if (e.key === "Escape") { setNewFolderOpen(false); setNewFolderName(""); } }}
              placeholder="Folder name…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-muted-foreground">Color</span>
              <div className="flex gap-1.5">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewFolderColor(c)}
                    className={cn(
                      "h-5 w-5 rounded-full transition-all",
                      COLOR_DOTS[c],
                      newFolderColor === c ? "ring-2 ring-offset-1 ring-offset-card ring-foreground/40 scale-110" : "opacity-60 hover:opacity-100",
                    )}
                    title={c}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setNewFolderOpen(false); setNewFolderName(""); }}>Cancel</Button>
              <Button size="sm" onClick={() => void handleCreateFolder()} disabled={!newFolderName.trim() || newFolderCreating}>
                {newFolderCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}

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
            <Button variant="outline" onClick={() => setNewFolderOpen(true)} className="min-h-[44px]">
              <FolderPlus className="h-4 w-4" />
              <span className="hidden sm:inline">New Folder</span>
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

        {!loading && folders.length === 0 && docs.length === 0 && (
          <div className="flex flex-col items-center text-center py-24 gap-5">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Your library is empty</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Upload your first study material to get started. PDFs, DOCX, and images are all supported.
              </p>
            </div>
            <Link href="/">
              <Button variant="accent">
                <Plus className="h-4 w-4" />
                Upload your first document
              </Button>
            </Link>
          </div>
        )}

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
                      onColorChange={handleFolderColorChange}
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
