/**
 * Standalone prompt quality test.
 * Run: npx tsx --env-file=.env.local scripts/test-prompt.ts
 *
 * Calls Claude with the upgraded SYSTEM_PREAMBLE + REVIEWER_TASK and
 * a sample nursing text, then prints a field-by-field quality report.
 */

import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PREAMBLE, REVIEWER_TASK } from "../lib/prompts";
import { ReviewerSchema } from "../lib/types";

const SAMPLE_TEXT = `
CARDIOVASCULAR PHARMACOLOGY: ANTI-HYPERTENSIVE DRUGS

Beta-Blockers (Class II)
Beta-blockers competitively block beta-adrenergic receptors. Selective beta-1 blockers
(metoprolol, atenolol) act primarily on the heart; non-selective (propranolol) block both
beta-1 and beta-2. Key effects: decreased heart rate, decreased contractility, decreased
renin release. Used in hypertension, angina, post-MI, heart failure, and atrial fibrillation.
Contraindicated in asthma (beta-2 blockade causes bronchoconstriction), decompensated
heart failure, AV block. Abrupt withdrawal can precipitate rebound hypertension or angina.
Metoprolol is cardioselective. Propranolol crosses the blood-brain barrier (CNS effects).

ACE Inhibitors
ACE inhibitors (captopril, lisinopril, enalapril) block conversion of angiotensin I to
angiotensin II. This reduces vasoconstriction and aldosterone secretion, lowering blood
pressure and reducing cardiac afterload. First-line in diabetic nephropathy and post-MI
with reduced ejection fraction. Classic side effect: dry cough (bradykinin accumulation).
Serious side effect: angioedema (contraindicated if prior episode). Contraindicated in
pregnancy (teratogenic — causes fetal renal agenesis). Monitor potassium (hyperkalemia risk
with potassium-sparing diuretics). Renal artery stenosis is a contraindication — ACE
inhibitors reduce GFR in stenosed kidney. Serum creatinine increase up to 30% acceptable.

ARBs (Angiotensin Receptor Blockers)
ARBs (losartan, valsartan, candesartan) block the AT1 receptor directly. Same
hemodynamic effects as ACE inhibitors but WITHOUT the cough (no bradykinin accumulation).
Use when patient is ACE inhibitor-intolerant due to cough. Still contraindicated in
pregnancy. Still carry angioedema risk (rare). Do NOT combine ACE inhibitor + ARB
(dual RAAS blockade increases hyperkalemia and renal failure risk).

Calcium Channel Blockers (CCBs)
Dihydropyridines (amlodipine, nifedipine) — peripheral vasodilation, minimal cardiac effect.
Non-dihydropyridines (verapamil, diltiazem) — cardiac and vascular effects, used in
rate control for AF, angina. Dihydropyridines cause reflex tachycardia and peripheral edema.
Verapamil causes constipation (smooth muscle relaxation in gut). Both classes contraindicated
in severe aortic stenosis. Verapamil + beta-blocker = dangerous bradycardia.

Diuretics
Thiazides (hydrochlorothiazide, chlorthalidone) — first-line for uncomplicated hypertension.
Act on distal convoluted tubule. Side effects: hypokalemia, hyponatremia, hyperuricemia
(gout), hyperglycemia, hyperlipidemia. Ineffective in CKD (GFR <30).
Loop diuretics (furosemide) — act on loop of Henle. Most potent diuretic class.
Used in heart failure, pulmonary edema, hypercalcemia. Side effects: ototoxicity (rapid
IV administration), hypokalemia, metabolic alkalosis. Spironolactone (aldosterone antagonist)
— potassium-sparing. Used in heart failure (reduces mortality), primary aldosteronism,
resistant hypertension. Side effect: gynecomastia, hyperkalemia.
`;

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set — run with --env-file=.env.local");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  console.log("Calling Claude with upgraded prompts...\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 8000,
    system: [
      { type: "text", text: SYSTEM_PREAMBLE },
      { type: "text", text: `Source material:\n\n${SAMPLE_TEXT}` },
    ],
    messages: [
      {
        role: "user",
        content: `${REVIEWER_TASK}\n\nRespond with ONLY a valid JSON object. No markdown fences, no explanation — just the raw JSON.`,
      },
    ],
  });

  const raw = (response.content[0].type === "text" ? response.content[0].text : "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed: ReturnType<typeof ReviewerSchema.parse>;
  try {
    parsed = ReviewerSchema.parse(JSON.parse(raw));
  } catch (e) {
    console.error("JSON parse / Zod validation failed:\n", e);
    console.error("\nRaw output:\n", raw.slice(0, 2000));
    process.exit(1);
  }

  // ── Field-by-field quality report ───────────────────────────────────────────

  console.log("=".repeat(60));
  console.log(`TITLE: ${parsed.title}`);
  console.log(`SUMMARY: ${parsed.summary}`);
  console.log(`TOPICS: ${parsed.topics.length}`);
  console.log("=".repeat(60));

  let trapCount = 0, pearlCount = 0, trickCount = 0, tipCount = 0;
  let confusedWithTopics = 0;
  let mnemonicWithDevice = 0;
  let quickRecallTotal = 0;
  let mustMemorizeHighYield = 0;

  for (const topic of parsed.topics) {
    console.log(`\n── ${topic.title} ──`);
    console.log(`  coreIdea: ${topic.coreIdea}`);
    console.log(`  keyPoints (${topic.keyPoints.length}): ${topic.keyPoints.slice(0, 2).join(" | ")}…`);
    console.log(`  mustMemorize (${topic.mustMemorize.length}):`);
    for (const fact of topic.mustMemorize) {
      const isLabeled = /HIGH-YIELD|BOARD FAVORITE/i.test(fact);
      if (isLabeled) mustMemorizeHighYield++;
      console.log(`    ${isLabeled ? "✓" : "·"} ${fact}`);
    }

    console.log(`  confusedWith (${topic.confusedWith?.length ?? 0}):`);
    if (topic.confusedWith?.length) {
      confusedWithTopics++;
      for (const c of topic.confusedWith) {
        console.log(`    · ${c.item} → ${c.distinction}`);
      }
    }

    console.log(`  boardTips (${topic.boardTips.length}):`);
    for (const tip of topic.boardTips) {
      const tag = tip.match(/^\[(TRAP|PEARL|TRICK|TIP)\]/i)?.[1]?.toUpperCase() ?? "NONE";
      if (tag === "TRAP") trapCount++;
      else if (tag === "PEARL") pearlCount++;
      else if (tag === "TRICK") trickCount++;
      else tipCount++;
      console.log(`    [${tag}] ${tip.replace(/^\[.*?\]\s*/, "").slice(0, 70)}`);
    }

    console.log(`  quickRecall (${topic.quickRecall.length}):`);
    quickRecallTotal += topic.quickRecall.length;
    for (const q of topic.quickRecall) {
      console.log(`    ? ${q}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("GLOBAL MUST MEMORIZE:");
  for (const fact of parsed.globalMustMemorize) {
    console.log(`  · ${fact}`);
  }

  console.log("\nMNEMONICS:");
  for (const m of parsed.mnemonics) {
    const hasDevice = /ACRONYM:|Rhyme:|Image:|Story:/i.test(m.aid);
    if (hasDevice) mnemonicWithDevice++;
    console.log(`  ${hasDevice ? "✓" : "✗"} [${m.concept}] → ${m.aid}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("QUALITY SCORECARD");
  console.log("=".repeat(60));
  console.log(`boardTips tags:  [TRAP]×${trapCount}  [PEARL]×${pearlCount}  [TRICK]×${trickCount}  untagged×${tipCount}`);
  console.log(`confusedWith:    populated in ${confusedWithTopics}/${parsed.topics.length} topics`);
  console.log(`mustMemorize:    ${mustMemorizeHighYield} labeled HIGH-YIELD or BOARD FAVORITE`);
  console.log(`quickRecall:     ${quickRecallTotal} total across ${parsed.topics.length} topics (avg ${(quickRecallTotal / parsed.topics.length).toFixed(1)}/topic)`);
  console.log(`mnemonics:       ${parsed.mnemonics.length} total, ${mnemonicWithDevice} with actual device`);
  console.log(`globalMustMem:   ${parsed.globalMustMemorize.length} facts`);

  const untaggedBoardTips = tipCount > 0;
  const sparseConfusedWith = confusedWithTopics < Math.ceil(parsed.topics.length / 2);
  const vagueM = parsed.mnemonics.length - mnemonicWithDevice > 0;

  console.log("\nISSUES:");
  if (!untaggedBoardTips && trapCount + pearlCount + trickCount > 0) {
    console.log("  ✓ All boardTips tagged");
  } else if (untaggedBoardTips) {
    console.log(`  ✗ ${tipCount} untagged boardTips — prompt may need stricter enforcement`);
  }
  if (!sparseConfusedWith) {
    console.log("  ✓ confusedWith well-populated");
  } else {
    console.log(`  ✗ confusedWith only in ${confusedWithTopics}/${parsed.topics.length} topics`);
  }
  if (!vagueM) {
    console.log("  ✓ All mnemonics have actual devices");
  } else {
    console.log(`  ✗ ${parsed.mnemonics.length - mnemonicWithDevice} mnemonic(s) missing actual device`);
  }

  console.log("\nUsage:", response.usage);
}

main().catch(console.error);
