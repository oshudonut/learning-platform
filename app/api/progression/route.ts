import { NextRequest, NextResponse } from "next/server";
import { getProgression, upsertProgression, getDocument } from "@/lib/store";
import { buildInitialProgression, getPendingCheckpoint, isQuizUnlockEligible, nextDifficultyLevel } from "@/lib/progression";
import type { DocumentProgression } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Rebuild sectionStatuses to match the actual reviewer topic count,
 * preserving any existing completed state by index.
 */
function rebuildSectionStatuses(
  progression: DocumentProgression,
  totalSections: number,
): DocumentProgression {
  const fresh = buildInitialProgression(progression.documentId, totalSections);
  fresh.sectionStatuses = fresh.sectionStatuses.map((s) => {
    const existing = progression.sectionStatuses.find((e) => e.sectionIndex === s.sectionIndex);
    return existing ?? s;
  });
  fresh.quizUnlocked = progression.quizUnlocked;
  fresh.masteredAt = progression.masteredAt;
  fresh.currentDifficultyLevel = progression.currentDifficultyLevel;
  fresh.remediationActive = progression.remediationActive;
  fresh.remediationCompletedAt = progression.remediationCompletedAt;
  fresh.currentSectionIndex = progression.currentSectionIndex ?? 0;
  fresh.flashcardChallengeCompleted = progression.flashcardChallengeCompleted ?? false;
  fresh.createdAt = progression.createdAt;
  return fresh;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, documentId } = body as { action: string; documentId: string };

    if (!documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });

    if (action === "get") {
      let progression = await getProgression(documentId);
      const doc = await getDocument(documentId);
      if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
      const totalSections = doc.reviewer?.topics?.length ?? 0;

      if (!progression) {
        progression = buildInitialProgression(documentId, totalSections);
        await upsertProgression(progression);
      } else if (totalSections > 0 && progression.sectionStatuses.length !== totalSections) {
        // Reviewer was generated after the initial progression row was created —
        // rebuild with the correct section count, preserving completed entries.
        progression = rebuildSectionStatuses(progression, totalSections);
        await upsertProgression(progression);
      }

      return NextResponse.json({ progression });
    }

    if (action === "complete_section") {
      const { sectionIndex } = body as { sectionIndex: number };
      let progression = await getProgression(documentId);

      if (!progression) {
        const doc = await getDocument(documentId);
        const totalSections = doc?.reviewer?.topics?.length ?? 0;
        progression = buildInitialProgression(documentId, totalSections);
      }

      // If this sectionIndex doesn't exist in statuses yet, rebuild from reviewer
      if (!progression.sectionStatuses.find((s) => s.sectionIndex === sectionIndex)) {
        const doc = await getDocument(documentId);
        const totalSections = doc?.reviewer?.topics?.length ?? 0;
        progression = rebuildSectionStatuses(progression, totalSections);
      }

      const section = progression.sectionStatuses.find((s) => s.sectionIndex === sectionIndex);
      if (section && !section.completed) {
        section.completed = true;
        section.completedAt = Date.now();
      }

      // Advance currentSectionIndex to the next uncompleted section
      const nextUncompleted = progression.sectionStatuses.find((s) => !s.completed);
      progression.currentSectionIndex = nextUncompleted
        ? nextUncompleted.sectionIndex
        : progression.sectionStatuses.length; // sentinel: all done

      if (isQuizUnlockEligible(progression)) {
        progression.quizUnlocked = true;
      }

      await upsertProgression(progression);
      const pendingCheckpoint = getPendingCheckpoint(progression);
      return NextResponse.json({ progression, pendingCheckpoint });
    }

    if (action === "complete_checkpoint") {
      const { checkpointIndex } = body as { checkpointIndex: number };
      let progression = await getProgression(documentId);
      if (!progression) return NextResponse.json({ error: "Progression not found" }, { status: 404 });
      const cp = progression.checkpointStatuses.find((c) => c.checkpointIndex === checkpointIndex);
      if (cp && !cp.completed) {
        cp.completed = true;
        cp.completedAt = Date.now();
      }
      if (isQuizUnlockEligible(progression)) {
        progression.quizUnlocked = true;
      }
      await upsertProgression(progression);
      return NextResponse.json({ progression });
    }

    if (action === "complete_flashcard_challenge") {
      let progression = await getProgression(documentId);
      if (!progression) return NextResponse.json({ error: "Progression not found" }, { status: 404 });
      progression.flashcardChallengeCompleted = true;
      if (isQuizUnlockEligible(progression)) {
        progression.quizUnlocked = true;
      }
      await upsertProgression(progression);
      return NextResponse.json({ progression });
    }

    if (action === "complete_quiz") {
      const { passed } = body as { passed: boolean; difficultyLevel: string };
      let progression = await getProgression(documentId);
      if (!progression) return NextResponse.json({ error: "Progression not found" }, { status: 404 });
      if (passed) {
        progression.masteredAt = progression.masteredAt ?? Date.now();
        progression.remediationActive = false;
        progression.currentDifficultyLevel = nextDifficultyLevel(progression.currentDifficultyLevel);
      } else {
        progression.remediationActive = true;
        progression.quizUnlocked = false;
      }
      await upsertProgression(progression);
      return NextResponse.json({ progression });
    }

    if (action === "complete_remediation") {
      let progression = await getProgression(documentId);
      if (!progression) return NextResponse.json({ error: "Progression not found" }, { status: 404 });
      progression.remediationActive = false;
      progression.remediationCompletedAt = Date.now();
      progression.quizUnlocked = true;
      await upsertProgression(progression);
      return NextResponse.json({ progression });
    }

    if (action === "save_learning_profile") {
      const { learningMethod, studyMode } = body as { learningMethod: string; studyMode: string };
      let progression = await getProgression(documentId);
      if (!progression) {
        const doc = await getDocument(documentId);
        const totalSections = doc?.reviewer?.topics?.length ?? 0;
        progression = buildInitialProgression(documentId, totalSections);
      }
      progression.learningMethod = learningMethod as import("@/lib/types").LearningMethod;
      progression.studyMode = studyMode as import("@/lib/types").StudyMode;
      await upsertProgression(progression);
      return NextResponse.json({ progression });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
