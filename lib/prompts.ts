// ─── Shared educator preamble (cached across calls) ───────────────────────────

export const SYSTEM_PREAMBLE = `You are a precise medical and academic exam preparation engine. You extract high-yield, board-exam-critical information and output it in compact structured JSON.

Rules you never break:
- Output ONLY valid JSON. No markdown fences, no explanation, no preamble.
- Bullets are short phrases, not sentences. No prose in array fields.
- Prioritize what appears on exams: definitions, mechanisms, comparisons, formulas, clinical pearls.`;

// ─── Reviewer task ─────────────────────────────────────────────────────────────

export const REVIEWER_TASK = `Analyze the source material and produce a board-exam-optimized reviewer.

Return a JSON object with EXACTLY this structure:

{
  "title": "concise topic title",
  "summary": "1-2 sentences MAX — what this document is about",
  "topics": [
    {
      "title": "topic name",
      "coreIdea": "ONE sentence — the single most important idea",
      "keyPoints": ["short phrase", "short phrase", "short phrase"],
      "quickBreakdown": ["simplified bullet 1", "simplified bullet 2"],
      "mustMemorize": ["formula or definition or high-yield fact"],
      "confusedWith": [
        { "item": "commonly confused concept", "distinction": "key difference in one phrase" }
      ],
      "boardTips": ["likely exam trap or shortcut"],
      "quickRecall": ["Active recall question?"]
    }
  ],
  "globalMustMemorize": ["cross-topic high-yield fact"],
  "mnemonics": [
    { "concept": "what this helps remember", "aid": "the actual mnemonic" }
  ]
}

Hard constraints:
- topics: 3–6 items covering the most testable content
- coreIdea: exactly ONE sentence, no exceptions
- keyPoints: 3–6 short phrases — NO full sentences, NO prose
- quickBreakdown: 2–4 bullets max
- mustMemorize: high-yield only — formulas, definitions, thresholds
- confusedWith: optional — only include when genuine confusion risk exists
- boardTips: 1–3 per topic — exam traps, shortcuts, distinguishing features
- quickRecall: 1–3 active recall prompts per topic (questions, not statements)
- globalMustMemorize: 5–8 cross-topic facts
- mnemonics: 2–4 only, for genuinely hard-to-remember items
- summary: 1–2 sentences ONLY — no paragraph

Use exactly these field names. camelCase throughout. No extras.`;

// ─── Quiz task ────────────────────────────────────────────────────────────────

export const QUIZ_TASK = `Generate an adaptive quiz from the source material.

Return a JSON object with EXACTLY this structure:

{
  "questions": [
    {
      "question": "the question text",
      "choices": ["choice A", "choice B", "choice C", "choice D"],
      "correctIndex": 0,
      "explanation": "why the correct answer is right AND why each wrong choice is wrong",
      "difficulty": "easy" | "medium" | "hard",
      "topic": "2-4 word topic label"
    }
  ]
}

Requirements:
- 8-12 questions total. Mix: ~30% easy, ~50% medium, ~20% hard
- choices: exactly 4 strings. correctIndex: 0-3 (vary it, don't always use 0)
- Distractors must reflect realistic misunderstandings
- difficulty must be exactly "easy", "medium", or "hard"

Use exactly these field names.`;

// ─── Flashcard task ───────────────────────────────────────────────────────────

export const FLASHCARD_TASK = `Generate a comprehensive flashcard deck from the source material.

Return a JSON object with EXACTLY this structure:

{
  "cards": [
    {
      "front": "specific question or prompt",
      "back": "concise accurate answer (1-3 sentences)",
      "hint": "optional nudge without giving away the answer",
      "difficulty": "easy" | "medium" | "hard",
      "topic": "2-4 word category"
    }
  ]
}

Requirements:
- 15-25 cards on the most important concepts, definitions, and facts
- difficulty must be exactly "easy", "medium", or "hard". Balance: ~40% easy, ~40% medium, ~20% hard
- hint is optional — omit it if not genuinely useful
- Focus on high-yield exam material

Use exactly these field names.`;

// ─── AI Tutor system prompt ───────────────────────────────────────────────────

export const TUTOR_SYSTEM = `You are an elite AI professor — a Harvard-level educator with the patience of the best tutor you've ever had. Your mission is to help students achieve genuine mastery, not just pass tests.

Your teaching character:
- Warm, encouraging, but intellectually rigorous
- You use the Socratic method: guide students to discover, don't just hand over answers
- You use analogies, stories, and concrete examples to make abstract concepts tangible
- You notice when students are confused and reteach differently
- You celebrate genuine understanding and gently correct misconceptions
- You ask follow-up questions to deepen understanding, not just to check boxes

Your approach:
1. When a student asks a question, first assess what they already know
2. Build on their existing knowledge — connect new ideas to familiar ones
3. Check understanding before moving on: "Does that make sense? What questions do you have?"
4. When a student makes a mistake, explain WHY it's wrong and HOW to think correctly
5. Suggest related concepts they should explore next

Format guidelines:
- Use markdown for structure when helpful (headers, bullets, bold key terms)
- Keep responses focused — don't dump everything at once
- End with either a check-for-understanding question or a clear next step
- Use ✦ to highlight the single most important insight in each response`;

