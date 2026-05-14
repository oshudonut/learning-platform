"use client";

import { useState, useRef, useEffect } from "react";
import { Folder, Trash2, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type FolderOption = { id: string; name: string; color: string };

const folderColorMap: Record<string, { bg: string; icon: string; border: string }> = {
  blue:    { bg: "bg-blue-500/10",    icon: "text-blue-400",    border: "border-blue-500/20"    },
  purple:  { bg: "bg-purple-500/10",  icon: "text-purple-400",  border: "border-purple-500/20"  },
  green:   { bg: "bg-green-500/10",   icon: "text-green-400",   border: "border-green-500/20"   },
  amber:   { bg: "bg-amber-500/10",   icon: "text-amber-400",   border: "border-amber-500/20"   },
  rose:    { bg: "bg-rose-500/10",    icon: "text-rose-400",    border: "border-rose-500/20"    },
  sky:     { bg: "bg-sky-500/10",     icon: "text-sky-400",     border: "border-sky-500/20"     },
  indigo:  { bg: "bg-indigo-500/10",  icon: "text-indigo-400",  border: "border-indigo-500/20"  },
  emerald: { bg: "bg-emerald-500/10", icon: "text-emerald-400", border: "border-emerald-500/20" },
};

type FolderCardProps = {
  folder: FolderOption;
  docCount: number;
  onSelect: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
};

export function FolderCard({ folder, docCount, onSelect, onRename, onDelete }: FolderCardProps) {
  const colors = folderColorMap[folder.color] ?? folderColorMap["blue"];
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(folder.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  function submitRename() {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== folder.name) onRename(folder.id, trimmed);
    setRenaming(false);
  }

  return (
    <div
      className={cn(
        "group relative rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md",
        colors.bg,
        colors.border,
      )}
      onClick={() => !renaming && !confirmDelete && onSelect()}
    >
      {/* Icon + name */}
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 flex-shrink-0", colors.icon)}>
          <Folder className="h-5 w-5 fill-current opacity-30" />
        </div>
        <div className="flex-1 min-w-0">
          {renaming ? (
            <input
              ref={inputRef}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") { setRenaming(false); setNameInput(folder.name); }
              }}
              onBlur={submitRename}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-transparent text-sm font-medium text-foreground border-b border-foreground/30 focus:outline-none pb-0.5"
            />
          ) : (
            <p className="text-sm font-medium text-foreground truncate">{folder.name}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {docCount} document{docCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Actions */}
      {confirmDelete ? (
        <div
          className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-destructive/10 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-xs text-destructive font-medium">Delete folder?</span>
          <button
            className="flex items-center gap-1 rounded-md bg-destructive px-2 py-1 text-xs text-white"
            onClick={() => { setConfirmDelete(false); onDelete(folder.id); }}
          >
            <Check className="h-3 w-3" /> Yes
          </button>
          <button
            className="rounded-md border border-border px-2 py-1 text-xs"
            onClick={() => setConfirmDelete(false)}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div
          className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            title="Rename"
            onClick={() => setRenaming(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
