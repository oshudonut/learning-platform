/**
 * Shared learning-methodology configuration.
 *
 * Single source of truth for:
 *  - per-method display config (badge label, accent class, section labels, hints)
 *  - per-surface hint copy lookup
 *  - the small <MethodBadge /> primitive used by reviewer/quiz/flashcard/tutor
 *
 * NOTE on per-surface hints: this module currently returns `null` from
 * `getMethodHint()` for any surface other than "reviewer" (which falls back to
 * `METHOD_CONFIG[method].hint`, the existing reviewer-specific copy). The
 * pedagogical strings for "quiz" | "flashcard" | "tutor" surfaces are owned by
 * the reviewer-generator agent — when that copy lands, fill in
 * `SURFACE_HINT_OVERRIDES` below. The helper signature is already final, so all
 * call sites (QuizEngine, FlashcardStudy, TutorChat) can wire it now and pick
 * up the strings as soon as they exist.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import type { LearningMethod } from "@/lib/types";

// ─── Display config type ─────────────────────────────────────────────────────

export type MethodConfig = {
  badge: string;
  /** tailwind bg + text + border classes for the badge pill */
  accentClass: string;
  keyPointsLabel: string;
  quickBreakdownLabel: string;
  mustMemorizeLabel: string;
  boardTipsLabel: string;
  quickRecallLabel: string;
  confusedWithLabel: string;
  /** reviewer-surface hint shown once per section */
  hint?: string;
  quickRecallFirst?: boolean;
  confusedWithFirst?: boolean;
  blurtChallenge?: boolean;
};

// ─── Canonical per-method config (13 methods) ────────────────────────────────

