import {
  api,
  toExpertReviewContext,
  toLimitedReviewContext,
  toReviewAssignment,
  toReviewSession,
  type ExpertAssessmentRequestDto,
  type ExpertReviewContext,
  type ExpertReviewContextDto,
  type ReviewAssignment,
  type ReviewSession,
  type ScenarioAssignmentDto,
  type ScheduledCardDto,
  type SessionTrainingCallDto,
  type TrainingActionDto,
  type TrainingSessionDto,
} from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import {
  expertReviewContextMock,
  reviewAssignmentMock,
  reviewSessionMock,
} from "./expert-review.mocks";

export async function fetchExpertReviewContext(
  trainingSessionId: string,
  teacherId: string,
  signal?: AbortSignal,
): Promise<ExpertReviewContext> {
  if (mocks.expertReview) return toExpertReviewContext(expertReviewContextMock);

  const { data } = await api.get<ExpertReviewContextDto>(
    `${CARD_API_URL}/training-sessions/${trainingSessionId}/expert-review-context`,
    { params: { teacher_id: teacherId }, signal },
  );

  return toExpertReviewContext(data);
}

export async function fetchReviewAssignment(
  assignmentId: string,
  signal?: AbortSignal,
): Promise<ReviewAssignment> {
  if (mocks.expertReview) return toReviewAssignment(reviewAssignmentMock);

  const { data } = await api.get<ScenarioAssignmentDto>(
    `${CARD_API_URL}/teacher/scenario-assignments/${assignmentId}`,
    { signal },
  );

  return toReviewAssignment(data);
}

export async function updateExpertAssessment(
  trainingSessionId: string,
  body: ExpertAssessmentRequestDto,
): Promise<ReviewSession> {
  if (mocks.expertReview) {
    return toReviewSession({
      ...reviewSessionMock,
      expert_score: body.score,
      expert_passed: body.passed,
      expert_comment: body.comment,
      expert_evaluated_by: body.teacher_id,
      expert_evaluated_at: new Date().toISOString(),
    });
  }

  const { data } = await api.put<TrainingSessionDto>(
    `${CARD_API_URL}/training-sessions/${trainingSessionId}/expert-assessment`,
    body,
  );

  return toReviewSession(data);
}

export async function fetchLimitedReviewContext(
  trainingSessionId: string,
  signal?: AbortSignal,
): Promise<ExpertReviewContext> {
  const base = `${CARD_API_URL}/training-sessions/${trainingSessionId}`;
  const [session, calls, cards, actions] = await Promise.all([
    api.get<TrainingSessionDto>(base, { signal }),
    api.get<SessionTrainingCallDto[]>(`${base}/incoming-calls`, { signal }),
    api.get<ScheduledCardDto[]>(`${base}/scheduled-cards`, { signal }),
    api.get<TrainingActionDto[]>(`${base}/actions`, { signal }),
  ]);
  const assignment = await fetchReviewAssignment(session.data.assignment_id, signal);

  return toLimitedReviewContext({
    session: session.data,
    calls: calls.data,
    cards: cards.data,
    actions: actions.data,
    participantIds: assignment.participants.map((participant) => participant.userId),
  });
}
