import type { Discrepancy, JsonValue, ParticipantRole } from "@/shared/api";
import type { CriterionCode } from "@/shared/config";

export type Significance = "high" | "medium" | "low";

export interface ReviewFinding {
  path: string;
  expected: JsonValue;
  actual: JsonValue;
  reason: string;
  significance: Significance;
  formattingOnly: boolean;
}

export interface ReviewNote {
  path: string;
  expected: JsonValue;
  actual: JsonValue;
  reason: string;
  explanation: string;
}

export type CriterionReview =
  | { code: CriterionCode; applicable: true; findings: ReviewFinding[] }
  | { code: CriterionCode; applicable: false };

export interface ReviewBreakdown {
  criteria: CriterionReview[];
  notes: ReviewNote[];
  literalComments: ReviewFinding[];
  modelEvaluation: ReviewFinding[];
  outsideRole: ReviewFinding[];
  unclassified: ReviewFinding[];
}

type ReviewGroup = CriterionCode | "literal_comment" | "model_evaluation";

export const reviewCriterionCodes: CriterionCode[] = ["C1", "C2", "C3", "C4", "C5", "C6", "C7"];

export const roleCriteria: Record<ParticipantRole, ReadonlySet<CriterionCode>> = {
  OPERATOR_112: new Set(["C1", "C2", "C3", "C4"]),
  DDS: new Set(["C2", "C3", "C5", "C7"]),
};

export const reviewNotices = {
  unscoredCriterion:
    "C6 «Грамматика» не оценивается: на сервере нет ни автоматической проверки, ни путей расхождений для неё.",
  incidentAddress:
    "Адрес происшествия оператор уточняет по карте и ориентирам, он может законно отличаться от эталона. В C4 учитывается только адрес со слов заявителя, это расхождение — сведение, а не ошибка.",
  automaticPhoneNumber:
    "Номер АОН определяется автоматически, обучаемый его не вводит. Расхождение — сведение, а не ошибка обучаемого.",
  notApplicable: "не оценивается в этом занятии",
  unscoredDescription:
    "С 28 сентября 2026 года сервер не оценивает описание карточки. Расхождение осталось от оценки по прежним правилам и учтено в балле этой попытки; для новых попыток оно не появится.",
  literalComments:
    "С 28 сентября 2026 года сервер не оценивает комментарии к статусам ДДС, они хранятся для экспертной оценки. Расхождения ниже остались от оценки по прежним правилам, когда комментарии сравнивались буквально, и учтены в балле этой попытки.",
  modelEvaluation:
    "Исходящий звонок оценивает модель по смысловому сходству, а не прямым сравнением с эталоном. Вывод не подтверждён, пока его не проверил преподаватель.",
  formattingOnly: "отличается только оформлением",
  significance:
    "Значимость — трактовка тренажёра для разбора: на балл и на зачёт она не влияет.",
} as const;

const SERVICE_HISTORY_COMMENT = /^service_status_history\.[^.]+\.\d+\.comment$/;
const SERVICE_HISTORY_STATUS = /^service_status_history\.[^.]+\.(length|\d+\.status)$/;
const HANDLING_DEADLINE = /^service_handling\.[^.]+\.(open_deadline|decision_deadline)$/;
const HANDLING_DECISION = /^service_handling\.[^.]+\.decision$/;
const HANDLING_STATUS = /^service_handling\.[^.]+\.(opened_at|decision)$/;

const COMPLETENESS_PATHS = new Set([
  "card.applicant_full_name",
  "card.provided_phone_number",
  "card.location_phone_number",
  "card.questionnaire",
  "card.questionnaire.questions",
  "card.questionnaire.answers",
  "card.victims_count",
]);

const NOTE_EXPLANATIONS = new Map([
  ["card.incident_address", reviewNotices.incidentAddress],
  ["card.automatic_phone_number", reviewNotices.automaticPhoneNumber],
  ["card.description", reviewNotices.unscoredDescription],
]);


const FREE_TEXT_PATHS = new Set([
  "card.applicant_full_name",
  "card.reported_address",
  "card.incident_address",
]);

function groupOf(path: string): ReviewGroup | null {
  if (path === "expected_result.outbound_call") return "model_evaluation";
  if (SERVICE_HISTORY_COMMENT.test(path)) return "literal_comment";
  if (path === "card.classification" || path.startsWith("card.classification.")) return "C1";
  if (path === "card.services") return "C2";
  if (COMPLETENESS_PATHS.has(path)) return "C3";
  if (path === "card.reported_address") return "C4";
  if (HANDLING_DEADLINE.test(path)) return "C5";
  if (
    path === "card.current_status" ||
    path.startsWith("card.service_statuses.") ||
    SERVICE_HISTORY_STATUS.test(path) ||
    HANDLING_STATUS.test(path)
  ) {
    return "C7";
  }

  return null;
}

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase("ru")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isFormattingOnly({ path, expected, actual }: Discrepancy): boolean {
  if (!FREE_TEXT_PATHS.has(path) && !SERVICE_HISTORY_COMMENT.test(path)) return false;
  if (typeof expected !== "string" || typeof actual !== "string") return false;

  return normalizeText(expected) === normalizeText(actual);
}

function isHighSignificance(path: string): boolean {
  return (
    path === "card.reported_address" ||
    path === "card.services" ||
    path === "card.classification" ||
    path.startsWith("card.classification.") ||
    HANDLING_DEADLINE.test(path) ||
    HANDLING_DECISION.test(path)
  );
}

function toFinding(discrepancy: Discrepancy): ReviewFinding {
  const formattingOnly = isFormattingOnly(discrepancy);
  const significance: Significance = formattingOnly
    ? "low"
    : isHighSignificance(discrepancy.path)
      ? "high"
      : "medium";

  return { ...discrepancy, significance, formattingOnly };
}

export function buildReviewBreakdown(
  discrepancies: Discrepancy[],
  role: ParticipantRole,
): ReviewBreakdown {
  const applicable = roleCriteria[role];
  const byCriterion: Record<CriterionCode, ReviewFinding[]> = {
    C1: [],
    C2: [],
    C3: [],
    C4: [],
    C5: [],
    C6: [],
    C7: [],
  };
  const notes: ReviewNote[] = [];
  const literalComments: ReviewFinding[] = [];
  const modelEvaluation: ReviewFinding[] = [];
  const outsideRole: ReviewFinding[] = [];
  const unclassified: ReviewFinding[] = [];

  for (const discrepancy of discrepancies) {
    const explanation = NOTE_EXPLANATIONS.get(discrepancy.path);
    const group = groupOf(discrepancy.path);

    if (explanation !== undefined) {
      notes.push({ ...discrepancy, explanation });
    } else if (group === "literal_comment") {
      literalComments.push(toFinding(discrepancy));
    } else if (group === "model_evaluation") {
      modelEvaluation.push(toFinding(discrepancy));
    } else if (group === null) {
      unclassified.push(toFinding(discrepancy));
    } else if (applicable.has(group)) {
      byCriterion[group].push(toFinding(discrepancy));
    } else {
      outsideRole.push(toFinding(discrepancy));
    }
  }

  return {
    criteria: reviewCriterionCodes.map((code) =>
      applicable.has(code)
        ? { code, applicable: true, findings: byCriterion[code] }
        : { code, applicable: false },
    ),
    notes,
    literalComments,
    modelEvaluation,
    outsideRole,
    unclassified,
  };
}
