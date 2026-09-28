import { useMutation } from "@tanstack/react-query";
import { generateLessonReview } from "./lesson-ai-review-api";

export function useGenerateLessonReview() {
  return useMutation({ mutationFn: generateLessonReview, retry: false });
}
