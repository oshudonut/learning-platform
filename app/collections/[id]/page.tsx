"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Plus,
  BookOpen,
  ChevronRight,
  GripVertical,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Search,
  Download,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CollectionItem = {
  id: string;
  collectionId: string;
  documentId: string;
  documentTitle: string;
  hasReviewer: boolean;
  position: number;
  addedAt: number;
};

type Collection = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  createdAt: number;
  updatedAt: number;
};

type LibraryDoc = {
  id: string;
  title: string;
  hasReviewer: boolean;
};

const COLOR_CLASSES: Record<string, { text: string; border: string; bg: string }> = {
  blue:    { text: "text-blue-500",    border: "border-blue-500/20",    bg: "bg-blue-500/10" },
  purple:  { text: "text-purple-500",  border: "border-purple-500/20",  bg: "bg-purple-500/10" },
  green:   { text: "text-green-500",   border: "border-green-500/20",   bg: "bg-green-500/10" },
  amber:   { text: "text-amber-500",   border: "border-amber-500/20",   bg: "bg-amber-500/10" },
  rose:    { text: "text-rose-500",    border: "border-rose-500/20",    bg: "bg-rose-500/10" },
  sky:     { text: "text-sky-500",     border: "border-sky-500/20",     bg: "bg-sky-500/10" },
  indigo:  { text: "text-indigo-500",  border: "border-indigo-500/20",  bg: "bg-indigo-500/10" },
  emerald: { text: "text-emerald-500", border: "border-emerald-500/20", bg: "bg-emerald-500/10" },
};

