import type { AssignmentParticipantStatus, LaunchPolicy } from "@/shared/api";

export const launchPolicyLabels: Record<LaunchPolicy, string> = {
  STUDENT_SELF_START: "обучаемый запускает сам в окне выполнения",
  TEACHER_START: "запускает преподаватель",
  ALL_PARTICIPANTS_READY: "запускается, когда все участники отметили готовность",
  SCHEDULED_START: "запускается по расписанию",
};

export const participantStatusLabels: Record<AssignmentParticipantStatus, string> = {
  ASSIGNED: "назначено",
  READY: "готов",
  RUNNING: "выполняет",
  COMPLETED: "завершил",
};
