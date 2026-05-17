"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FolderOpen,
  Plus,
  Loader2,
  BookOpen,
  ChevronRight,
  Trash2,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "@/lib/utils";

type Collection = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  createdAt: number;
  updatedAt: number;
};

const COLOR_OPTIONS = ["blue", "purple", "green", "amber", "rose", "sky", "indigo", "emerald"];

const COLOR_CLASSES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  blue:    { bg: "bg-blue-500/10",    text: "text-blue-500",    border: "border-blue-500/20",    dot: "bg-blue-400" },
  purple:  { bg: "bg-purple-500/10",  text: "text-purple-500",  border: "border-purple-500/20",  dot: "bg-purple-400" },
  green:   { bg: "bg-green-500/10",   text: "text-green-500",   border: "border-green-500/20",   dot: "bg-green-400" },
  amber:   { bg: "bg-amber-500/10",   text: "text-amber-500",   border: "border-amber-500/20",   dot: "bg-amber-400" },
  rose:    { bg: "bg-rose-500/10",    text: "text-rose-500",    border: "border-rose-500/20",    dot: "bg-rose-400" },
  sky:     { bg: "bg-sky-500/10",     text: "text-sky-500",     border: "border-sky-500/20",     dot: "bg-sky-400" },
  indigo:  { bg: "bg-indigo-500/10",  text: "text-indigo-500",  border: "border-indigo-500/20",  dot: "bg-indigo-400" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/20", dot: "bg-emerald-400" },
};

function getColor(color: string) {
  return COLOR_CLASSES[color] ?? COLOR_CLASSES.blue;
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newColor, setNewColor] = useState("blue");
  const [saving, setSaving] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function fetchCollections() {
    setLoading(true);
    try {
      const res = await fetch("/api/collections");
      const data = await res.json() as { collections?: Collection[] };
      setCollections(data.collections ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchCollections(); }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDescription.trim() || null, color: newColor }),
      });
      const data = await res.json() as { collection?: Collection };
      if (data.collection) {
        setCollections((prev) => [data.collection!, ...prev]);
        setCreating(false);
        setNewName("");
        setNewDescription("");
        setNewColor("blue");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this collection? The documents inside won't be affected.")) return;
    await fetch(`/api/collections/${id}`, { method: "DELETE" });
    setCollections((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleRename(id: string) {
    if (!renameValue.trim()) return;
    const res = await fetch(`/api/collections/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    const data = await res.json() as { collection?: Collection };
    if (data.collection) {
      setCollections((prev) => prev.map((c) => c.id === id ? data.collection! : c));
    }
    setRenamingId(null);
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Collections</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Group your reviewers into ordered study sequences
            </p>
          </div>
          <Button variant="accent" onClick={() => setCreating(true)} disabled={creating}>
            <Plus className="h-4 w-4" />New Collection
          </Button>
        </div>

        {/* Create form */}
        {creating && (
          <div className="mb-6 rounded-xl border border-border bg-secondary/30 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">New Collection</h3>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); if (e.key === "Escape") setCreating(false); }}
              placeholder="Collection name"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            {/* Color picker */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Color:</span>
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={cn(
                    "h-5 w-5 rounded-full transition-all ring-offset-background",
                    getColor(c).dot,
                    newColor === c ? "ring-2 ring-offset-2 ring-foreground/50" : "",
                  )}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="accent" size="sm" onClick={handleCreate} disabled={saving || !newName.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Create
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                <X className="h-4 w-4" />Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Collections list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : collections.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <FolderOpen className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">No collections yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create a collection to organize your reviewers into study sequences
              </p>
            </div>
            <Button variant="accent" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />Create your first collection
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {collections.map((col) => {
              const c = getColor(col.color);
              return (
                <div
                  key={col.id}
                  className={cn(
                    "group flex items-center gap-4 rounded-xl border p-4 transition-all",
                    c.border, c.bg,
                  )}
                >
                  <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0", c.bg, "ring-1", c.border)}>
                    <FolderOpen className={cn("h-4.5 w-4.5", c.text)} />
                  </div>

                  <div className="flex-1 min-w-0">
                    {renamingId === col.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleRename(col.id);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                        <button onClick={() => void handleRename(col.id)} className="text-success hover:opacity-80"><Check className="h-4 w-4" /></button>
                        <button onClick={() => setRenamingId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <p className="font-semibold text-foreground text-sm truncate">{col.name}</p>
                    )}
                    {col.description && renamingId !== col.id && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{col.description}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Updated {formatDistanceToNow(col.updatedAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setRenamingId(col.id); setRenameValue(col.name); }}
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-all"
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => void handleDelete(col.id)}
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <Link
                    href={`/collections/${col.id}`}
                    className={cn(
                      "flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all flex-shrink-0",
                      c.text, "hover:opacity-80",
                    )}
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Open
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
