import {
  api,
  toExpertReviewContext,
  toReviewAssignment,
  toReviewSession,
  type ExpertAssessmentRequestDto,
  type ExpertReviewContext,
  type ExpertReviewContextDto,
  type ReviewAssignment,
  type ReviewSession,
  type ScenarioAssignmentDto,
  type TrainingSessionDto,
} from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import {
  expertReviewContextMock,
  reviewAssignmentMock,
  reviewSessionMock,
} from "./expert-review.mocks";

const mockAssessments = new Map<string, Pick<TrainingSessionDto, "expert_score" | "expert_passed" | "expert_comment" | "expert_evaluated_by" | "expert_evaluated_at">>();

function mockSession(trainingSessionId: string): TrainingSessionDto {
  return { ...reviewSessionMock, id: trainingSessionId, ...mockAssessments.get(trainingSessionId) };
}

export async function fetchExpertReviewContext(
  trainingSessionId: string,
  teacherId: string,
  signal?: AbortSignal,
): Promise<ExpertReviewContext> {
  if (mocks.expertReview) {
    return toExpertReviewContext({ ...expertReviewContextMock, session: mockSession(trainingSessionId) });
  }

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
    mockAssessments.set(trainingSessionId, {
      expert_score: body.score,
      expert_passed: body.passed,
      expert_comment: body.comment,
      expert_evaluated_by: body.teacher_id,
      expert_evaluated_at: new Date().toISOString(),
    });

    return toReviewSession(mockSession(trainingSessionId));
  }

  const { data } = await api.put<TrainingSessionDto>(
    `${CARD_API_URL}/training-sessions/${trainingSessionId}/expert-assessment`,
    body,
  );

  return toReviewSession(data);
}
