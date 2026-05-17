import { randomId } from "./utils";
import type { StudyPlan, StudyPlanDocument, StudyPlanItem, ReviewScheduleEvent, ReviewEventType } from "./types";
import type { DocumentProgression } from "./types";
import type { DocSummary } from "./store";

// ─── Time helpers ─────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

export function utcMidnight(ms: number): number {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ms: number, days: number): number {
  return ms + days * DAY_MS;
}

// ─── Estimated minutes per task type ─────────────────────────────────────────

const MINS = {
  perSection: 10,
  quiz: 25,
  remediation: 40,
  flashcardReview: 15,
  retentionReview: 20,
} as const;

const SECTIONS_PER_ITEM = 3;

// ─── Internal task spec ───────────────────────────────────────────────────────

type TaskSpec = {
  type: StudyPlanItem["itemType"];
  estimatedMins: number;
  sectionIndices: number[];
  metadata: Record<string, unknown>;
  delayDays?: number; // schedule N days from today (used for retention reviews)
};

function computeDocTasks(
  prog: DocumentProgression | null,
  totalSections: number,
): TaskSpec[] {
  const tasks: TaskSpec[] = [];

  if (!prog) {
    // No progression: all sections, then quiz
    for (let i = 0; i < totalSections; i += SECTIONS_PER_ITEM) {
      const indices = Array.from(
        { length: Math.min(SECTIONS_PER_ITEM, totalSections - i) },
        (_, k) => i + k,
      );
      tasks.push({ type: "read_sections", estimatedMins: indices.length * MINS.perSection, sectionIndices: indices, metadata: {} });
    }
    if (totalSections > 0) {
      tasks.push({ type: "quiz", estimatedMins: MINS.quiz, sectionIndices: [], metadata: {} });
    }
    return tasks;
  }

  if (prog.remediationActive) {
    tasks.push({ type: "remediation", estimatedMins: MINS.remediation, sectionIndices: [], metadata: {} });
    tasks.push({ type: "quiz", estimatedMins: MINS.quiz, sectionIndices: [], metadata: {} });
    return tasks;
  }

  if (prog.quizUnlocked && !prog.masteredAt) {
    tasks.push({ type: "quiz", estimatedMins: MINS.quiz, sectionIndices: [], metadata: {} });
    return tasks;
  }

  if (prog.masteredAt) {
    // Spaced retention reviews
    tasks.push({ type: "retention_review", estimatedMins: MINS.retentionReview, sectionIndices: [], metadata: { retentionStage: 1 }, delayDays: 7 });
    tasks.push({ type: "retention_review", estimatedMins: MINS.retentionReview, sectionIndices: [], metadata: { retentionStage: 2 }, delayDays: 21 });
    return tasks;
  }

  // Partially or fully unstarted
  const completedSet = new Set(
    prog.sectionStatuses.filter((s) => s.completed).map((s) => s.sectionIndex),
  );
  const remaining = Array.from({ length: totalSections }, (_, i) => i).filter(
    (i) => !completedSet.has(i),
  );

  for (let i = 0; i < remaining.length; i += SECTIONS_PER_ITEM) {
    const indices = remaining.slice(i, i + SECTIONS_PER_ITEM);
    tasks.push({ type: "read_sections", estimatedMins: indices.length * MINS.perSection, sectionIndices: indices, metadata: {} });
  }

  if (remaining.length > 0) {
    tasks.push({ type: "quiz", estimatedMins: MINS.quiz, sectionIndices: [], metadata: {} });
  }

  return tasks;
}

// ─── Plan item generation ─────────────────────────────────────────────────────

