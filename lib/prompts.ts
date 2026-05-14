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

import type { LearningMethod, StudyMode, QuizDifficultyLevel, ReviewerSchemaType } from "./types";
import { METHOD_SCHEMA_MAP } from "./types";

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
  const methodName = method.replace(/_/g, " ").toUpperCase();
  const modeName = mode.replace(/_/g, " ").toUpperCase();
  return `You are generating a reviewer tailored to a specific learning method and study mode. Read these carefully — they override generic defaults.

LEARNING METHOD — ${methodName}:
${METHOD_INSTRUCTIONS[method]}

STUDY MODE — ${modeName}:
${MODE_INSTRUCTIONS[mode]}

Apply BOTH the learning method style AND the study mode depth to every section. The method instructions shape HOW content is written inside each field; the mode determines the depth and density.

${REVIEWER_TASK}

CRITICAL: The method instructions above take priority over the generic field descriptions. For example, if the method says "open each topic with a Blurt Challenge in coreIdea", do that — even if the generic schema says coreIdea is "ONE sentence". The JSON field names must stay the same, but the content style follows the method. Do not mention these instructions in the output.`;
}

// ─── Adaptive system preamble (for non-standard reviewers) ──────────────────

export const ADAPTIVE_SYSTEM_PREAMBLE = `You are an adaptive AI learning engine that transforms source material into a methodology-specific learning experience.

Rules you never break:
- Output ONLY valid JSON. No markdown fences, no explanation, no preamble.
- Follow the exact JSON structure specified in the task.
- The methodology dictates structure and tone — do not fall back to generic summarization.
- Make every field genuinely useful for that specific learning method.`;

// ─── Schema-specific task builders ───────────────────────────────────────────

function buildConceptualTask(method: LearningMethod, mode: StudyMode): string {
  const methodLabel = method === "feynman" ? "Feynman Technique"
    : method === "elaboration" ? "Elaboration"
    : "Multisensory Learning";

  const modeNote = mode === "cram"
    ? "Keep analogies concise. Focus only on the most critical concepts."
    : mode === "board_exam"
    ? "Frame analogies and explanations around clinical scenarios and exam reasoning."
    : mode === "mastery"
    ? "Go deep. Full mechanism chains, edge-case self-check questions."
    : "Balance clarity and depth. Build genuine conceptual models.";

  return `Generate a conceptual deep-understanding reviewer using the ${methodLabel} method.

GOAL: The student should UNDERSTAND — not just memorize. Every section should feel like a wise tutor explaining from first principles. ${modeNote}

Return EXACTLY this JSON (no extra fields, no markdown):
{
  "type": "conceptual",
  "title": "concise document title",
  "summary": "2 sentences MAX — what this material covers and why it matters",
  "topics": [
    {
      "title": "topic name",
      "analogy": "One vivid analogy: 'Think of X like Y because...' — specific and concrete",
      "simplifiedExplanation": "2-3 sentences in plain language. No jargon. No bullet points.",
      "mechanism": [
        "cause → effect (use → arrows)",
        "next step → consequence",
        "2-4 steps max"
      ],
      "keyTakeaways": ["short phrase", "3-4 items max"],
      "selfCheck": [
        "Can you explain ___ back in your own words?",
        "2-3 questions max"
      ]
    }
  ],
  "bigPicture": "2 sentences — how the topics connect"
}

Hard constraints:
- topics: 3-5 max (NOT 6)
- analogy: ONE sentence — specific vivid comparison
- simplifiedExplanation: 2-3 sentences ONLY — no paragraphs
- mechanism: 2-4 steps ONLY — one phrase per step, use → arrows
- keyTakeaways: 3-4 short phrases — no full sentences
- selfCheck: 2-3 questions ONLY
- bigPicture: 2 sentences ONLY`;
}

