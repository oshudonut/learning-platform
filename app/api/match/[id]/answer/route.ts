export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import {
  getMatch,
  getMatchParticipants,
  getMatchAnswers,
  submitAnswer,
  advanceQuestion,
} from "@/lib/store";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { questionIndex, answer } = await req.json() as {
    questionIndex?: number;
    answer?: string;
  };
  if (questionIndex === undefined || !answer) {
    return NextResponse.json({ error: "Missing questionIndex or answer" }, { status: 400 });
  }

  const match = await getMatch(params.id);
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status !== "active") return NextResponse.json({ error: "Match is not active" }, { status: 409 });
  if (questionIndex !== match.currentQuestionIndex) {
    return NextResponse.json({ error: "Wrong question index" }, { status: 409 });
  }

  const question = match.quizSnapshot[questionIndex];
  if (!question) return NextResponse.json({ error: "Question not found" }, { status: 404 });

  const correctAnswer = question.choices[question.correctIndex];
  const isCorrect = answer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();

  const { gotPoint } = await submitAnswer(params.id, questionIndex, user.id, answer, isCorrect);

  // Check if all participants have answered this question
  const [participants, answers] = await Promise.all([
    getMatchParticipants(params.id),
    getMatchAnswers(params.id),
  ]);
  const answersForQuestion = answers.filter((a) => a.questionIndex === questionIndex);
  const allAnswered = participants.every((p) =>
    answersForQuestion.some((a) => a.userId === p.userId)
  );

  if (allAnswered) {
    await advanceQuestion(params.id);
  }

  return NextResponse.json({ gotPoint, isCorrect, correctAnswer });
}
