import type { ExpertAssessmentRequestDto } from "@/shared/api";

export const DISMISSED_HEADING = "Не считаю ошибками:";
export const MAX_SCORE = 100;
export const MAX_COMMENT_LENGTH = 10_000;

const SCORE_DECIMALS = 2;
const SCORE_EPSILON = 0.005;

export interface AssessmentValues {
  score: number | "";
  passed: boolean;
  comment: string;
}

export interface AutomaticOutcome {
  score: number | null;
  passed: boolean | null;
}

export function teacherText(comment: string | null): string {
  if (comment === null) return "";

  const start = comment.indexOf(DISMISSED_HEADING);

  return (start === -1 ? comment : comment.slice(0, start)).trim();
}

export function assessmentComment(text: string, dismissed: string[]): string | null {
  const parts = [
    text.trim(),
    dismissed.length === 0 ? "" : `${DISMISSED_HEADING}\n${dismissed.map((label) => `— ${label}`).join("\n")}`,
  ].filter((part) => part !== "");

  return parts.length === 0 ? null : parts.join("\n\n");
}

export function differsFromAutomatic(automatic: AutomaticOutcome, values: AssessmentValues): boolean {
  if (values.score === "") return false;

  return (
    automatic.score === null ||
    Math.abs(automatic.score - values.score) > SCORE_EPSILON ||
    automatic.passed !== values.passed
  );
}

export type AssessmentErrors = Partial<Record<keyof AssessmentValues, string>>;

export function validateAssessment(values: AssessmentValues, automatic: AutomaticOutcome, dismissed: string[]): AssessmentErrors {
  const errors: AssessmentErrors = {};

  if (values.score === "" || values.score < 0 || values.score > MAX_SCORE) errors.score = `Балл от 0 до ${MAX_SCORE}`;
  if (differsFromAutomatic(automatic, values) && values.comment.trim() === "") {
    errors.comment = "Укажите причину изменения оценки";
  }
  if ((assessmentComment(values.comment, dismissed) ?? "").length > MAX_COMMENT_LENGTH) {
    errors.comment = `Комментарий вместе со списком не длиннее ${MAX_COMMENT_LENGTH} символов`;
  }

  return errors;
}

export function assessmentBody(
  values: AssessmentValues,
  dismissed: string[],
): Omit<ExpertAssessmentRequestDto, "teacher_id"> {
  return {
    score: (values.score === "" ? 0 : values.score).toFixed(SCORE_DECIMALS),
    passed: values.passed,
    comment: assessmentComment(values.comment, dismissed),
  };
}
