"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, BookOpen, ExternalLink, Loader2 } from "lucide-react";

type Props = {
  matchId: string;
  hostName: string;
  documentTitle: string;
  questionCount: number;
  sharedDocumentId: string | null;
  onAccept: () => Promise<void>;
  onDecline: () => Promise<void>;
};

export function ChallengeModal({
  hostName,
  documentTitle,
  questionCount,
  sharedDocumentId,
  onAccept,
  onDecline,
}: Props) {
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);

  async function handleAccept() {
    setAccepting(true);
    try {
      await onAccept();
    } finally {
      setAccepting(false);
    }
  }

  async function handleDecline() {
    setDeclining(true);
    try {
      await onDecline();
    } finally {
      setDeclining(false);
    }
  }

  // Derive avatar initial from hostName
  const initial = (hostName || "?")[0].toUpperCase();

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="challenge-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      >
        {/* Modal card */}
        <motion.div
          key="challenge-card"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl overflow-hidden"
        >
          {/* Top accent stripe */}
          <div className="h-1 w-full bg-gradient-to-r from-indigo-500 to-violet-500" />

          <div className="p-6 space-y-5">
            {/* Host avatar + headline */}
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold ring-4 ring-indigo-500/20">
                  {initial}
                </div>
                {/* Swords badge */}
                <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-amber-500 flex items-center justify-center ring-2 ring-gray-900">
                  <Swords className="h-3 w-3 text-white" />
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-indigo-400 uppercase tracking-widest mb-0.5">
                  Challenge Received
                </p>
                <h2 className="text-lg font-bold text-white">
                  <span className="text-indigo-300">{hostName}</span>
                  {" "}challenged you!
                </h2>
              </div>
            </div>

            {/* Match details */}
            <div className="rounded-xl bg-gray-800/60 border border-gray-700/60 px-4 py-3 space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Document</p>
              <p className="text-sm font-semibold text-white truncate">{documentTitle}</p>
              <p className="text-xs text-gray-400 mt-1">
                {questionCount} question{questionCount !== 1 ? "s" : ""} &middot; First correct answer wins each point
              </p>
            </div>

            {/* Shared document study link */}
            {sharedDocumentId && (
              <a
                href={`/document/${sharedDocumentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-300 hover:text-amber-200 hover:bg-amber-500/15 transition-colors group"
              >
                <BookOpen className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 leading-snug">
                  A document was shared to your library to study
                </span>
                <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
              </a>
            )}

            {/* Action buttons */}
            <div className="space-y-2.5 pt-1">
              <button
                onClick={handleAccept}
                disabled={accepting || declining}
                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 transition-colors flex items-center justify-center gap-2"
              >
                {accepting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Joining match...
                  </>
                ) : (
                  <>
                    <Swords className="h-4 w-4" />
                    Accept Challenge
                  </>
                )}
              </button>

              <button
                onClick={handleDecline}
                disabled={accepting || declining}
                className="w-full rounded-lg py-2 text-sm text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
              >
                {declining ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Declining...
                  </>
                ) : (
                  "Decline"
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
