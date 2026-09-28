export interface LessonReviewRequestDto {
  teacher_id: string;
  assignment_batch_id: string | null;
  assignment_ids: string[];
  session_ids: string[];
}

export interface LessonReviewTypicalErrorDto {
  title: string;
  description: string;
  students_count: number;
  session_ids: string[];
}

export interface LessonReviewStudentNoteDto {
  student_id: string;
  session_id: string;
  note: string;
}

export interface LessonReviewDto {
  summary: string;
  typical_errors: LessonReviewTypicalErrorDto[];
  recommendations: string[];
  student_notes: LessonReviewStudentNoteDto[];
  model: string;
  generated_at: string;
}
