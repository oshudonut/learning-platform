"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Trophy,
  Flame,
  BookOpen,
  Layers,
  Target,
  TrendingUp,
  Clock,
  BarChart3,
  Loader2,
  Activity,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { Analytics } from "@/lib/types";
import { formatDistanceToNow, formatDuration } from "@/lib/utils";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-primary",
  bg = "bg-primary/10",
  index = 0,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  bg?: string;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="rounded-xl border border-border bg-card p-5 space-y-3"
    >
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${bg}`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
        {sub && <div className="text-xs text-muted-foreground/70 mt-0.5">{sub}</div>}
      </div>
    </motion.div>
  );
}

type DailyCount = { date: string; count: number };
type UserActivity = {
  dailyCounts: DailyCount[];
  eventTypeCounts: Record<string, number>;
  totalEvents: number;
} | null;

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [userActivity, setUserActivity] = useState<UserActivity>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/analytics").then((r) => r.json()).catch(() => null),
      fetch("/api/analytics/user").then((r) => r.json()).catch(() => null),
    ]).then(([analyticsData, activityData]) => {
      if (analyticsData?.analytics) setAnalytics(analyticsData.analytics);
      if (activityData?.dailyCounts) setUserActivity(activityData);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AppShell mainClassName="flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </AppShell>
    );
  }

  const a = analytics ?? {
    quizAttempts: [],
    flashcardSessions: [],
    studyStreak: 0,
    lastStudied: null,
    totalStudyTime: 0,
  };

  const totalQuizzes = a.quizAttempts.length;
  const avgScore =
    totalQuizzes > 0
      ? Math.round(
          a.quizAttempts.reduce((acc, q) => acc + q.score, 0) / totalQuizzes,
        )
      : 0;

  const totalCards = a.flashcardSessions.reduce((acc, s) => acc + s.cardsStudied, 0);
  const avgFlashcardQuality =
    a.flashcardSessions.length > 0
      ? Math.round(
          (a.flashcardSessions.reduce((acc, s) => acc + s.avgQuality, 0) /
            a.flashcardSessions.length /
            5) *
            100,
        )
      : 0;

  // Weak topic aggregation
  const topicScores: Record<string, { total: number; count: number }> = {};
  for (const attempt of a.quizAttempts) {
    for (const topic of attempt.weakTopics) {
      if (!topicScores[topic]) topicScores[topic] = { total: 0, count: 0 };
      topicScores[topic].count += 1;
    }
  }

  const weakTopics = Object.entries(topicScores)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6);

  // Recent quiz history
  const recentQuizzes = [...a.quizAttempts].reverse().slice(0, 8);

  // Quiz score trend (last 10)
  const scoreTrend = a.quizAttempts.slice(-10).map((q) => q.score);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track your mastery, retention, and study habits
            </p>
          </div>

          {/* Stats grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <StatCard
              icon={Flame}
              label="Study Streak"
              value={`${a.studyStreak}d`}
              sub={a.lastStudied ? `Last studied ${formatDistanceToNow(a.lastStudied)}` : "Start studying!"}
              color="text-orange-400"
              bg="bg-orange-500/10"
              index={0}
            />
            <StatCard
              icon={Trophy}
              label="Avg Quiz Score"
              value={totalQuizzes > 0 ? `${avgScore}%` : "—"}
              sub={`${totalQuizzes} quiz${totalQuizzes !== 1 ? "zes" : ""} completed`}
              color="text-amber-400"
              bg="bg-amber-500/10"
              index={1}
            />
            <StatCard
              icon={Layers}
              label="Cards Reviewed"
              value={totalCards > 0 ? totalCards : "—"}
              sub={`${a.flashcardSessions.length} sessions · ${avgFlashcardQuality}% mastery`}
              color="text-sky-400"
              bg="bg-sky-500/10"
              index={2}
            />
            <StatCard
              icon={Clock}
              label="Total Study Time"
              value={a.totalStudyTime > 0 ? formatDuration(a.totalStudyTime) : "—"}
              sub="Estimated study time"
              color="text-emerald-400"
              bg="bg-emerald-500/10"
              index={3}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Quiz Score Trend */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-5">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-foreground">Quiz Performance</h2>
              </div>

              {scoreTrend.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-3">
                  <BarChart3 className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground text-center">
                    Complete your first quiz to see performance trends
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Simple bar chart */}
                  <div className="flex items-end gap-1.5 h-32">
                    {scoreTrend.map((score, i) => (
                      <div
                        key={i}
                        className="flex-1 flex items-end"
                      >
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${score}%` }}
                          transition={{ delay: i * 0.05, duration: 0.5, ease: "easeOut" }}
                          className="w-full rounded-t-sm"
                          style={{
                            background:
                              score >= 90
                                ? "#22c55e"
                                : score >= 75
                                  ? "#a78bfa"
                                  : score >= 60
                                    ? "#f59e0b"
                                    : "#ef4444",
                            minHeight: "4px",
                          }}
                          title={`${score}%`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Oldest</span>
                    <span>Most recent</span>
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    {[
                      { label: "90%+", color: "#22c55e" },
                      { label: "75–89%", color: "#a78bfa" },
                      { label: "60–74%", color: "#f59e0b" },
                      { label: "<60%", color: "#ef4444" },
                    ].map(({ label, color }) => (
                      <div key={label} className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full" style={{ background: color }} />
                        <span className="text-[10px] text-muted-foreground">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Weak Topics */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-5">
                <Target className="h-4 w-4 text-warning" />
                <h2 className="font-semibold text-foreground">Focus Areas</h2>
                <Badge variant="warning" className="ml-auto">Needs Review</Badge>
              </div>

              {weakTopics.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-3">
                  <Trophy className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground text-center">
                    No weak topics detected yet — keep taking quizzes!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {weakTopics.map(([topic, stats], i) => {
                    const maxCount = weakTopics[0][1].count;
                    const pct = Math.round((stats.count / maxCount) * 100);
                    return (
                      <div key={topic} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-foreground">{topic}</span>
                          <span className="text-xs text-muted-foreground">
                            missed {stats.count}×
                          </span>
                        </div>
                        <Progress
                          value={pct}
                          color={pct >= 70 ? "destructive" : pct >= 40 ? "warning" : "primary"}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recent Quiz History */}
          {recentQuizzes.length > 0 && (
            <div className="mt-6 rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-5">
                <BookOpen className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-foreground">Recent Quizzes</h2>
              </div>
              <div className="space-y-2">
                {recentQuizzes.map((attempt, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg border border-border px-3 sm:px-4 py-3"
                  >
                    <div
                      className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{
                        background:
                          attempt.score >= 90
                            ? "#22c55e"
                            : attempt.score >= 75
                              ? "#a78bfa"
                              : attempt.score >= 60
                                ? "#f59e0b"
                                : "#ef4444",
                      }}
                    />
                    <span className="flex-1 text-sm text-foreground truncate min-w-0">
                      {attempt.documentTitle}
                    </span>
                    <span className="text-sm font-semibold text-foreground flex-shrink-0">
                      {attempt.score}%
                    </span>
                    <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">
                      {formatDistanceToNow(attempt.completedAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Study Activity — 14-day bar chart from learning_analytics */}
          {userActivity && (
            <div className="mt-6 rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-foreground">Study Activity</h2>
                <span className="ml-auto text-xs text-muted-foreground">
                  {userActivity.totalEvents} event{userActivity.totalEvents !== 1 ? "s" : ""} in the last 14 days
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Sections read, quizzes, and flashcard sessions
              </p>

              {userActivity.totalEvents === 0 ? (
                <div className="flex flex-col items-center py-6 gap-2">
                  <Activity className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground text-center">
                    No activity recorded yet — start studying to see your activity here.
                  </p>
                </div>
              ) : (
                <>
                  {/* Daily bar chart */}
                  <div className="flex items-end gap-1 h-20 mb-2">
                    {userActivity.dailyCounts.map(({ date, count }, i) => {
                      const maxCount = Math.max(...userActivity.dailyCounts.map((d) => d.count), 1);
                      const pct = Math.round((count / maxCount) * 100);
                      return (
                        <div key={date} className="flex-1 flex flex-col items-center gap-1">
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${pct}%` }}
                            transition={{ delay: i * 0.03, duration: 0.4, ease: "easeOut" }}
                            className="w-full rounded-t-sm bg-primary/50 min-h-[2px]"
                            style={{ minHeight: count > 0 ? "4px" : "2px" }}
                            title={`${date}: ${count} event${count !== 1 ? "s" : ""}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-4">
                    <span>
                      {new Date(userActivity.dailyCounts[0].date + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                    <span>Today</span>
                  </div>

                  {/* Event type breakdown */}
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(userActivity.eventTypeCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([type, count]) => {
                        const label: Record<string, string> = {
                          section_complete: "Sections",
                          quiz_pass: "Quiz Passes",
                          quiz_fail: "Quiz Fails",
                          flashcard_session_complete: "Flashcard Sessions",
                          remediation_triggered: "Remediations",
                        };
                        const colorClass: Record<string, string> = {
                          section_complete: "text-emerald-500 bg-emerald-500/10",
                          quiz_pass: "text-violet-500 bg-violet-500/10",
                          quiz_fail: "text-red-500 bg-red-500/10",
                          flashcard_session_complete: "text-sky-500 bg-sky-500/10",
                          remediation_triggered: "text-amber-500 bg-amber-500/10",
                        };
                        return (
                          <div
                            key={type}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colorClass[type] ?? "text-muted-foreground bg-muted"}`}
                          >
                            <span>{count}</span>
                            <span>{label[type] ?? type}</span>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Empty state */}
          {totalQuizzes === 0 && totalCards === 0 && (
            <div className="mt-8 rounded-xl border border-dashed border-border border-dashed p-12 text-center">
              <BarChart3 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="font-semibold text-foreground mb-2">No study data yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Upload a document, take a quiz, or study flashcards to start tracking your progress and building mastery.
              </p>
            </div>
          )}
      </div>
    </AppShell>
  );
}
