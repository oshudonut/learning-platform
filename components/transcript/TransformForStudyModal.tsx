"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { MethodSelection } from "@/components/reviewer/MethodSelection";
import type { LearningMethod, StudyMode } from "@/lib/types";

interface TransformForStudyModalProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (method: LearningMethod, mode: StudyMode) => Promise<void>;
}

export function TransformForStudyModal({ open, onClose, onGenerate }: TransformForStudyModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors z-10"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="px-6 pt-6 pb-6">
              <MethodSelection onGenerate={onGenerate} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
