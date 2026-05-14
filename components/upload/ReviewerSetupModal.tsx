"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  FolderPlus,
  Folder,
  ChevronDown,
  Brain,
  Zap,
  Clock,
  Network,
  Key,
  BookOpen,
  Inbox,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LearningMethod } from "@/lib/types";

type FolderOption = { id: string; name: string; color: string };

type ReviewerSetupModalProps = {
  docId: string;
  defaultTitle: string;
  folders: FolderOption[];
  onConfirm: (opts: {
    reviewerName: string;
    folderId: string | null;
    learningMethod: LearningMethod | null;
  }) => Promise<void>;
  onCancel: () => void;
};

type MethodCard = {
  id: LearningMethod;
  label: string;
  description: string;
  icon: React.ElementType;
};

const METHODS: MethodCard[] = [
  { id: "feynman",           label: "Feynman",           description: "Explain it simply",      icon: Brain    },
  { id: "active_recall",    label: "Active Recall",     description: "Test yourself",           icon: Zap      },
  { id: "spaced_repetition",label: "Spaced Repetition", description: "Review at intervals",     icon: Clock    },
  { id: "mind_maps",        label: "Mind Maps",         description: "Connect concepts",        icon: Network  },
  { id: "mnemonic",         label: "Mnemonic",          description: "Memory tricks",           icon: Key      },
  { id: "elaboration",      label: "Elaboration",       description: "Deep explanations",       icon: BookOpen },
];

const folderColorMap: Record<string, { bg: string; text: string; dot: string }> = {
  blue:    { bg: "bg-blue-500/10",    text: "text-blue-400",    dot: "bg-blue-400"    },
  purple:  { bg: "bg-purple-500/10",  text: "text-purple-400",  dot: "bg-purple-400"  },
  green:   { bg: "bg-green-500/10",   text: "text-green-400",   dot: "bg-green-400"   },
  amber:   { bg: "bg-amber-500/10",   text: "text-amber-400",   dot: "bg-amber-400"   },
  rose:    { bg: "bg-rose-500/10",    text: "text-rose-400",    dot: "bg-rose-400"    },
  sky:     { bg: "bg-sky-500/10",     text: "text-sky-400",     dot: "bg-sky-400"     },
  indigo:  { bg: "bg-indigo-500/10",  text: "text-indigo-400",  dot: "bg-indigo-400"  },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
};

function FolderDot({ color }: { color: string }) {
  const map = folderColorMap[color] ?? folderColorMap["blue"];
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full flex-shrink-0", map.dot)} />;
}