export const METHOD_CONFIG: Record<LearningMethod, MethodConfig> = {
  feynman: {
    badge: "Feynman Technique",
    accentClass: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    keyPointsLabel: "In Plain Terms",
    quickBreakdownLabel: "Simple Analogy",
    mustMemorizeLabel: "Must Memorize",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Test Yourself",
    confusedWithLabel: "Easy Mix-ups",
    hint: "Could you explain this to a 12-year-old? Read each section and try.",
  },
  active_recall: {
    badge: "Active Recall",
    accentClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    keyPointsLabel: "Key Points",
    quickBreakdownLabel: "Breakdown",
    mustMemorizeLabel: "Must Memorize",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Recall First",
    confusedWithLabel: "Don't Confuse",
    hint: "Try to answer the recall questions before reading the rest of the section.",
    quickRecallFirst: true,
  },
  spaced_repetition: {
    badge: "Spaced Repetition",
    accentClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    keyPointsLabel: "Key Points",
    quickBreakdownLabel: "Review Notes",
    mustMemorizeLabel: "Review Priority",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Recall Check",
    confusedWithLabel: "Don't Confuse",
    hint: "Items tagged HIGH should be reviewed again tomorrow. MEDIUM in 3 days. LOW in 7 days.",
  },
  blurting: {
    badge: "Blurting",
    accentClass: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    keyPointsLabel: "Key Points",
    quickBreakdownLabel: "Breakdown",
    mustMemorizeLabel: "Fill in the Blanks",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Recall Check",
    confusedWithLabel: "Don't Confuse",
    hint: "Before reading — close your eyes and write down everything you know about this topic.",
    blurtChallenge: true,
  },
  mind_maps: {
    badge: "Mind Mapping",
    accentClass: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    keyPointsLabel: "Concept Nodes",
    quickBreakdownLabel: "Relationships",
    mustMemorizeLabel: "Core Facts",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Test Yourself",
    confusedWithLabel: "Branch Distinctions",
    hint: "As you read, sketch the connections between concepts on paper.",
  },
  mnemonic: {
    badge: "Mnemonics",
    accentClass: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    keyPointsLabel: "Key Points",
    quickBreakdownLabel: "Breakdown",
    mustMemorizeLabel: "Memory Hooks",
    boardTipsLabel: "Exam Tricks",
    quickRecallLabel: "Recall Check",
    confusedWithLabel: "Don't Confuse",
    hint: "Each memory hook includes an acronym, rhyme, or vivid image. Test if they stick.",
  },
  interleaving: {
    badge: "Interleaving",
    accentClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    keyPointsLabel: "Key Points",
    quickBreakdownLabel: "Compare Topics",
    mustMemorizeLabel: "Must Memorize",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Test Yourself",
    confusedWithLabel: "Mix-up Alert",
    hint: "Notice how this topic connects to and differs from others in the material.",
    confusedWithFirst: true,
  },
  elaboration: {
    badge: "Elaboration",
    accentClass: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    keyPointsLabel: "Mechanisms",
    quickBreakdownLabel: "Why It Works",
    mustMemorizeLabel: "Must Memorize",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Test Yourself",
    confusedWithLabel: "Don't Confuse",
    hint: "For each point, ask yourself: why does this happen? What's the mechanism?",
  },
  sq3r: {
    badge: "SQ3R",
    accentClass: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    keyPointsLabel: "Read",
    quickBreakdownLabel: "Survey",
    mustMemorizeLabel: "Recite",
    boardTipsLabel: "Review",
    quickRecallLabel: "Question",
    confusedWithLabel: "Don't Confuse",
    hint: "Follow the SQ3R flow: Survey → Question → Read → Recite → Review.",
    quickRecallFirst: true,
  },
  pq4r: {
    badge: "PQ4R",
    accentClass: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    keyPointsLabel: "Read",
    quickBreakdownLabel: "Reflect",
    mustMemorizeLabel: "Recite",
    boardTipsLabel: "Review",
    quickRecallLabel: "Question",
    confusedWithLabel: "Don't Confuse",
    hint: "Follow the PQ4R flow: Preview → Question → Read → Reflect → Recite → Review.",
    quickRecallFirst: true,
  },
  leitner: {
    badge: "Leitner System",
    accentClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    keyPointsLabel: "Key Points",
    quickBreakdownLabel: "Breakdown",
    mustMemorizeLabel: "Leitner Cards",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Test Yourself",
    confusedWithLabel: "Don't Confuse",
    hint: "Box 1 = review daily. Box 2 = every 3 days. Box 3 = once a week.",
  },
  pomodoro: {
    badge: "Pomodoro",
    accentClass: "bg-red-500/10 text-red-400 border-red-500/20",
    keyPointsLabel: "Key Points",
    quickBreakdownLabel: "Breakdown",
    mustMemorizeLabel: "Must Memorize",
    boardTipsLabel: "5-Min Review",
    quickRecallLabel: "End of Session Check",
    confusedWithLabel: "Don't Confuse",
    hint: "Set a 25-minute timer. Focus on this section only. Review at the end.",
  },
  multisensory: {
    badge: "Multisensory",
    accentClass: "bg-lime-500/10 text-lime-400 border-lime-500/20",
    keyPointsLabel: "Read & Speak",
    quickBreakdownLabel: "Visualize",
    mustMemorizeLabel: "Write It Out",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Test Yourself",
    confusedWithLabel: "Don't Confuse",
    hint: "Read aloud, sketch a diagram, then write key facts from memory.",
  },
};

// ─── Per-surface hint overrides ──────────────────────────────────────────────
//
// Owned by reviewer-generator. Fill in once their pedagogical copy lands.
// Until then, `getMethodHint(method, surface)` returns `null` for non-reviewer
// surfaces so callers can render the field conditionally.
//
// Shape: SURFACE_HINT_OVERRIDES[surface][method] = "short instructional sentence"

export type MethodSurface = "reviewer" | "quiz" | "flashcard" | "tutor";

const SURFACE_HINT_OVERRIDES: Record<
  Exclude<MethodSurface, "reviewer">,
  Partial<Record<LearningMethod, string>>
