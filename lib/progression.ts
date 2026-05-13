import type { CheckpointStatus, DocumentProgression, QuizDifficultyLevel, ReviewerSectionStatus } from "./types";

export const DIFFICULTY_LEVELS: QuizDifficultyLevel[] = [
  "beginner", "intermediate", "advanced", "board_exam", "extreme_recall"
];

export const PASSING_SCORE = 95;

export function getCheckpointThreshold(checkpointIndex: number, totalSections: number): number {
  const pct = (checkpointIndex + 1) * 0.2;
  return Math.ceil(totalSections * pct);
}

export function getSectionsForCheckpoint(checkpointIndex: number, totalSections: number): number[] {
  const prevThreshold = checkpointIndex === 0 ? 0 : getCheckpointThreshold(checkpointIndex - 1, totalSections);
  const thisThreshold = getCheckpointThreshold(checkpointIndex, totalSections);
  const indices: number[] = [];
  for (let i = prevThreshold; i < thisThreshold; i++) {
    indices.push(i);
  }
  return indices;
}

export function buildInitialProgression(documentId: string, totalSections: number): DocumentProgression {
  const now = Date.now();
  const sectionStatuses: ReviewerSectionStatus[] = Array.from({ length: totalSections }, (_, i) => ({
    sectionIndex: i,
    completed: false,
    completedAt: null,
  }));
  const checkpointStatuses: CheckpointStatus[] = Array.from({ length: 5 }, (_, i) => ({
    checkpointIndex: i,
    sectionsCovered: getSectionsForCheckpoint(i, totalSections),
    flashcardsGenerated: false,
    completed: false,
    completedAt: null,
  }));
  return {
    documentId,
    sectionStatuses,
    checkpointStatuses,
    quizUnlocked: false,
    masteredAt: null,
    currentDifficultyLevel: "beginner",
    remediationActive: false,
    remediationCompletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function getCompletedSectionCount(progression: DocumentProgression): number {
  return progression.sectionStatuses.filter(s => s.completed).length;
}

export function getPendingCheckpoint(progression: DocumentProgression): number | null {
  for (const cp of progression.checkpointStatuses) {
    if (!cp.completed) {
      const completedCount = getCompletedSectionCount(progression);
      const threshold = getCheckpointThreshold(cp.checkpointIndex, progression.sectionStatuses.length);
      if (completedCount >= threshold) return cp.checkpointIndex;
    }
  }
  return null;
}

export function isQuizUnlockEligible(progression: DocumentProgression): boolean {
  const allSections = progression.sectionStatuses.every(s => s.completed);
  const allCheckpoints = progression.checkpointStatuses.every(c => c.completed);
  return allSections && allCheckpoints;
}

export function nextDifficultyLevel(current: QuizDifficultyLevel): QuizDifficultyLevel {
  const idx = DIFFICULTY_LEVELS.indexOf(current);
  return DIFFICULTY_LEVELS[Math.min(idx + 1, DIFFICULTY_LEVELS.length - 1)];
}
