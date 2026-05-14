"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useChallengeListener } from "@/hooks/useChallengeListener";
import { ChallengeModal } from "@/components/compete/ChallengeModal";

interface PendingChallenge {
  matchId: string;
  hostName: string;
  documentTitle: string;
  questionCount: number;
  sharedDocumentId: string | null;
}

interface InvitationDetail {
  id: string;
  hostProfile: { displayName: string } | null;
  totalQuestions: number;
  sharedDocumentId: string | null;
  documentTitle?: string;
}

export function ChallengeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [pendingChallenge, setPendingChallenge] = useState<PendingChallenge | null>(null);
  const pendingChallengeRef = useRef<PendingChallenge | null>(null);
  pendingChallengeRef.current = pendingChallenge;

  const onChallenge = useCallback(async (matchId: string) => {
    if (pendingChallengeRef.current) return;
    try {
      const res = await fetch("/api/match/invitations");
      if (!res.ok) return;
      const data = await res.json();
      const invs: InvitationDetail[] = data.invitations ?? [];
      const inv = invs.find((i) => i.id === matchId);
      if (!inv) return;
      setPendingChallenge({
        matchId: inv.id,
        hostName: inv.hostProfile?.displayName ?? "Someone",
        documentTitle: inv.documentTitle ?? "Unknown document",
        questionCount: inv.totalQuestions,
        sharedDocumentId: inv.sharedDocumentId,
      });
    } catch {
      // ignore network errors
    }
  }, []); // stable — reads pendingChallengeRef instead of state

  // Pass null while auth is loading to avoid subscribing as wrong user
  useChallengeListener(loading ? null : user?.id, onChallenge);

  async function handleAccept() {
    if (!pendingChallenge) return;
    const res = await fetch("/api/match/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: pendingChallenge.matchId }),
    });
    if (res.ok) {
      setPendingChallenge(null);
      router.push(`/match/${pendingChallenge.matchId}`);
    }
  }

  async function handleDecline() {
    if (!pendingChallenge) return;
    try {
      await fetch(`/api/match/${pendingChallenge.matchId}/decline`, {
        method: "POST",
      });
    } catch {
      // ignore
    }
    setPendingChallenge(null);
  }

  return (
    <>
      {pendingChallenge && (
        <ChallengeModal
          matchId={pendingChallenge.matchId}
          hostName={pendingChallenge.hostName}
          documentTitle={pendingChallenge.documentTitle}
          questionCount={pendingChallenge.questionCount}
          sharedDocumentId={pendingChallenge.sharedDocumentId}
          onAccept={handleAccept}
          onDecline={handleDecline}
        />
      )}
      {children}
    </>
  );
}
