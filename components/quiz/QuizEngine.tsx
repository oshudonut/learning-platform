"use client";

import { useState, useEffect, useRef } from "react";
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
  Loader2,
  Star,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { ExtendedQuizQuestion, LearningMethod, QuizDifficultyLevel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PASSING_SCORE } from "@/lib/progression";
import { MethodBadge, getMethodHint } from "@/lib/learning-methods";

type AnswerState = {
  correct: boolean;
  feedback?: string;
};

// ─── Question renderers ───────────────────────────────────────────────────────

function MultipleChoiceQuestion({
  question,
  answered,
  onAnswer,
}: {
  question: Extract<ExtendedQuizQuestion, { type: "multiple_choice" }>;
  answered: AnswerState | null;
  onAnswer: (correct: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      {question.choices.map((choice, i) => {
        const isSelected = answered !== null && i === (answered.correct ? question.correctIndex : question.choices.findIndex((_, idx) => idx !== question.correctIndex && answered !== null));
        const isCorrect = i === question.correctIndex;
        const showResult = answered !== null;

        let stateClass = "border-sky-200/60 bg-[#D8ECF4] hover:border-sky-400/50 hover:bg-sky-100";
        if (showResult && isCorrect) stateClass = "border-success/40 bg-success/5";

        return (
          <motion.button
            key={i}
            whileHover={!showResult ? { x: 4 } : {}}
            onClick={() => !showResult && onAnswer(i === question.correctIndex)}
            disabled={showResult}
            className={cn(
              "w-full flex items-center gap-4 rounded-xl border px-5 py-4 text-left transition-all duration-200",
              stateClass,
              showResult && "cursor-default",
            )}
          >
            <span className={cn(
              "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
              showResult && isCorrect ? "bg-success/20 text-success" : "bg-muted text-muted-foreground",
            )}>
              {String.fromCharCode(65 + i)}
            </span>
            <span className="flex-1 text-sm text-foreground">{choice}</span>
            {showResult && isCorrect && <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />}
          </motion.button>
        );
      })}
    </div>
  );
}

function TrueFalseQuestion({
  answered,
  onAnswer,
  correctAnswer,
}: {
  answered: AnswerState | null;
  onAnswer: (correct: boolean) => void;
  correctAnswer: boolean;
}) {
  const [selected, setSelected] = useState<boolean | null>(null);
  const showResult = answered !== null;

  function handleSelect(value: boolean) {
    if (showResult) return;
    setSelected(value);
    onAnswer(value === correctAnswer);
  }

  return (
    <div className="flex gap-4">
      {[true, false].map((value) => {
        const isSelected = selected === value;
        const isCorrect = value === correctAnswer;
        let stateClass = "border-sky-200/60 bg-[#D8ECF4] hover:border-sky-400/50 hover:bg-sky-100";
        if (showResult && isCorrect) stateClass = "border-success/40 bg-success/5";
        else if (showResult && isSelected && !isCorrect) stateClass = "border-destructive/40 bg-destructive/5";

        return (
          <motion.button
            key={String(value)}
            whileHover={!showResult ? { scale: 1.02 } : {}}
            onClick={() => handleSelect(value)}
            disabled={showResult}
            className={cn(
              "flex-1 flex flex-col items-center gap-2 rounded-xl border px-6 py-6 text-center transition-all duration-200 font-semibold",
              stateClass,
              showResult && "cursor-default",
            )}
          >
            <span className="text-2xl">{value ? "✓" : "✗"}</span>
            <span className="text-sm">{value ? "True" : "False"}</span>
            {showResult && isCorrect && <CheckCircle2 className="h-4 w-4 text-success" />}
            {showResult && isSelected && !isCorrect && <XCircle className="h-4 w-4 text-destructive" />}
          </motion.button>
        );
      })}
    </div>
  );
}

function OpenAnswerQuestion({
  type,
  template,
  onAnswer,
  answered,
  question,
  correctAnswer,
  acceptableVariants,
}: {
  type: "identification" | "fill_in_the_blank";
  template?: string;
  onAnswer: (correct: boolean, feedback: string) => void;
  answered: AnswerState | null;
  question: string;
  correctAnswer: string;
  acceptableVariants?: string[];
}) {
  const [value, setValue] = useState("");
  const [grading, setGrading] = useState(false);

  async function handleSubmit() {
    if (!value.trim() || grading || answered) return;
    setGrading(true);
    try {
      const res = await fetch("/api/quiz/grade-open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, correctAnswer, acceptableVariants: acceptableVariants ?? [], userAnswer: value }),
      });
      const data = await res.json();
      onAnswer(data.correct, data.feedback);
    } catch {
      onAnswer(false, "Could not grade automatically — check the correct answer below.");
    } finally {
      setGrading(false);
    }
  }

  return (
    <div className="space-y-4">
      {type === "fill_in_the_blank" && template && (
        <div className="rounded-xl border border-sky-200/60 bg-[#D8ECF4] px-5 py-4">
          <p className="text-sm text-muted-foreground font-medium">Fill in the blank:</p>
          <p className="text-foreground mt-1">{template.replace("[BLANK]", "_______")}</p>
        </div>
      )}
      <div className="flex gap-3">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void handleSubmit()}
          disabled={!!answered || grading}
          placeholder={type === "identification" ? "Type your answer…" : "Fill in the blank…"}
          className="flex-1 rounded-xl border border-sky-200/60 bg-[#D8ECF4] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/30 transition-colors disabled:opacity-60"
        />
        {!answered && (
          <Button variant="accent" onClick={() => void handleSubmit()} disabled={!value.trim() || grading}>
            {grading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        )}
      </div>
      {answered && (
        <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
          <span className="text-muted-foreground">Correct answer: </span>
          <span className="font-medium text-foreground">{correctAnswer}</span>
        </div>
      )}
    </div>
  );
}