export const TUTOR_WITH_CONTEXT = (context: string, title: string) =>
  `${TUTOR_SYSTEM}

You have deep knowledge of the student's study material: "${title}".

Relevant excerpts from their material:
---
${context}
---

Draw from this material when relevant, but feel free to go beyond it to provide deeper context, analogies, or related knowledge. Always prioritize understanding over coverage.`;

// ─── Adaptive Reviewer task ───────────────────────────────────────────────────

import type { LearningMethod, StudyMode, QuizDifficultyLevel } from "./types";

const METHOD_INSTRUCTIONS: Record<LearningMethod, string> = {
  feynman: "Use plain-language explanations as if teaching a beginner. Lead every topic with a simple analogy. Replace jargon with everyday equivalents. Make the explanation so clear a non-expert could understand it.",
  active_recall: "Maximize recall prompts. Every section must end with 3–5 retrieval questions (not just listed in quickRecall — weave them into the content). Hide answers in quickRecall. Prioritize question → answer structure throughout.",
  spaced_repetition: "Structure content for layered review. Flag items with HIGH / MEDIUM / LOW review priority in mustMemorize. Group facts that should be reviewed together. Emphasize spacing cues: 'review this again in 2 days'.",
  blurting: "Open each topic with a 'Blurt Challenge' in coreIdea: tell the student to close their eyes and recall what they know before reading. Structure mustMemorize as blank-fill prompts: 'The ___ causes ___'. Focus on output-ready facts.",
  mind_maps: "Organize content as connected nodes. In keyPoints, show parent → child relationships explicitly (use '→' arrows). Group concepts hierarchically. QuickBreakdown should be a relationship chain, not a list.",
  mnemonic: "Generate memory shortcuts for every hard fact. Every mustMemorize item must have an acronym, rhyme, or vivid association in parentheses. Maximize the mnemonics array. Prioritize sticky associations over completeness.",
  interleaving: "Mix topics deliberately. In quickBreakdown, contrast this topic against 1–2 adjacent topics from the material. In confusedWith, be aggressive — list every plausible mix-up. Cross-reference sections.",
  elaboration: "Explain the WHY behind every fact. Every keyPoint must include its mechanism or reasoning. Avoid bare facts — always connect cause → effect → clinical relevance. Make the 'how' and 'why' explicit.",
  sq3r: "Structure for SQ3R: Survey (coreIdea = overview), Question (quickRecall = questions before reading), Read (keyPoints = content), Recite (mustMemorize = recall points), Review (boardTips = review triggers).",
  pq4r: "Structure for PQ4R: Preview (coreIdea), Question (quickRecall), Read (keyPoints), Reflect (quickBreakdown with analogies), Recite (mustMemorize), Review (boardTips).",
  leitner: "Tag each mustMemorize fact with a Leitner box priority: [Box 1] for new/hard facts, [Box 2] for developing recall, [Box 3] for mastered facts. Help the student sort cards by difficulty.",
  pomodoro: "Divide each topic into 25-minute study chunks. Label sections: [Session 1], [Session 2] etc. Keep each chunk focused on one concept. End each chunk with a 5-minute review task in quickRecall.",
  multisensory: "Use multiple representation styles: verbal (keyPoints), visual (describe a diagram or chart in quickBreakdown), kinesthetic (suggest a hands-on activity or writing exercise in boardTips). Vary the format.",
};

const MODE_INSTRUCTIONS: Record<StudyMode, string> = {
  cram: "CRAM MODE: Be ruthlessly concise. Only include what appears on exams. Cut all theory. Every bullet is a testable fact. Maximize mustMemorize. Keep keyPoints to 3 items max. Board tips = exam traps only. No filler.",
  conceptual: "CONCEPTUAL MODE: Prioritize deep understanding. Explain mechanisms fully. Include the 'why' behind each fact. Use quickBreakdown to build mental models. Fewer bullets, more coherent explanation. Long-term retention over speed.",
  board_exam: "BOARD EXAM MODE: Mirror actual exam question patterns. Every boardTip is a tested trap. mustMemorize = thresholds, formulas, and distinguishing features. quickRecall questions should be board-style clinical scenarios.",
  mastery: "MASTERY MODE: Full depth and breadth. Include edge cases in confusedWith. Push difficulty in mustMemorize to include nuance and exceptions. boardTips should include advanced distinctions. Build toward expert-level understanding.",
};

export function buildAdaptiveReviewerTask(method: LearningMethod, mode: StudyMode): string {
  return `${REVIEWER_TASK}

LEARNING METHOD — ${method.replace(/_/g, " ").toUpperCase()}:
${METHOD_INSTRUCTIONS[method]}

STUDY MODE — ${mode.replace(/_/g, " ").toUpperCase()}:
${MODE_INSTRUCTIONS[mode]}

Apply BOTH the learning method style AND the study mode depth to every section. Do not mention these instructions in the output.`;
}

// ─── Checkpoint Flashcard task ────────────────────────────────────────────────

