import {
  api,
  toTrainingHistoryItem,
  type StudentTrainingHistoryItemDto,
  type TeacherStudentDto,
  type TeacherStudentPageDto,
  type TrainingHistoryItem,
} from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import { studentsMock, trainingHistoryMock } from "./student.mocks";

const STUDENTS_PAGE_SIZE = 200;
const HISTORY_LIMIT = 500;

export async function fetchTeacherStudents(
  teacherId: string,
  signal?: AbortSignal,
): Promise<TeacherStudentDto[]> {
  if (mocks.students) return studentsMock;

  const students: TeacherStudentDto[] = [];
  let total = Infinity;

  while (students.length < total) {
    const { data } = await api.get<TeacherStudentPageDto>(`${CARD_API_URL}/students`, {
      params: {
        teacher_id: teacherId,
        include_blocked: true,
        limit: STUDENTS_PAGE_SIZE,
        offset: students.length,
      },
      signal,
    });

    students.push(...data.items);
    total = data.items.length === 0 ? students.length : data.total;
  }

  return students;
}

export async function fetchTrainingHistory(
  studentId: string,
  teacherId: string,
  signal?: AbortSignal,
): Promise<TrainingHistoryItem[]> {
  if (mocks.students) return (trainingHistoryMock[studentId] ?? []).map(toTrainingHistoryItem);

  const { data } = await api.get<StudentTrainingHistoryItemDto[]>(
    `${CARD_API_URL}/students/${studentId}/training-history`,
    { params: { teacher_id: teacherId, limit: HISTORY_LIMIT }, signal },
  );

  return data.map(toTrainingHistoryItem);
}
