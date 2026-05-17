import { randomId } from "./utils";
import type { StudyPlan, StudyPlanDocument, StudyPlanItem, ReviewScheduleEvent, ReviewEventType, QuizAttempt } from "./types";
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

// ─── Daily Study Engine ───────────────────────────────────────────────────────

const BASE_SCORE: Record<StudyPlanItem["itemType"], number> = {
  remediation: 100,
  quiz: 70,
  checkpoint: 50,
  retention_review: 40,
  read_sections: 30,
  flashcard_review: 20,
};

export type ScoredItem = StudyPlanItem & {
  urgencyScore: number;
  isOverdue: boolean;
  daysPastDue: number;
  planTitle: string;
  documentTitle: string;
};

export function scoreItem(
  item: StudyPlanItem,
  now: number,
  context: {
    hasRecentFailure: boolean;
    maxConfusionLevel: number;
    planTitle: string;
    documentTitle: string;
  },
): ScoredItem {
  const todayMidnight = utcMidnight(now);
  const daysPastDue = Math.max(0, Math.floor((todayMidnight - item.scheduledDate) / DAY_MS));
  const isOverdue = daysPastDue > 0;

  let score = BASE_SCORE[item.itemType] ?? 30;
  score *= 1 + Math.min(1.0, daysPastDue * 0.1); // +10% per overdue day, cap at +100%
  if (context.hasRecentFailure) score += 30;
  if (context.maxConfusionLevel >= 4) score += 20;
  else if (context.maxConfusionLevel === 3) score += 10;

  return {
    ...item,
    urgencyScore: Math.round(score),
    isOverdue,
    daysPastDue,
    planTitle: context.planTitle,
    documentTitle: context.documentTitle,
  };
}

export type QuizReadyDoc = {
  documentId: string;
  documentTitle: string;
  difficultyLevel: string;
};

export type WeakTopic = {
  topic: string;
  missCount: number;
};

export type DailyBrief = {
  date: string;          // YYYY-MM-DD UTC
  todayItems: ScoredItem[];
  overdueItems: ScoredItem[];
  dueReviews: ReviewScheduleEvent[];
  quizReadyDocs: QuizReadyDoc[];
  weakTopics: WeakTopic[];
  summary: {
    totalPending: number;
    estimatedMins: number;
    overdueCount: number;
    reviewsDue: number;
  };
};

export function buildDailyBrief(params: {
  allItems: StudyPlanItem[];       // pending items from today and past
  dueReviews: ReviewScheduleEvent[];
  progressions: DocumentProgression[];
  recentAttempts: QuizAttempt[];
  confusionByDoc: Record<string, number>;
  planTitleById: Record<string, string>;
  docTitleById: Record<string, string>;
  now: number;
}): DailyBrief {
  const { allItems, dueReviews, progressions, recentAttempts,
    confusionByDoc, planTitleById, docTitleById, now } = params;

  const todayMidnight = utcMidnight(now);
  const dateStr = new Date(todayMidnight).toISOString().slice(0, 10);

  // Build context lookup sets
  const failedDocIds = new Set(
    recentAttempts.filter((a) => a.score < 95).map((a) => a.documentId),
  );

  const todayItems: ScoredItem[] = [];
  const overdueItems: ScoredItem[] = [];

  for (const item of allItems) {
    const scored = scoreItem(item, now, {
      hasRecentFailure: failedDocIds.has(item.documentId),
      maxConfusionLevel: confusionByDoc[item.documentId] ?? 0,
      planTitle: planTitleById[item.planId] ?? "Study Plan",
      documentTitle: docTitleById[item.documentId] ?? "Document",
    });
    if (item.scheduledDate >= todayMidnight) {
      todayItems.push(scored);
    } else {
      overdueItems.push(scored);
    }
  }

  todayItems.sort((a, b) => b.urgencyScore - a.urgencyScore);
  overdueItems.sort((a, b) => b.urgencyScore - a.urgencyScore);

  // Quiz-ready documents (unlocked, not mastered yet)
  const quizReadyDocs: QuizReadyDoc[] = progressions
    .filter((p) => p.quizUnlocked && !p.masteredAt)
    .map((p) => ({
      documentId: p.documentId,
      documentTitle: docTitleById[p.documentId] ?? "Document",
      difficultyLevel: p.currentDifficultyLevel,
    }));

  // Cross-document weak topics from recent quiz attempts
  const topicCounts: Record<string, number> = {};
  for (const attempt of recentAttempts) {
    for (const topic of attempt.weakTopics) {
      topicCounts[topic] = (topicCounts[topic] ?? 0) + 1;
    }
  }
  const weakTopics: WeakTopic[] = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, missCount]) => ({ topic, missCount }));

  const allPending = [...todayItems, ...overdueItems];
  const estimatedMins = allPending.reduce((acc, i) => acc + i.estimatedMins, 0);

  return {
    date: dateStr,
    todayItems,
    overdueItems,
    dueReviews,
    quizReadyDocs,
    weakTopics,
    summary: {
      totalPending: allPending.length,
      estimatedMins,
      overdueCount: overdueItems.length,
      reviewsDue: dueReviews.length,
    },
  };
}