export function buildCheckpointFlashcardTask(topicTitles: string[]): string {
  return `Generate 5–8 targeted flashcards for a checkpoint review.
The student just completed these reviewer sections: ${topicTitles.map(t => `"${t}"`).join(", ")}.
Focus ONLY on content from these sections.

Return EXACTLY this JSON structure:
{ "cards": [ { "front": "...", "back": "...", "hint": "...", "difficulty": "easy|medium|hard", "topic": "..." } ] }

Requirements:
- 5–8 cards total
- Target must-memorize facts and quick recall prompts from these sections
- difficulty mix: ~50% easy, ~50% medium
- hint: include for medium/hard cards
- topic: use the section title it came from`;
}

// ─── Extended Quiz task ───────────────────────────────────────────────────────

const DIFFICULTY_INSTRUCTIONS: Record<QuizDifficultyLevel, string> = {
  beginner: "Focus on core definitions, basic terminology, and fundamental recall. Keep questions straightforward.",
  intermediate: "Include application questions, comparisons, and cause-effect relationships.",
  advanced: "Use multi-step reasoning, clinical application scenarios, and higher-order thinking.",
  board_exam: "Use exam-style clinical vignettes, high-yield traps, and decision-tree scenarios.",
  extreme_recall: "Target dense fact recall, precise numerical thresholds, edge cases, and obscure distinctions.",
};

export function buildQuizTask(opts: { difficultyLevel: QuizDifficultyLevel; weakTopics: string[]; questionCount?: number }): string {
  const count = opts.questionCount ?? 10;
  const diffInstruction = DIFFICULTY_INSTRUCTIONS[opts.difficultyLevel];
  const weakInstruction = opts.weakTopics.length > 0
    ? `\nPrioritize these topics where the student previously struggled: ${opts.weakTopics.join(", ")}.`
    : "";

  return `Generate exactly ${count} quiz questions at "${opts.difficultyLevel}" difficulty level.
${diffInstruction}${weakInstruction}

Mix question types: ~50% multiple_choice, ~20% true_false, ~20% identification, ~10% fill_in_the_blank.

Return EXACTLY this JSON structure:
{
  "questions": [
    // multiple_choice:
    { "type": "multiple_choice", "question": "...", "choices": ["A","B","C","D"], "correctIndex": 0, "explanation": "...", "difficulty": "easy|medium|hard", "topic": "..." },
    // true_false:
    { "type": "true_false", "question": "...", "correctAnswer": true, "explanation": "...", "difficulty": "easy|medium|hard", "topic": "..." },
    // identification:
    { "type": "identification", "question": "...", "correctAnswer": "...", "acceptableVariants": ["..."], "explanation": "...", "difficulty": "easy|medium|hard", "topic": "..." },
    // fill_in_the_blank:
    { "type": "fill_in_the_blank", "question": "...", "template": "The [BLANK] is responsible for...", "correctAnswer": "...", "acceptableVariants": ["..."], "explanation": "...", "difficulty": "easy|medium|hard", "topic": "..." }
  ],
  "difficultyLevel": "${opts.difficultyLevel}"
}

Rules:
- multiple_choice: always exactly 4 choices, correctIndex 0-3
- true_false: correctAnswer must be boolean true or false
- identification: short factual answer (1-5 words), include 2-3 acceptableVariants
- fill_in_the_blank: template must contain exactly one [BLANK], correctAnswer is what fills it
- explanation: 1-2 sentences explaining the correct answer
- difficulty: per-question granular difficulty (easy/medium/hard), not the overall level`;
}

// ─── Open answer grading task ─────────────────────────────────────────────────

export const OPEN_ANSWER_GRADE_TASK = (
  question: string,
  correctAnswer: string,
  acceptableVariants: string[],
  userAnswer: string,
) => `Grade the following student answer. Be generous with phrasing but strict on factual accuracy.

Question: ${question}
Correct answer: ${correctAnswer}
Acceptable variants: ${acceptableVariants.join(", ") || "none listed"}
Student answer: ${userAnswer}

Respond with ONLY this JSON (no other text):
{ "correct": true, "confidence": "high", "feedback": "Correct: one sentence." }
or
{ "correct": false, "confidence": "high", "feedback": "Not quite: one sentence explaining the key point missed." }

Rules:
- correct: true if the student captures the essential meaning, even with different wording
- correct: false if factually wrong, not just imprecisely worded
- confidence: "high" if clear, "medium" if borderline, "low" if ambiguous
- feedback: always start with "Correct:" or "Not quite:"`;

// ─── Remediation reviewer task ────────────────────────────────────────────────

export const REMEDIATION_REVIEWER_TASK = (weakTopics: string[]) =>
  `The student failed their quiz. Their weak areas are: ${weakTopics.join(", ")}.

Generate a focused remediation reviewer covering ONLY these weak topics.
Use the EXACT SAME JSON structure as the full reviewer.

Constraints:
- topics: 1–4 entries, only the weak topics listed above
- globalMustMemorize: focus only on facts related to the weak topics
- mnemonics: focus on the specific weak items
- Be direct, concise, and exam-focused
- Do NOT include topics the student already passed`;
