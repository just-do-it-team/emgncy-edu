import { useAssignments } from "@/entities/assignment";
import { useTeacherSessions } from "@/entities/monitoring";
import { buildLessons, type Lesson } from "../model/build-lessons";

export type TeacherLessonsState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "success"; lessons: Lesson[] };

export function useTeacherLessons(teacherId: string): TeacherLessonsState {
  const assignments = useAssignments({ assignedBy: teacherId });
  const sessions = useTeacherSessions(teacherId, "ANY");
  const sources = [assignments, sessions];

  if (sources.some((source) => source.isError)) {
    return {
      status: "error",
      retry: () => sources.filter((source) => source.isError).forEach((source) => void source.refetch()),
    };
  }

  if (!assignments.data || !sessions.data) return { status: "pending" };

  return { status: "success", lessons: buildLessons(assignments.data, sessions.data) };
}
