import { NextRequest, NextResponse } from "next/server";
import { OPEN_ANSWER_GRADE_TASK, SYSTEM_PREAMBLE } from "@/lib/prompts";
import { z } from "zod";
import { generateStructured } from "@/lib/claude";

export const runtime = "nodejs";

const GradeResultSchema = z.object({
  correct: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  feedback: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const { question, correctAnswer, acceptableVariants, userAnswer } = await req.json() as {
      question: string;
      correctAnswer: string;
      acceptableVariants: string[];
      userAnswer: string;
    };

    const taskInstruction = OPEN_ANSWER_GRADE_TASK(question, correctAnswer, acceptableVariants ?? [], userAnswer);

    const { parsed } = await generateStructured({
      schema: GradeResultSchema,
      systemPreamble: SYSTEM_PREAMBLE,
      documentText: "",
      taskInstruction,
      maxTokens: 150,
    });

    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({
      correct: false,
      confidence: "low",
      feedback: "Could not grade automatically — check the correct answer below.",
    });
  }
}