> = {
  // Pedagogical copy authored by the reviewer-generator agent. Methods omitted
  // here fall through to `null` (the calling component renders nothing).
  // Pomodoro intentionally has no quiz/flashcard hint — it's a time technique,
  // not a content technique — but it does have a tutor persona.
  quiz: {
    feynman:           "Think about the mechanism — understanding *why* matters more than recognizing the answer.",
    active_recall:     "Cover the choices. Recall your full answer from memory first, then check.",
    spaced_repetition: "Focus on HIGH-priority questions — these are the facts most worth cementing.",
    blurting:          "Write your complete answer before looking at the options.",
    mind_maps:         "Some questions test relationships — think about how concepts connect across topics.",
    mnemonic:          "Activate your memory anchor first — use the acronym, rhyme, or image before choosing.",
    interleaving:      "Questions span topics intentionally — notice the contrasts, not just the content.",
    elaboration:       "Trace the mechanism before answering — cause → effect thinking beats recognition.",
    sq3r:              "These questions match the study questions you should have formed while reading.",
    pq4r:              "Answer as if completing the 'Recite' step — from memory, without looking back.",
    leitner:           "Hard questions are your Box 1 facts — give them the most attention.",
    multisensory:      "Picture a diagram or process in your mind before selecting your answer.",
  },
  flashcard: {
    feynman:           "Before flipping — explain this concept out loud in your own words.",
    active_recall:     "No peeking. Commit to a complete answer in your head before flipping.",
    spaced_repetition: "Cards you rate 'Hard' reappear sooner. 'Easy' cards return in days.",
    blurting:          "Say or write everything you know about this before flipping the card.",
    mind_maps:         "After flipping — trace how this concept connects to others you've studied.",
    mnemonic:          "The back includes your memory anchor — use it actively, don't just read it.",
    interleaving:      "The deck mixes topics intentionally — embrace the mental context-switch.",
    elaboration:       "Before flipping — trace the cause → effect chain this concept belongs to.",
    sq3r:              "Treat the front as a study question. Recite your full answer before revealing.",
    pq4r:              "Front = Preview question. Back = Recite answer. Practice the full PQ4R cycle.",
    leitner:           "Hard → Box 1 (daily). Medium → Box 2 (every 3 days). Easy → Box 3 (weekly).",
    multisensory:      "Before flipping — visualize a diagram, then describe it aloud or in writing.",
  },
  tutor: {
    feynman:           "Expect to be asked to explain concepts simply — analogies are how understanding is tested here.",
    active_recall:     "The tutor asks you to recall before explaining. Expect to be challenged first.",
    spaced_repetition: "The tutor includes review timing guidance — trust the spacing recommendations.",
    blurting:          "Expect the tutor to ask you to write or say everything you know before responding.",
    mind_maps:         "The tutor maps connections between topics — every answer links to the bigger picture.",
    mnemonic:          "The tutor provides a memory anchor for every key fact — use them, don't skip them.",
    interleaving:      "The tutor bridges topics — every answer references adjacent concepts intentionally.",
    elaboration:       "The tutor explains mechanisms, not just facts — expect 'the reason is...' framing.",
    sq3r:              "The tutor structures explanations as study questions — Survey, Question, Read, Recite, Review.",
    pq4r:              "The tutor follows PQ4R pacing — Preview, Question, Read, Reflect, Recite, Review.",
    leitner:           "The tutor helps sort facts by confidence — flag Box 1 vs Box 3 together.",
    pomodoro:          "The tutor suggests breaks at concept boundaries — take them when recommended.",
    multisensory:      "The tutor uses verbal, visual, and kinesthetic representations — engage all three.",
  },
};

/**
 * Returns the methodology-specific hint string to render on a given surface,
 * or null if no method is set / no copy exists yet.
 *
 * - For `surface: "reviewer"`, returns `METHOD_CONFIG[method].hint` (existing
 *   reviewer-specific copy that is already live).
 * - For other surfaces, returns from SURFACE_HINT_OVERRIDES (currently empty —
 *   reviewer-generator will populate).
 */
export function getMethodHint(
  method: LearningMethod | null | undefined,
  surface: MethodSurface,
): string | null {
  if (!method) return null;
  if (surface === "reviewer") return METHOD_CONFIG[method].hint ?? null;
  return SURFACE_HINT_OVERRIDES[surface][method] ?? null;
}

// ─── <MethodBadge /> — small reusable pill ───────────────────────────────────

type MethodBadgeProps = {
  method: LearningMethod | null | undefined;
  className?: string;
  /** Optional override for the label. Defaults to METHOD_CONFIG[method].badge. */
  label?: string;
};

/**
 * Tiny rounded pill showing the active learning method. Renders nothing if
 * `method` is null/undefined. Uses the same accent-class styling as the
 * reviewer's method badge so all surfaces look consistent.
 *
 * Note: this intentionally does NOT use the shared <Badge> primitive — the
 * reviewer's existing method-badge styling uses a `border` (not the ring-based
 * Badge variants), and we want all four surfaces to render the same shape.
 */
export function MethodBadge({ method, className, label }: MethodBadgeProps) {
  if (!method) return null;
  const config = METHOD_CONFIG[method];
  if (!config) return null;
  return React.createElement(
    "span",
    {
      className: cn(
        "text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap",
        config.accentClass,
        className,
      ),
    },
    label ?? config.badge,
  );
}
