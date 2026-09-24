export interface LessonResultDto {
  student_id: string;
  attempts_used: number;
  best_score: string | null;
  last_attempt_id: string | null;
  passed: boolean | null;
}

export interface LessonResult {
  studentId: string;
  attemptsUsed: number;
  bestScore: number | null;
  lastAttemptId: string | null;
  passed: boolean | null;
}

export function toLessonResult(dto: LessonResultDto): LessonResult {
  return {
    studentId: dto.student_id,
    attemptsUsed: dto.attempts_used,
    bestScore: dto.best_score === null ? null : Number(dto.best_score),
    lastAttemptId: dto.last_attempt_id,
    passed: dto.passed,
  };
}
