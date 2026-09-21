import type { Lesson, LessonListItem, LessonSummary } from "../model/lesson";

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

function daysAgoAt(days: number, hours: number, minutes: number): string {
  const moscowNow = new Date(Date.now() + MOSCOW_OFFSET_MS);
  const time =
    Date.UTC(
      moscowNow.getUTCFullYear(),
      moscowNow.getUTCMonth(),
      moscowNow.getUTCDate() - days,
      hours,
      minutes,
      0,
    ) - MOSCOW_OFFSET_MS;

  return `${new Date(time + MOSCOW_OFFSET_MS).toISOString().slice(0, 19)}+03:00`;
}

export const demoLessonId = "5d1f8a36-9c47-4e23-8b95-1a6d3f7c2e58";

const scenarios = [
  {
    scenario_id: "e2a9c541-7b38-4d95-8f16-3c7e1a5d9b40",
    name: "Задымление мусоропровода в жилом доме",
    difficulty: 2,
  },
  {
    scenario_id: "f3b0d652-8c49-4e16-9a27-4d8f2b6e0c51",
    name: "Отравление лекарственными препаратами",
    difficulty: 3,
  },
  {
    scenario_id: "a4c1e763-9d50-4f27-8b38-5e9a3c7f1d62",
    name: "Задымление в торговом центре",
    difficulty: 4,
  },
  {
    scenario_id: "b5d2f874-0e61-4a38-9c49-6f0b4d8a2e73",
    name: "ДТП с пострадавшими на съезде с МКАД",
    difficulty: 4,
  },
  {
    scenario_id: "c6e3a985-1f72-4b49-8d50-7a1c5e9f3b84",
    name: "Пожар на балконе жилого дома",
    difficulty: 3,
  },
] satisfies Lesson["scenarios"];

export const runningLessonId = "8b3e5c72-1d94-4a68-9f37-4e2a7c5d9b16";

export const lessonMocks: Lesson[] = [
  {
    lesson_id: runningLessonId,
    name: "Практическое занятие: приём вызовов, смешанный набор",
    group_id: "7c1e5a93-4d86-4f27-9b35-8e2a6c4f1d90",
    group_name: "УМЦ-112, группа 4",
    scenarios: [scenarios[0], scenarios[1]],
    norms: { ack_seconds: 30, fill_seconds: 180 },
    started_at: daysAgoAt(0, 10, 0),
    finished_at: null,
    status: "RUNNING",
    participants_count: 6,
  },
  {
    lesson_id: demoLessonId,
    name: "Практическое занятие: пожары и задымления",
    group_id: "7c1e5a93-4d86-4f27-9b35-8e2a6c4f1d90",
    group_name: "УМЦ-112, группа 4",
    scenarios: [scenarios[2]],
    norms: { ack_seconds: 30, fill_seconds: 180 },
    started_at: daysAgoAt(1, 10, 0),
    finished_at: daysAgoAt(1, 12, 40),
    status: "FINISHED",
    participants_count: 5,
  },
  {
    lesson_id: "0d5a7e94-3f16-4c80-9b59-6a4c9e7f1d38",
    name: "Практическое занятие: работа диспетчера ДДС",
    group_id: "9c4f6d83-2e05-4b79-8a48-5f3b8d6e0c27",
    group_name: "УМЦ-112, группа 2",
    scenarios: [scenarios[3]],
    norms: { ack_seconds: 30, fill_seconds: 180 },
    started_at: daysAgoAt(2, 11, 0),
    finished_at: daysAgoAt(2, 13, 20),
    status: "FINISHED",
    participants_count: 8,
  },
  {
    lesson_id: "1e6b8f05-4a27-4d91-8c60-7b5d0f8a2e49",
    name: "Практическое занятие: адрес и топонимы",
    group_id: "9c4f6d83-2e05-4b79-8a48-5f3b8d6e0c27",
    group_name: "УМЦ-112, группа 2",
    scenarios: [scenarios[4]],
    norms: { ack_seconds: 30, fill_seconds: 180 },
    started_at: daysAgoAt(7, 12, 0),
    finished_at: daysAgoAt(7, 14, 30),
    status: "FINISHED",
    participants_count: 7,
  },
  {
    lesson_id: "2f7c9a16-5b38-4e02-9d71-8c6e1a9f3b50",
    name: "Практическое занятие: ДТП и пострадавшие",
    group_id: "7c1e5a93-4d86-4f27-9b35-8e2a6c4f1d90",
    group_name: "УМЦ-112, группа 4",
    scenarios: [scenarios[3], scenarios[4]],
    norms: { ack_seconds: 30, fill_seconds: 180 },
    started_at: daysAgoAt(-1, 10, 0),
    finished_at: null,
    status: "PLANNED",
    participants_count: 6,
  },
];

export const lessonSummaryMocks: LessonSummary[] = [
  {
    lesson_id: demoLessonId,
    attempts_total: 1,
    attempts_passed: 1,
    average_total: 87,
    criteria: {
      C1: { weight: 0.25, value: 1, points: 25 },
      C2: { weight: 0.25, value: 1, points: 25 },
      C3: { weight: 0.15, value: 0.8, points: 12 },
      C4: { weight: 0.15, value: 1, points: 15 },
      C5: { weight: 0.1, value: 0, points: 0 },
      C6: { weight: 0.05, value: 1, points: 5 },
      C7: { weight: 0.05, value: 1, points: 5 },
    },
    error_counts: { critical: 0, significant: 2, minor: 0 },
  },
  {
    lesson_id: "0d5a7e94-3f16-4c80-9b59-6a4c9e7f1d38",
    attempts_total: 1,
    attempts_passed: 0,
    average_total: 62,
    criteria: {
      C1: { weight: 0.2, value: 1, points: 20 },
      C2: { weight: 0.2, value: 1, points: 20 },
      C3: { weight: 0.1, value: 1, points: 10 },
      C4: { weight: 0.1, value: 1, points: 10 },
      C5: { weight: 0.1, value: 0, points: 0 },
      C6: { weight: 0.05, value: 1, points: 5 },
      C7: { weight: 0.25, value: 0.2, points: 5 },
    },
    error_counts: { critical: 1, significant: 2, minor: 0 },
  },
  {
    lesson_id: "1e6b8f05-4a27-4d91-8c60-7b5d0f8a2e49",
    attempts_total: 1,
    attempts_passed: 0,
    average_total: 83,
    criteria: {
      C1: { weight: 0.25, value: 1, points: 25 },
      C2: { weight: 0.25, value: 1, points: 25 },
      C3: { weight: 0.15, value: 1, points: 15 },
      C4: { weight: 0.15, value: 0, points: 0 },
      C5: { weight: 0.1, value: 1, points: 10 },
      C6: { weight: 0.05, value: 0.6, points: 3 },
      C7: { weight: 0.05, value: 1, points: 5 },
    },
    error_counts: { critical: 2, significant: 0, minor: 1 },
  },
];

export const lessonListMocks: LessonListItem[] = lessonMocks.map((lesson) => {
  const summary = lessonSummaryMocks.find((item) => item.lesson_id === lesson.lesson_id);

  return {
    lesson_id: lesson.lesson_id,
    name: lesson.name,
    group_name: lesson.group_name,
    scenarios_count: lesson.scenarios.length,
    attempts_total: summary?.attempts_total ?? (lesson.status === "RUNNING" ? 2 : 0),
    average_total: summary?.average_total ?? null,
    status: lesson.status,
    started_at: lesson.started_at,
  };
});