export function generatePlanItems(
  plan: StudyPlan,
  planDocs: StudyPlanDocument[],
  docs: DocSummary[],
  progressions: DocumentProgression[],
): StudyPlanItem[] {
  const progMap = new Map(progressions.map((p) => [p.documentId, p]));
  const docMap = new Map(docs.map((d) => [d.id, d]));
  const sorted = [...planDocs].sort((a, b) => a.priority - b.priority);

  const today = utcMidnight(Date.now());
  const examDay = utcMidnight(plan.examDate);
  const maxDailyMins = plan.dailyHours * 60;

  // Cumulative minutes per day
  const budget: Record<number, number> = {};

  function findNextSlot(neededMins: number): number {
    let day = today;
    while (day < examDay) {
      if ((budget[day] ?? 0) + neededMins <= maxDailyMins) return day;
      day = addDays(day, 1);
    }
    return Math.max(today, addDays(examDay, -1)); // pack into last day if no room
  }

  const now = Date.now();
  const items: StudyPlanItem[] = [];

  for (const planDoc of sorted) {
    if (planDoc.paused) continue;
    const doc = docMap.get(planDoc.documentId);
    if (!doc) continue;

    const prog = progMap.get(planDoc.documentId) ?? null;
    const totalSections = doc.conceptCount ?? 0;
    const tasks = computeDocTasks(prog, totalSections);

    for (const task of tasks) {
      let scheduledDate: number;
      if (task.delayDays) {
        scheduledDate = utcMidnight(addDays(today, task.delayDays));
      } else {
        scheduledDate = findNextSlot(task.estimatedMins);
      }

      const position = budget[scheduledDate] ?? 0;
      budget[scheduledDate] = position + task.estimatedMins;

      items.push({
        id: randomId(),
        planId: plan.id,
        documentId: planDoc.documentId,
        itemType: task.type,
        scheduledDate,
        completedAt: null,
        skippedAt: null,
        sectionIndices: task.sectionIndices,
        estimatedMins: task.estimatedMins,
        metadata: task.metadata,
        position,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return items;
}

// ─── Spaced repetition: next review event after completing an item ────────────

const INITIAL_INTERVALS: Record<StudyPlanItem["itemType"], number | null> = {
  read_sections: 1,
  quiz: 7,
  remediation: null,
  retention_review: null, // handled via rescheduling
  flashcard_review: 1,
  checkpoint: null,
};

export function buildNextReviewEvent(
  item: StudyPlanItem,
  userId: string,
  planId: string | null,
  previousEvent?: ReviewScheduleEvent,
): ReviewScheduleEvent | null {
  if (previousEvent) {
    // SM-2-derived: new interval = floor(old * ease), clamp ease 1.3–2.5
    const newInterval = Math.max(1, Math.floor(previousEvent.intervalDays * previousEvent.easeFactor));
    const newEase = Math.min(2.5, Math.max(1.3, previousEvent.easeFactor)); // maintain on completion
    const eventTypeMap: Record<StudyPlanItem["itemType"], ReviewEventType | null> = {
      read_sections: "topic_review",
      quiz: "quiz_retry",
      flashcard_review: "flashcard_review",
      remediation: null,
      retention_review: "topic_review",
      checkpoint: null,
    };
    const eventType = eventTypeMap[item.itemType];
    if (!eventType) return null;

    return {
      id: randomId(),
      userId,
      planId,
      documentId: item.documentId,
      eventType,
      dueAt: addDays(Date.now(), newInterval),
      intervalDays: newInterval,
      easeFactor: newEase,
      completedAt: null,
      createdAt: Date.now(),
    };
  }

  const initialInterval = INITIAL_INTERVALS[item.itemType];
  if (initialInterval === null) return null;

  const eventTypeMap: Record<StudyPlanItem["itemType"], ReviewEventType | null> = {
    read_sections: "topic_review",
    quiz: "quiz_retry",
    flashcard_review: "flashcard_review",
    remediation: null,
    retention_review: "topic_review",
    checkpoint: null,
  };
  const eventType = eventTypeMap[item.itemType];
  if (!eventType) return null;

  return {
    id: randomId(),
    userId,
    planId,
    documentId: item.documentId,
    eventType,
    dueAt: addDays(Date.now(), initialInterval),
    intervalDays: initialInterval,
    easeFactor: 2.5,
    completedAt: null,
    createdAt: Date.now(),
  };
}