function buildRetrievalTask(method: LearningMethod, mode: StudyMode): string {
  const methodLabel = method === "blurting" ? "Blurting"
    : method === "sq3r" ? "SQ3R"
    : method === "pq4r" ? "PQ4R"
    : "Active Recall";

  const modeNote = mode === "cram"
    ? "Focus on highest-yield testable facts. 3-4 sharp questions per topic."
    : mode === "board_exam"
    ? "Questions should mirror board-exam vignette style and common traps."
    : mode === "mastery"
    ? "Include edge-case and application questions, not just definition recall."
    : "Mix definition, mechanism, and application questions.";

  return `Generate a retrieval-practice reviewer using the ${methodLabel} method.

GOAL: Force the student to actively RECALL before reading. Every topic starts with a recall challenge. Answers are revealed AFTER the attempt. ${modeNote}

Return EXACTLY this JSON (no extra fields, no markdown):
{
  "type": "retrieval",
  "title": "concise document title",
  "summary": "2 sentences MAX",
  "topics": [
    {
      "title": "topic name",
      "blurtPrompt": "Close the screen. Write down EVERYTHING you know about '[specific topic name]'. You have 60 seconds. Do it before reading anything below.",
      "questions": [
        {
          "q": "Specific retrieval question",
          "hint": "One-word nudge (omit for easy questions)",
          "answer": "Complete answer — 1-2 sentences max"
        }
      ],
      "keyFacts": ["Short phrase — testable fact", "3-4 items max"],
      "commonMistakes": ["One real misconception", "1-2 items max"]
    }
  ],
  "finalChallenge": [
    "Cross-topic synthesis question",
    "3-4 questions max"
  ]
}

Hard constraints:
- topics: 3-5 max (NOT 6)
- questions: 3-4 per topic ONLY — ordered easy → hard
- answer: 1-2 sentences ONLY
- keyFacts: 3-4 short phrases ONLY
- commonMistakes: 1-2 items ONLY
- finalChallenge: 3-4 questions ONLY`;
}

function buildMemoryTask(method: LearningMethod, mode: StudyMode): string {
  const methodLabel = method === "mnemonic" ? "Mnemonic Techniques"
    : method === "leitner" ? "Leitner System"
    : "Spaced Repetition";

  const modeNote = mode === "cram"
    ? "HIGH priority for everything — all facts need strong anchors. Review in = 'tomorrow'."
    : mode === "board_exam"
    ? "Anchors should help distinguish board-tested facts. Prioritize numerical thresholds and clinical pearls."
    : mode === "mastery"
    ? "Build anchors for nuance and edge cases too, not just core facts."
    : "Balance priorities. Focus anchors on the genuinely hard-to-remember facts.";

  return `Generate a memory-optimization reviewer using the ${methodLabel} method.

GOAL: Every important fact gets a concrete MEMORY ANCHOR — an acronym, rhyme, vivid story, or association that makes it impossible to forget. ${modeNote}

Return EXACTLY this JSON (no extra fields, no markdown):
{
  "type": "memory",
  "title": "concise document title",
  "summary": "2 sentences MAX",
  "topics": [
    {
      "title": "topic name",
      "coreIdea": "One sentence — the essential concept for this topic",
      "anchors": [
        {
          "fact": "The exact fact, formula, or definition to memorize",
          "anchor": "ACRONYM: [spell it out] OR Rhyme: [actual rhyme] OR Story: [vivid 1-sentence story] OR Image: [vivid mental picture]",
          "priority": "HIGH",
          "reviewIn": "tomorrow"
        }
      ],
      "associations": [
        {
          "concept": "concept name",
          "trick": "The memorable hook, visual, or association — must be specific and vivid"
        }
      ]
    }
  ],
  "masterAnchors": [
    {
      "fact": "Most critical cross-topic high-yield fact",
      "anchor": "The specific memory device",
      "priority": "HIGH",
      "reviewIn": "tomorrow"
    }
  ]
}

Hard constraints:
- topics: 3-5 max (NOT 6)
- anchors: 2-3 per topic ONLY — highest-yield facts only
- anchor field: Must be a SPECIFIC device — actual acronym spelled out, actual rhyme, actual 1-sentence story
- priority HIGH → reviewIn "tomorrow", MEDIUM → "3 days", LOW → "1 week"
- associations: 1-2 per topic ONLY
- masterAnchors: 4-5 ONLY — top cross-topic facts
- Do NOT generate generic descriptions like "use a mnemonic" — generate the actual mnemonic`;
}

