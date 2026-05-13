"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  Trophy,
  RotateCcw,
  ChevronRight,
  Clock,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Quiz, QuizQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";

type AnswerState = {
  selected: number;
  correct: boolean;
};

function QuestionCard({
  question,
  questionNumber,
  total,
  onAnswer,
  answered,
}: {
  question: QuizQuestion;
  questionNumber: number;
  total: number;
  onAnswer: (index: number) => void;
  answered: AnswerState | null;
}) {
  const difficultyVariant = {
    easy: "easy",
    medium: "medium",
    hard: "hard",
  } as const;

  return (
    <motion.div
      key={questionNumber}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            Question {questionNumber} of {total}
          </span>
          <Badge variant={difficultyVariant[question.difficulty]}>
            {question.difficulty}
          </Badge>
        </div>
        <Badge variant="outline">{question.topic}</Badge>
      </div>

      {/* Progress */}
      <Progress value={questionNumber - 1} max={total} />

      {/* Question */}
      <div className="rounded-xl border border-sky-200/60 bg-[#D8ECF4] p-6">
        <p className="text-lg font-medium text-foreground leading-relaxed">
          {question.question}
        </p>
      </div>

      {/* Choices */}
      <div className="space-y-3">
        {question.choices.map((choice, i) => {
          const isSelected = answered?.selected === i;
          const isCorrect = i === question.correctIndex;
          const showResult = answered !== null;

          let stateClass = "border-sky-200/60 bg-[#D8ECF4] hover:border-sky-400/50 hover:bg-sky-100";
          if (showResult && isCorrect)
            stateClass = "border-success/40 bg-success/5";
          else if (showResult && isSelected && !isCorrect)
            stateClass = "border-destructive/40 bg-destructive/5";

          return (
            <motion.button
              key={i}
              whileHover={!showResult ? { x: 4 } : {}}
              whileTap={!showResult ? { scale: 0.99 } : {}}
              onClick={() => !showResult && onAnswer(i)}
              disabled={showResult}
              className={cn(
                "w-full flex items-center gap-4 rounded-xl border px-5 py-4 text-left transition-all duration-200",
                stateClass,
                showResult && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                  showResult && isCorrect
                    ? "bg-success/20 text-success"
                    : showResult && isSelected && !isCorrect
                      ? "bg-destructive/20 text-destructive"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1 text-sm text-foreground">{choice}</span>
              {showResult && isCorrect && (
                <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
              )}
              {showResult && isSelected && !isCorrect && (
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Explanation */}
      <AnimatePresence>
        {answered && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "rounded-xl border p-5",
              answered.correct
                ? "border-success/20 bg-success/5"
                : "border-destructive/20 bg-destructive/5",
            )}
          >
            <div className="flex items-center gap-2 mb-3">
              {answered.correct ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="text-sm font-semibold text-success">Correct!</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-semibold text-destructive">
                    Not quite — here&apos;s why:
                  </span>
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {question.explanation}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ResultsView({
  quiz,
  answers,
  onRetry,
  onSave,
}: {
  quiz: Quiz;
  answers: AnswerState[];
  onRetry: () => void;
  onSave?: (score: number, weakTopics: string[]) => void;
}) {
  const correct = answers.filter((a) => a.correct).length;
  const total = quiz.questions.length;
  const score = Math.round((correct / total) * 100);

  const weakTopics = quiz.questions
    .filter((_, i) => !answers[i]?.correct)
    .map((q) => q.topic);

  useEffect(() => {
    onSave?.(score, weakTopics);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const grade =
    score >= 90
      ? { label: "Excellent", color: "text-success" }
      : score >= 75
        ? { label: "Good", color: "text-primary" }
        : score >= 60
          ? { label: "Fair", color: "text-warning" }
          : { label: "Needs Work", color: "text-destructive" };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-8 text-center"
    >
      <div className="space-y-4">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/20">
          <Trophy className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h2 className="text-4xl font-bold text-foreground">{score}%</h2>
          <p className={cn("text-lg font-semibold mt-1", grade.color)}>
            {grade.label}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {correct} of {total} questions correct
          </p>
        </div>
      </div>

      <Progress
        value={score}
        color={
          score >= 90
            ? "success"
            : score >= 75
              ? "primary"
              : score >= 60
                ? "warning"
                : "destructive"
        }
        className="h-3"
      />

      {weakTopics.length > 0 && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 p-5 text-left">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-warning" />
            <span className="text-sm font-semibold text-warning">
              Focus Areas
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[...new Set(weakTopics)].map((topic) => (
              <Badge key={topic} variant="warning">
                {topic}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Per-question summary */}
      <div className="space-y-2 text-left">
        {quiz.questions.map((q, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
          >
            {answers[i]?.correct ? (
              <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
            )}
            <span className="flex-1 text-sm text-foreground/80 truncate">
              {q.question}
            </span>
            <Badge variant={answers[i]?.correct ? "easy" : "hard"} className="flex-shrink-0">
              {answers[i]?.correct ? "✓" : "✗"}
            </Badge>
          </div>
        ))}
      </div>

      <div className="flex gap-3 justify-center">
        <Button variant="outline" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" />
          Try Again
        </Button>
      </div>
    </motion.div>
  );
}

export function QuizEngine({
  quiz,
  documentId,
  documentTitle,
}: {
  quiz: Quiz;
  documentId: string;
  documentTitle: string;
}) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<AnswerState[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState<AnswerState | null>(null);
  const [done, setDone] = useState(false);
  const [startTime] = useState(Date.now());

  const question = quiz.questions[current];

  function handleAnswer(index: number) {
    const correct = index === question.correctIndex;
    const state = { selected: index, correct };
    setCurrentAnswer(state);
  }

  function handleNext() {
    if (!currentAnswer) return;
    const next = [...answers, currentAnswer];
    setAnswers(next);
    setCurrentAnswer(null);

    if (current + 1 >= quiz.questions.length) {
      setDone(true);
    } else {
      setCurrent((c) => c + 1);
    }
  }

  function handleRetry() {
    setCurrent(0);
    setAnswers([]);
    setCurrentAnswer(null);
    setDone(false);
  }

  async function saveAttempt(score: number, weakTopics: string[]) {
    const elapsed = Math.round((Date.now() - startTime) / 60000);
    await fetch("/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "quiz_attempt",
        data: {
          quizId: documentId,
          documentId,
          documentTitle,
          score,
          totalQuestions: quiz.questions.length,
          correctAnswers: answers.filter((a) => a.correct).length + (currentAnswer?.correct ? 1 : 0),
          weakTopics,
          completedAt: Date.now(),
          durationMinutes: elapsed,
        },
      }),
    }).catch(() => null);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  return (
    <div className="space-y-6">
      {!done && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {answers.length} answered · {quiz.questions.length - current - 1} remaining
          </span>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {!done ? (
          <div key={`q-${current}`}>
            <QuestionCard
              question={question}
              questionNumber={current + 1}
              total={quiz.questions.length}
              onAnswer={handleAnswer}
              answered={currentAnswer}
            />
            {currentAnswer && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 flex justify-end"
              >
                <Button variant="accent" onClick={handleNext}>
                  {current + 1 === quiz.questions.length ? (
                    <>
                      <Trophy className="h-4 w-4" />
                      See Results
                    </>
                  ) : (
                    <>
                      Next Question
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </motion.div>
            )}
          </div>
        ) : (
          <ResultsView
            key="results"
            quiz={quiz}
            answers={answers}
            onRetry={handleRetry}
            onSave={saveAttempt}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