function getColor(color: string) {
  return COLOR_CLASSES[color] ?? COLOR_CLASSES.blue;
}

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addingDoc, setAddingDoc] = useState(false);
  const [libraryDocs, setLibraryDocs] = useState<LibraryDoc[]>([]);
  const [docSearch, setDocSearch] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const fetchCollection = useCallback(async () => {
    setLoading(true);
    try {
      const [colRes, itemsRes] = await Promise.all([
        fetch(`/api/collections/${id}`),
        fetch(`/api/collections/${id}/items`),
      ]);
      if (!colRes.ok) { setError("Collection not found"); return; }
      const colData = await colRes.json() as { collection?: Collection };
      const itemsData = await itemsRes.json() as { items?: CollectionItem[] };
      setCollection(colData.collection ?? null);
      setItems((itemsData.items ?? []).sort((a, b) => a.position - b.position));
    } catch {
      setError("Failed to load collection");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void fetchCollection(); }, [fetchCollection]);

  async function fetchLibraryDocs() {
    const res = await fetch("/api/library");
    const data = await res.json() as { documents?: LibraryDoc[] };
    setLibraryDocs(data.documents ?? []);
  }

  async function handleAddDoc(documentId: string) {
    setAddingId(documentId);
    try {
      const res = await fetch(`/api/collections/${id}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const data = await res.json() as { item?: CollectionItem };
      if (data.item) {
        setItems((prev) => [...prev, data.item!]);
        setAddingDoc(false);
        setDocSearch("");
      }
    } finally {
      setAddingId(null);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/export?collectionId=${id}`);
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        alert(data.error ?? "Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${collection?.name ?? "collection"}_reviewer.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleRemove(documentId: string) {
    if (!confirm("Remove this document from the collection?")) return;
    await fetch(`/api/collections/${id}/items`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ documentId }),
    });
    setItems((prev) => prev.filter((i) => i.documentId !== documentId));
  }

  // Drag-and-drop reorder
  function handleDragStart(itemId: string) {
    setDraggingId(itemId);
  }

  function handleDragOver(e: React.DragEvent, itemId: string) {
    e.preventDefault();
    setDragOverId(itemId);
  }

  async function handleDrop(targetItem: CollectionItem) {
    if (!draggingId || draggingId === targetItem.id) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    const sorted = [...items].sort((a, b) => a.position - b.position);
    const targetIdx = sorted.findIndex((i) => i.id === targetItem.id);
    const prevPos = sorted[targetIdx - 1]?.position ?? 0;
    const nextPos = sorted[targetIdx + 1]?.position ?? (targetItem.position + 2);
    const newPosition = (prevPos + nextPos) / 2;

    // Optimistic update
    setItems((prev) =>
      prev.map((i) => i.id === draggingId ? { ...i, position: newPosition } : i)
        .sort((a, b) => a.position - b.position)
    );
    setDraggingId(null);
    setDragOverId(null);

    await fetch(`/api/collections/${id}/items`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: draggingId, newPosition }),
    });
  }

  if (loading) {
    return (
      <AppShell mainClassName="flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </AppShell>
    );
  }

  if (error || !collection) {
    return (
      <AppShell mainClassName="flex flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold">{error ?? "Collection not found"}</h2>
        <Link href="/collections"><Button variant="outline"><ArrowLeft className="h-4 w-4" />Back to Collections</Button></Link>
      </AppShell>
    );
  }

  const c = getColor(collection.color);
  const alreadyAddedIds = new Set(items.map((i) => i.documentId));
  const filteredDocs = libraryDocs
    .filter((d) => !alreadyAddedIds.has(d.id))
    .filter((d) => d.title.toLowerCase().includes(docSearch.toLowerCase()));

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/collections" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft className="h-4 w-4" />Collections
          </Link>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center ring-1 flex-shrink-0", c.bg, c.border)}>
                <FolderOpen className={cn("h-5 w-5", c.text)} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">{collection.name}</h1>
                {collection.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">{collection.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleExport()}
                  disabled={exporting}
                  title="Export all unlocked documents as a single DOCX"
                >
                  {exporting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Export DOCX
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setAddingDoc(true); void fetchLibraryDocs(); }}
              >
                <Plus className="h-3.5 w-3.5" />Add Document
              </Button>
            </div>
          </div>
        </div>

        {/* Add document picker */}
        {addingDoc && (
          <div className="mb-6 rounded-xl border border-border bg-secondary/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Add a document</h3>
              <button onClick={() => { setAddingDoc(false); setDocSearch(""); }} className="text-muted-foreground hover:text-foreground">
                ×
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                placeholder="Search documents…"
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {libraryDocs.length === 0 ? "No documents in library" : "No matching documents"}
                </p>
              ) : (
                filteredDocs.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => void handleAddDoc(doc.id)}
                    disabled={addingId === doc.id}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
                  >
                    {addingId === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" />
                    ) : (
                      <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="truncate flex-1">{doc.title}</span>
                    {doc.hasReviewer && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success flex-shrink-0" aria-label="Has reviewer" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Items list */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <BookOpen className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">No documents yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Add reviewers to build your study sequence</p>
            </div>
            <Button variant="outline" onClick={() => { setAddingDoc(true); void fetchLibraryDocs(); }}>
              <Plus className="h-4 w-4" />Add your first document
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => handleDragStart(item.id)}
                onDragOver={(e) => handleDragOver(e, item.id)}
                onDrop={() => void handleDrop(item)}
                onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3 transition-all",
                  draggingId === item.id && "opacity-40",
                  dragOverId === item.id && draggingId !== item.id && "border-primary/50 bg-primary/5",
                )}
              >
                {/* Drag handle */}
                <GripVertical className="h-4 w-4 text-muted-foreground/50 flex-shrink-0 cursor-grab active:cursor-grabbing" />

                {/* Position number */}
                <span className="text-xs font-bold text-muted-foreground/60 w-5 flex-shrink-0 text-center">{idx + 1}</span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{item.documentTitle}</p>
                  {item.hasReviewer && (
                    <p className="text-[10px] text-success flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="h-3 w-3" />Reviewer ready
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => void handleRemove(item.documentId)}
                    className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all"
                    title="Remove from collection"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <Link
                  href={`/document/${item.documentId}`}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                >
                  Study <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
