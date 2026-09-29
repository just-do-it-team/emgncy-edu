import type { ScenarioTemplate, TemplateCreateRequest, TemplateReviewDecision, TemplateUpdateRequest } from "@/shared/api";

export type ReviewSection =
  | "classification"
  | "incident_details"
  | "contacts"
  | "routing"
  | "response_statuses"
  | "outbound_call";

export type SectionState = TemplateReviewDecision | "AI_PROPOSED";

const cardSections: ReviewSection[] = ["classification", "incident_details", "routing", "response_statuses", "outbound_call"];
const callSections: ReviewSection[] = ["classification", "incident_details", "contacts", "routing"];

export const reviewSectionLabels: Record<ReviewSection, string> = {
  classification: "Классификация",
  incident_details: "Описание, адрес, пострадавшие",
  contacts: "Заявитель и телефоны",
  routing: "Службы",
  response_statuses: "Статусы реагирования",
  outbound_call: "Исходящий звонок",
};

export const sectionStateLabels: Record<SectionState, string> = {
  AI_PROPOSED: "не проверено",
  CONFIRMED: "подтверждено",
  EDITED: "исправлено",
  REJECTED: "отклонено — нужно исправить",
};

const DONE: ReadonlySet<SectionState> = new Set(["CONFIRMED", "EDITED"]);

function isSectionState(value: string | undefined): value is SectionState {
  return value === "AI_PROPOSED" || value === "CONFIRMED" || value === "EDITED" || value === "REJECTED";
}

export function reviewSectionsOf(template: ScenarioTemplate): ReviewSection[] {
  return template.kind === "call" ? callSections : cardSections;
}

export function sectionState(template: ScenarioTemplate, section: ReviewSection): SectionState {
  const value = template.aiReviewState?.[section];

  return isSectionState(value) ? value : "AI_PROPOSED";
}

export interface TemplateReviewProgress {
  done: number;
  total: number;
  pending: ReviewSection[];
  rejected: ReviewSection[];
}

/**
 * Прогресс проверки черновика ИИ. Готовой секция считается, когда она подтверждена или исправлена:
 * то же правило сервер применяет при публикации. Отклонённая секция не готова — её нужно
 * исправить в редакторе.
 */
export function templateReviewProgress(template: ScenarioTemplate): TemplateReviewProgress {
  const sections = reviewSectionsOf(template);
  const states = sections.map((section) => [section, sectionState(template, section)] as const);

  return {
    done: states.filter(([, state]) => DONE.has(state)).length,
    total: sections.length,
    pending: states.filter(([, state]) => !DONE.has(state)).map(([section]) => section),
    rejected: states.filter(([, state]) => state === "REJECTED").map(([section]) => section),
  };
}

export function publishBlock(template: ScenarioTemplate): string | null {
  if (!template.generatedByAi || template.status !== "DRAFT") return null;

  const progress = templateReviewProgress(template);

  if (progress.pending.length === 0) return null;

  const rejected = progress.rejected.map((section) => reviewSectionLabels[section]);

  return [
    `Проверено ${progress.done} из ${progress.total}.`,
    `Осталось: ${progress.pending.map((section) => reviewSectionLabels[section]).join(", ")}.`,
    rejected.length > 0 ? `Отклонённые секции исправьте в редакторе черновика: ${rejected.join(", ")}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function isReviewSection(value: string): value is ReviewSection {
  return value in reviewSectionLabels;
}

/**
 * Тело PATCH черновика. Секции помечаются исправленными только те, которые преподаватель явно
 * открыл на исправление: автоматическое сравнение содержимого могло бы засчитать непроверенную
 * секцию из-за разницы в представлении JSON.
 */
export function draftUpdateRequest(
  templateId: string,
  create: TemplateCreateRequest,
  userId: string,
  editedSections: ReviewSection[],
): TemplateUpdateRequest {
  const decisions = Object.fromEntries(editedSections.map((section) => [section, "EDITED" as const]));
  const { name, description, difficulty, expected_result: expectedResult } = create.body;
  const content = { name, description, difficulty, expected_result: expectedResult };
  const meta = { updated_by: userId, review_decisions: decisions, status: null };

  return create.kind === "call"
    ? { kind: "call", templateId, body: { ...meta, ...content, initial_call: create.body.initial_call } }
    : { kind: "card", templateId, body: { ...meta, ...content, initial_card: create.body.initial_card } };
}