export function ReviewerSetupModal({
  docId: _docId,
  defaultTitle,
  folders: initialFolders,
  onConfirm,
  onCancel,
}: ReviewerSetupModalProps) {
  const [reviewerName, setReviewerName] = useState(defaultTitle);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<LearningMethod | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Folder dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [folders, setFolders] = useState<FolderOption[]>(initialFolders);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderCreating, setNewFolderCreating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setCreatingFolder(false);
        setNewFolderName("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus new folder input when shown
  useEffect(() => {
    if (creatingFolder) {
      newFolderInputRef.current?.focus();
    }
  }, [creatingFolder]);

  const selectedFolder = folders.find((f) => f.id === selectedFolderId) ?? null;

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name || newFolderCreating) return;
    setNewFolderCreating(true);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", name, color: "blue" }),
      });
      const data = await res.json() as { folder?: FolderOption };
      if (data.folder) {
        setFolders((prev) => [...prev, data.folder!]);
        setSelectedFolderId(data.folder.id);
      }
    } finally {
      setNewFolderCreating(false);
      setCreatingFolder(false);
      setNewFolderName("");
      setDropdownOpen(false);
    }
  }

  async function handleConfirm() {
    if (confirming) return;
    setConfirming(true);
    await onConfirm({ reviewerName, folderId: selectedFolderId, learningMethod: selectedMethod });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="w-full max-w-lg rounded-2xl bg-gray-800 border border-gray-700 p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Set up your reviewer</h2>
            <p className="text-sm text-gray-400 mt-0.5">Customize before generating</p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-white transition-colors rounded-lg p-1 -mt-1 -mr-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Section 1: Reviewer name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Reviewer name
            </label>
            <input
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              className="w-full rounded-lg bg-gray-700/50 border border-gray-600 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-colors"
            />
          </div>

          {/* Section 2: Folder selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Folder
            </label>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className="w-full flex items-center gap-2.5 rounded-lg bg-gray-700/50 border border-gray-600 px-3 py-2.5 text-sm text-left transition-colors hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-white/20"
              >
                {selectedFolder ? (
                  <>
                    <FolderDot color={selectedFolder.color} />
                    <span className="flex-1 text-white">{selectedFolder.name}</span>
                  </>
                ) : (
                  <>
                    <Inbox className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    <span className="flex-1 text-gray-400">No folder (Unfiled)</span>
                  </>
                )}
                <ChevronDown className={cn("h-4 w-4 text-gray-500 transition-transform", dropdownOpen && "rotate-180")} />
              </button>

              <AnimatePresence>
                {dropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute top-full left-0 right-0 mt-1 z-10 rounded-xl bg-gray-750 border border-gray-600 shadow-xl overflow-hidden"
                    style={{ backgroundColor: "#1f2937" }}
                  >
                    {/* No folder option */}
                    <button
                      type="button"
                      onClick={() => { setSelectedFolderId(null); setDropdownOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left hover:bg-white/5 transition-colors",
                        selectedFolderId === null ? "text-white bg-white/5" : "text-gray-400",
                      )}
                    >
                      <Inbox className="h-4 w-4 flex-shrink-0" />
                      <span>No folder (Unfiled)</span>
                      {selectedFolderId === null && <Check className="h-3.5 w-3.5 ml-auto text-white" />}
                    </button>

                    {/* Existing folders */}
                    {folders.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => { setSelectedFolderId(f.id); setDropdownOpen(false); }}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left hover:bg-white/5 transition-colors",
                          selectedFolderId === f.id ? "text-white bg-white/5" : "text-gray-300",
                        )}
                      >
                        <FolderDot color={f.color} />
                        <span className="flex-1">{f.name}</span>
                        {selectedFolderId === f.id && <Check className="h-3.5 w-3.5 ml-auto text-white" />}
                      </button>
                    ))}

                    {/* Divider */}
                    <div className="border-t border-gray-700 my-1" />

                    {/* Create new folder */}
                    {creatingFolder ? (
                      <div className="px-3 py-2.5 flex items-center gap-2">
                        <FolderPlus className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <input
                          ref={newFolderInputRef}
                          type="text"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleCreateFolder();
                            if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
                          }}
                          placeholder="Folder name…"
                          className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void handleCreateFolder()}
                          disabled={!newFolderName.trim() || newFolderCreating}
                          className="text-xs text-white bg-white/10 hover:bg-white/20 rounded px-2 py-1 transition-colors disabled:opacity-50"
                        >
                          {newFolderCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCreatingFolder(true)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-left"
                      >
                        <FolderPlus className="h-4 w-4 flex-shrink-0" />
                        <span>+ New folder</span>
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Section 3: Learning method */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Learning method <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map(({ id, label, description, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedMethod(selectedMethod === id ? null : id)}
                  className={cn(
                    "cursor-pointer rounded-xl border p-3 text-left transition-all",
                    selectedMethod === id
                      ? "bg-white/8 border-white/30 ring-1 ring-white/20"
                      : "bg-gray-700/40 border-gray-600 hover:border-gray-500",
                  )}
                >
                  <Icon className="h-4 w-4 text-gray-300 mb-1.5" />
                  <div className="text-sm font-medium text-white leading-tight">{label}</div>
                  <div className="text-xs text-gray-400 mt-0.5 leading-tight">{description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-5 border-t border-gray-700">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="text-gray-400 hover:text-white"
          >
            Skip
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={confirming}
            className="bg-white text-gray-900 hover:bg-gray-100 font-medium min-w-[160px]"
          >
            {confirming ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Generating…</>
            ) : (
              "Generate Reviewer"
            )}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
