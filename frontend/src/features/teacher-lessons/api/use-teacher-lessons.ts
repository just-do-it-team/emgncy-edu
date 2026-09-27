import { useQueries } from "@tanstack/react-query";
import { assignmentsQuery, useAssignments } from "@/entities/assignment";
import { useGroups } from "@/entities/group";
import { useTeacherSessions } from "@/entities/monitoring";
import { buildLessons, type Lesson } from "../model/build-lessons";

export type TeacherLessonsState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "success"; lessons: Lesson[] };

export function useTeacherLessons(teacherId: string): TeacherLessonsState {
  const assignments = useAssignments({ assignedBy: teacherId });
  const groups = useGroups(teacherId);
  const sessions = useTeacherSessions(teacherId, "ANY");
  const groupAssignments = useQueries({
    queries: (groups.data ?? []).map((group) =>
      assignmentsQuery({ assignedBy: teacherId, groupId: group.id }),
    ),
  });

  const sources = [assignments, groups, sessions, ...groupAssignments];

  if (sources.some((source) => source.isError)) {
    return {
      status: "error",
      retry: () => sources.filter((source) => source.isError).forEach((source) => void source.refetch()),
    };
  }

  if (!assignments.data || !groups.data || !sessions.data || groupAssignments.some((query) => !query.data)) {
    return { status: "pending" };
  }

  const groupNameByBatch = new Map<string, string>();

  groups.data.forEach((group, index) => {
    for (const assignment of groupAssignments[index]?.data ?? []) {
      if (assignment.batchId !== null) groupNameByBatch.set(assignment.batchId, group.name);
    }
  });

  return {
    status: "success",
    lessons: buildLessons(assignments.data, groupNameByBatch, sessions.data),
  };
}