// ─── Question card ────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  questionNumber,
  total,
  onAnswer,
  answered,
}: {
  question: ExtendedQuizQuestion;
  questionNumber: number;
  total: number;
  onAnswer: (correct: boolean, feedback?: string) => void;
  answered: AnswerState | null;
}) {
  const difficultyVariant = { easy: "easy", medium: "medium", hard: "hard" } as const;

  return (
    <motion.div
      key={questionNumber}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            Question {questionNumber} of {total}
          </span>
          <Badge variant={difficultyVariant[question.difficulty]}>{question.difficulty}</Badge>
          <Badge variant="outline" className="capitalize">{question.type.replace(/_/g, " ")}</Badge>
        </div>
        <Badge variant="outline">{question.topic}</Badge>
      </div>

      <Progress value={questionNumber - 1} max={total} />

      <div className="rounded-xl border border-sky-200/60 bg-[#D8ECF4] p-6">
        <p className="text-lg font-medium text-foreground leading-relaxed">{question.question}</p>
      </div>

      {/* Question type renderer */}
      {question.type === "multiple_choice" && (
        <MultipleChoiceQuestion question={question} answered={answered} onAnswer={(correct) => onAnswer(correct)} />
      )}
      {question.type === "true_false" && (
        <TrueFalseQuestion answered={answered} onAnswer={(correct) => onAnswer(correct)} correctAnswer={question.correctAnswer} />
      )}
      {(question.type === "identification" || question.type === "fill_in_the_blank") && (
        <OpenAnswerQuestion
          type={question.type}
          template={question.type === "fill_in_the_blank" ? question.template : undefined}
          onAnswer={(correct, feedback) => onAnswer(correct, feedback)}
          answered={answered}
          question={question.question}
          correctAnswer={question.correctAnswer}
          acceptableVariants={question.acceptableVariants}
        />
      )}

      {/* Explanation */}
      <AnimatePresence>
        {answered && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "rounded-xl border p-5",
              answered.correct ? "border-success/20 bg-success/5" : "border-destructive/20 bg-destructive/5",
            )}
          >
            <div className="flex items-center gap-2 mb-3">
              {answered.correct ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="text-sm font-semibold text-success">
                    {answered.feedback ?? "Correct!"}
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-semibold text-destructive">
                    {answered.feedback ?? "Not quite — here's why:"}
                  </span>
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{question.explanation}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Results view ─────────────────────────────────────────────────────────────

function ResultsView({
  questions,
  answers,
  difficultyLevel,
  onRetry,
  onSave,
  onRemediate,
}: {
  questions: ExtendedQuizQuestion[];
  answers: AnswerState[];
  difficultyLevel: QuizDifficultyLevel;
  onRetry: () => void;
  onSave?: (score: number, weakTopics: string[], passed: boolean) => void;
  onRemediate?: (weakTopics: string[]) => void;
}) {
  const correct = answers.filter((a) => a.correct).length;
  const total = questions.length;
  const score = Math.round((correct / total) * 100);
  const passed = score >= PASSING_SCORE;

  const weakTopics = questions
    .filter((_, i) => !answers[i]?.correct)
    .map((q) => q.topic);

  const savedRef = useRef(false);
  useEffect(() => {
    if (!savedRef.current) {
      savedRef.current = true;
      onSave?.(score, weakTopics, passed);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const grade = passed
    ? { label: "Mastered", color: "text-amber-400", icon: Star }
    : score >= 75
      ? { label: "Good — but not enough", color: "text-warning", icon: Target }
      : { label: "Needs Work", color: "text-destructive", icon: AlertTriangle };

  const GradeIcon = grade.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-8 text-center"
    >
      <div className="space-y-4">
        <div className={cn(
          "mx-auto flex h-20 w-20 items-center justify-center rounded-full ring-1",
          passed ? "bg-amber-500/15 ring-amber-500/20" : "bg-primary/15 ring-primary/20"
        )}>
          <GradeIcon className={cn("h-10 w-10", grade.color)} />
        </div>
        <div>
          <h2 className="text-4xl font-bold text-foreground">{score}%</h2>
          <p className={cn("text-lg font-semibold mt-1", grade.color)}>{grade.label}</p>
          <p className="text-sm text-muted-foreground mt-2">
            {correct} of {total} questions correct
          </p>
          {!passed && (
            <p className="text-xs text-muted-foreground mt-1">
              Required to pass: <span className="font-semibold text-foreground">{PASSING_SCORE}%</span>
            </p>
          )}
        </div>
      </div>

      {passed ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold text-amber-400">
            🏆 Quiz Mastered at {difficultyLevel.replace(/_/g, " ")} level!
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            You can now attempt a higher difficulty level.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-left space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold text-destructive">Remediation Required</span>
          </div>
          <p className="text-xs text-muted-foreground">
            You need {PASSING_SCORE}% to pass. Review the weak areas below and retry the quiz.
          </p>
          {[...new Set(weakTopics)].length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[...new Set(weakTopics)].map((topic) => (
                <Badge key={topic} variant="warning">{topic}</Badge>
              ))}
            </div>
          )}
          {onRemediate && (
            <Button variant="outline" size="sm" className="w-full border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => onRemediate(weakTopics)}>
              <Target className="h-4 w-4" />
              Start Remediation
            </Button>
          )}
        </div>
      )}

      <Progress
        value={score}
        color={passed ? "success" : score >= 75 ? "warning" : "destructive"}
        className="h-3"
      />

      {/* Per-question summary */}
      <div className="space-y-2 text-left">
        {questions.map((q, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
            {answers[i]?.correct ? (
              <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
            )}
            <span className="flex-1 text-sm text-foreground/80 truncate">{q.question}</span>
            <Badge variant="outline" className="text-[10px] capitalize flex-shrink-0">
              {q.type.replace(/_/g, " ")}
            </Badge>
          </div>
        ))}
      </div>

      <div className="flex gap-3 justify-center">
        <Button variant="outline" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" />
          {passed ? "Try Higher Level" : "Retry Quiz"}
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Main engine ─────────────────────────────────────────────────────────────

export function QuizEngine({
  quiz,
  documentId,
  documentTitle,
  difficultyLevel = "beginner",
  learningMethod = null,
  onQuizComplete,
}: {
  quiz: { questions: ExtendedQuizQuestion[] };
  documentId: string;
  documentTitle: string;
  difficultyLevel?: QuizDifficultyLevel;
  learningMethod?: LearningMethod | null;
  onQuizComplete?: (passed: boolean, weakTopics: string[]) => void;
}) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<AnswerState[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState<AnswerState | null>(null);
  const [done, setDone] = useState(false);
  const [startTime] = useState(Date.now());

  const question = quiz.questions[current];

  function handleAnswer(correct: boolean, feedback?: string) {
    setCurrentAnswer({ correct, feedback });
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

  async function saveAttempt(score: number, weakTopics: string[], passed: boolean) {
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

    // Update progression
    await fetch("/api/progression", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "complete_quiz", documentId, passed, difficultyLevel }),
    }).catch(() => null);

    onQuizComplete?.(passed, weakTopics);
  }

  async function handleRemediate(weakTopics: string[]) {
    await fetch("/api/remediation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "generate", documentId, weakTopics }),
    }).catch(() => null);
    onQuizComplete?.(false, weakTopics);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const methodHint = getMethodHint(learningMethod, "quiz");

  return (
    <div className="space-y-6">
      {!done && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-3 flex-wrap">
            <span>{answers.length} answered · {quiz.questions.length - current - 1} remaining</span>
            <Badge variant="outline" className="capitalize text-xs">{difficultyLevel.replace(/_/g, " ")}</Badge>
            <MethodBadge method={learningMethod} />
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
          </div>
        </div>
      )}

      {!done && methodHint && (
        <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <Lightbulb className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground italic leading-relaxed">{methodHint}</p>
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
            questions={quiz.questions}
            answers={answers}
            difficultyLevel={difficultyLevel}
            onRetry={handleRetry}
            onSave={saveAttempt}
            onRemediate={handleRemediate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
