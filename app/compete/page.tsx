"use client";

import { Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

export default function CompetePage() {
  return (
    <AppShell>
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="text-center max-w-md space-y-5">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600/15 ring-1 ring-indigo-500/25">
              <Wrench className="h-7 w-7 text-indigo-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white">Compete — Coming Soon</h1>
            <p className="text-sm text-gray-400 leading-relaxed">
              Realtime multiplayer is currently being optimized for stability.
              We&apos;re improving synchronization and session reliability before
              re-enabling challenges.
            </p>
          </div>
          <div className="rounded-xl bg-gray-800/60 border border-gray-700/60 px-5 py-4 text-left space-y-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">What&apos;s in progress</p>
            <ul className="text-sm text-gray-400 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                Realtime lobby synchronization
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                Session state persistence across reconnects
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                Invitation delivery reliability
              </li>
            </ul>
          </div>
          <p className="text-xs text-gray-600">
            In the meantime, keep studying with Flashcards, AI Tutor, and your Library.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
