import type { LessonDto, LessonResultDto } from "@/shared/api";

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

function moscowDateAt(dayOffset: number, hours: number, minutes: number): string {
  const moscowNow = new Date(Date.now() + MOSCOW_OFFSET_MS);
  const moscowWallClock = Date.UTC(
    moscowNow.getUTCFullYear(),
    moscowNow.getUTCMonth(),
    moscowNow.getUTCDate() + dayOffset,
    hours,
    minutes,
  );

  return `${new Date(moscowWallClock).toISOString().slice(0, 19)}+03:00`;
}

const runningLessonId = "6e1a3c58-7d2f-4b94-8a06-1f3c5e7a9b2d";
const finishedLessonId = "7f2b4d69-8e3a-4ca5-9b17-2a4d6f8b0c3e";
const plannedLessonId = "8a3c5e7a-9f4b-4db6-8c28-3b5e7a9c1d4f";

const students = {
  andreeva: "00000000-0000-0000-0000-000000000203",
  ivanov: "00000000-0000-0000-0000-000000000202",
  kuznetsova: "b02d4f68-3e5a-4c79-9b1f-0a2c4e6d8f37",
  belova: "c13e5a79-4f6b-4d8a-8c2a-1b3d5f7e9a48",
  orlov: "d24f6b8a-5a7c-4e9b-9d3b-2c4e6a8f0b59",
  timofeev: "e35a7c9b-6b8d-4fac-8e4c-3d5f7b9a1c6a",
};

export const lessonContractMocks: LessonDto[] = [
  {
    lesson_id: runningLessonId,
    name: "Задымление: квартира — приём вызова оператором 112",
    group_name: "УМЦ-112, группа 4",
    scenarios_count: 2,
    attempts_total: 3,
    average_total: 69.5,
    status: "RUNNING",
    started_at: moscowDateAt(0, 10, 0),
    assigned_at: moscowDateAt(-2, 16, 0),
    due_at: moscowDateAt(0, 18, 0),
    attempts_allowed: 2,
  },
  {
    lesson_id: finishedLessonId,
    name: "Пожар: газовая плита — принятие карточки диспетчером ДДС",
    group_name: "УМЦ-112, группа 7",
    scenarios_count: 1,
    attempts_total: 6,
    average_total: 78.5,
    status: "FINISHED",
    started_at: moscowDateAt(-6, 11, 0),
    assigned_at: moscowDateAt(-9, 15, 30),
    due_at: moscowDateAt(-5, 18, 0),
    attempts_allowed: 2,
  },
  {
    lesson_id: plannedLessonId,
    name: "ДТП без пострадавших — легковой: регистрация и оповещение служб",
    group_name: "УМЦ-112, группа 4",
    scenarios_count: 3,
    attempts_total: 0,
    average_total: null,
    status: "PLANNED",
    started_at: moscowDateAt(3, 10, 0),
    assigned_at: moscowDateAt(0, 9, 30),
    due_at: moscowDateAt(5, 18, 0),
    attempts_allowed: 1,
  },
];

export const lessonResultMocks: Record<string, LessonResultDto[]> = {
  [runningLessonId]: [
    {
      student_id: students.andreeva,
      attempts_used: 1,
      best_score: "58.50",
      last_attempt_id: "1b4d6f8a-0c2e-4a57-9d3f-5e7a9c1b3d60",
      passed: false,
    },
    {
      student_id: students.ivanov,
      attempts_used: 2,
      best_score: "86.00",
      last_attempt_id: "2c5e7a9b-1d3f-4b68-8e4a-6f8b0d2c4e71",
      passed: true,
    },
    {
      student_id: students.kuznetsova,
      attempts_used: 0,
      best_score: null,
      last_attempt_id: null,
      passed: null,
    },
  ],
  [finishedLessonId]: [
    {
      student_id: students.belova,
      attempts_used: 2,
      best_score: "91.00",
      last_attempt_id: "3d6f8b0c-2e4a-4c79-9f5b-7a9c1e3d5f82",
      passed: true,
    },
    {
      student_id: students.orlov,
      attempts_used: 2,
      best_score: "66.50",
      last_attempt_id: "4e7a9c1d-3f5b-4d8a-8a6c-8b0d2f4e6a93",
      passed: false,
    },
    {
      student_id: students.timofeev,
      attempts_used: 2,
      best_score: "88.00",
      last_attempt_id: "5f8b0d2e-4a6c-4e9b-9b7d-9c1e3a5f7b04",
      passed: true,
    },
  ],
  [plannedLessonId]: [
    {
      student_id: students.andreeva,
      attempts_used: 0,
      best_score: null,
      last_attempt_id: null,
      passed: null,
    },
    {
      student_id: students.ivanov,
      attempts_used: 0,
      best_score: null,
      last_attempt_id: null,
      passed: null,
    },
    {
      student_id: students.kuznetsova,
      attempts_used: 0,
      best_score: null,
      last_attempt_id: null,
      passed: null,
    },
  ],
};