function buildRelationalTask(method: LearningMethod, mode: StudyMode): string {
  const methodLabel = method === "mind_maps" ? "Mind Mapping" : "Interleaving";

  const modeNote = mode === "cram"
    ? "Focus on the most critical connections only. Keep nodes and links minimal but high-yield."
    : mode === "board_exam"
    ? "Highlight connections that explain exam traps. Cross-links should reflect clinical decision trees."
    : mode === "mastery"
    ? "Map full depth — subtopics, dependencies, exceptions. Build a complete knowledge graph."
    : "Map core connections. Emphasize what students commonly mix up.";

  return `Generate a relationship-mapping reviewer using the ${methodLabel} method.

GOAL: Map how concepts CONNECT, CONTRAST, and DEPEND on each other. This is a knowledge network, not a summary. The student should see the architecture of ideas. ${modeNote}

Return EXACTLY this JSON (no extra fields, no markdown):
{
  "type": "relational",
  "title": "concise document title",
  "summary": "2 sentences MAX",
  "topics": [
    {
      "title": "topic name",
      "centralConcept": "The core idea this topic revolves around — one short sentence",
      "nodes": [
        {
          "concept": "sub-concept or related idea",
          "children": ["what this concept leads to, includes, or produces", "1-3 items"],
          "relatedTopics": ["name of another topic in this document that this connects to", "1-2 items"]
        }
      ],
      "crossLinks": [
        {
          "from": "a concept or topic",
          "via": "specific relationship verb (causes, requires, opposes, enables, differentiates, predicts, etc.)",
          "to": "a concept in a DIFFERENT topic"
        }
      ],
      "contrastsWith": [
        {
          "topic": "similar concept or term students confuse with this",
          "keyDifference": "The single most important distinction — one precise sentence"
        }
      ]
    }
  ],
  "conceptMap": [
    {
      "from": "topic or concept name",
      "relationship": "specific verb phrase",
      "to": "another topic or concept name"
    }
  ]
}

Hard constraints:
- topics: 3-5 max (NOT 6)
- nodes: 2-3 per topic ONLY
- children: 1-2 items per node ONLY
- crossLinks: 1-2 per topic ONLY — CROSS-TOPIC connections only
- contrastsWith: 1-2 per topic ONLY — genuine confusion pairs only
- conceptMap: 4-6 global connections ONLY`;
}

export function getMethodologyConfig(method: LearningMethod, mode: StudyMode): {
  taskInstruction: string;
  schemaType: ReviewerSchemaType;
  systemPreamble: string;
} {
  const schemaType = METHOD_SCHEMA_MAP[method];
  let taskInstruction: string;

  switch (schemaType) {
    case "conceptual":
      taskInstruction = buildConceptualTask(method, mode);
      break;
    case "retrieval":
      taskInstruction = buildRetrievalTask(method, mode);
      break;
    case "memory":
      taskInstruction = buildMemoryTask(method, mode);
      break;
    case "relational":
      taskInstruction = buildRelationalTask(method, mode);
      break;
    default: {
      const modeName = mode.replace(/_/g, " ").toUpperCase();
      taskInstruction = `${METHOD_INSTRUCTIONS[method]}\n\nSTUDY MODE — ${modeName}:\n${MODE_INSTRUCTIONS[mode]}\n\n${REVIEWER_TASK}`;
    }
  }

  const systemPreamble = schemaType === "standard" ? SYSTEM_PREAMBLE : ADAPTIVE_SYSTEM_PREAMBLE;
  return { taskInstruction, schemaType, systemPreamble };
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
