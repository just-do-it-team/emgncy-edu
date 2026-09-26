import { useQuery } from "@tanstack/react-query";
import { toTeacherStudent, type TeacherStudent, type TeacherStudentDto } from "@/shared/api";
import { fetchTeacherStudents, fetchTrainingHistory } from "./student-api";
import { studentKeys } from "./student.keys";

const DIRECTORY_STALE_MS = 24 * 60 * 60 * 1000;
const DIRECTORY_GC_MS = 7 * 24 * 60 * 60 * 1000;
const LIST_STALE_MS = 30 * 1000;
const LIST_GC_MS = 5 * 60 * 1000;

const nameCollator = new Intl.Collator("ru");

function toNames(students: TeacherStudentDto[]): Map<string, string> {
  return new Map(students.map((student) => [student.id, student.display_name]));
}

function toSortedStudents(students: TeacherStudentDto[]): TeacherStudent[] {
  return students
    .map(toTeacherStudent)
    .sort((first, second) => nameCollator.compare(first.displayName, second.displayName));
}

function directoryQuery(teacherId: string) {
  return {
    queryKey: studentKeys.directory(teacherId),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchTeacherStudents(teacherId, signal),
    staleTime: DIRECTORY_STALE_MS,
    gcTime: DIRECTORY_GC_MS,
    refetchOnMount: false,
    retry: 2,
    meta: { showGlobalError: false },
  } as const;
}

export function useStudentNames(teacherId: string) {
  return useQuery({ ...directoryQuery(teacherId), select: toNames });
}

export function useTeacherStudents(teacherId: string) {
  return useQuery({ ...directoryQuery(teacherId), select: toSortedStudents });
}

export function useTrainingHistory(studentId: string, teacherId: string) {
  return useQuery({
    queryKey: studentKeys.history(studentId, teacherId),
    queryFn: ({ signal }) => fetchTrainingHistory(studentId, teacherId, signal),
    staleTime: LIST_STALE_MS,
    gcTime: LIST_GC_MS,
    meta: { showGlobalError: false },
  });
}
