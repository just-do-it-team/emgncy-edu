import { api, type LessonReviewDto, type LessonReviewRequestDto, type MonitoredSession } from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import { toLessonAiReview, type LessonAiReview } from "../model/lesson-ai-review";
import { lessonReviewMock } from "./lesson-ai-review.mocks";

const MOCK_DELAY_MS = 2000;
const REVIEW_TIMEOUT_MS = 180_000;

export interface LessonReviewInput {
  request: LessonReviewRequestDto;
  sessions: MonitoredSession[];
  basis: LessonAiReview;
}

export async function generateLessonReview({ request, sessions, basis }: LessonReviewInput): Promise<LessonAiReview> {
  if (mocks.ai) {
    await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS));

    return toLessonAiReview(lessonReviewMock(basis, sessions), sessions);
  }

  const { data } = await api.post<LessonReviewDto>(`${CARD_API_URL}/lesson-reviews/generate`, request, {
    timeout: REVIEW_TIMEOUT_MS,
  });

  return toLessonAiReview(data, sessions);
}
