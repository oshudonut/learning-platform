import type { MatchRoom, MatchParticipant, MatchAnswer, QuizQuestion } from "@/lib/types";

export function rowToMatchRoom(row: Record<string, unknown>): MatchRoom {
  const hostProfileRaw = row.user_profiles as Record<string, unknown> | null | undefined;
  return {
    id: row.id as string,
    roomCode: row.room_code as string,
    hostId: row.host_id as string,
    invitedUserId: (row.invited_user_id as string | null) ?? null,
    sharedDocumentId: (row.shared_document_id as string | null) ?? null,
    documentId: (row.document_id as string | null) ?? null,
    status: row.status as "waiting" | "active" | "completed",
    quizSnapshot: row.quiz_snapshot as QuizQuestion[],
    currentQuestionIndex: (row.current_question_index as number) ?? 0,
    totalQuestions: row.total_questions as number,
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    createdAt: row.created_at as string,
    hostProfile: hostProfileRaw
      ? { displayName: hostProfileRaw.display_name as string, username: hostProfileRaw.username as string }
      : null,
  };
}

export function rowToParticipant(row: Record<string, unknown>): MatchParticipant {
  return {
    id: row.id as string,
    roomId: row.room_id as string,
    userId: row.user_id as string,
    score: (row.score as number) ?? 0,
    isReady: (row.is_ready as boolean) ?? false,
    joinedAt: row.joined_at as string,
    profile: row.user_profiles
      ? (() => {
          const p = row.user_profiles as Record<string, unknown>;
          return {
            id: p.id as string,
            username: p.username as string,
            displayName: p.display_name as string,
            avatarUrl: p.avatar_url as string | null,
          };
        })()
      : undefined,
  };
}

export function rowToAnswer(row: Record<string, unknown>): MatchAnswer {
  return {
    id: row.id as string,
    roomId: row.room_id as string,
    questionIndex: row.question_index as number,
    userId: row.user_id as string,
    answer: row.answer as string,
    isCorrect: row.is_correct as boolean,
    gotPoint: (row.got_point as boolean) ?? false,
    answeredAt: row.answered_at as string,
  };
}

export function mapMatchRoomPayload(payload: Record<string, unknown>): Partial<MatchRoom> {
  return {
    status: payload.status as MatchRoom["status"],
    currentQuestionIndex: payload.current_question_index as number,
    startedAt: payload.started_at as string | null,
    completedAt: payload.completed_at as string | null,
  };
}

export function mapParticipantPayload(payload: Record<string, unknown>): Partial<MatchParticipant> {
  return {
    isReady: payload.is_ready as boolean,
    score: payload.score as number,
  };
}

export function mapAnswerPayload(payload: Record<string, unknown>): MatchAnswer {
  return {
    id: payload.id as string,
    roomId: payload.room_id as string,
    questionIndex: payload.question_index as number,
    userId: payload.user_id as string,
    answer: payload.answer as string,
    isCorrect: payload.is_correct as boolean,
    gotPoint: (payload.got_point as boolean) ?? false,
    answeredAt: payload.answered_at as string,
  };
}
