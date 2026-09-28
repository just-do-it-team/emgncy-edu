import type { ParticipantPosition, ScenarioGenerationRequestDto, ScenarioWorkspaceMode } from "@/shared/api";

export type GenerationAudience = "OPERATOR_112" | "DDS" | "SHARED";

export const AI_DIFFICULTY = "ai";

export interface GenerationParams {
  group: string | null;
  recordId: number | null;
  audience: GenerationAudience;
  dispatcherCode: string | null;
  sharedCodes: string[];
  sharedWithOperator: boolean;
  difficulty: string;
  itemCount: number;
  notes: string;
}

export const MIN_ITEMS = 1;
export const MAX_ITEMS = 10;
export const MAX_NOTES_LENGTH = 1000;

export const emptyGenerationParams: GenerationParams = {
  group: null,
  recordId: null,
  audience: "OPERATOR_112",
  dispatcherCode: null,
  sharedCodes: [],
  sharedWithOperator: true,
  difficulty: AI_DIFFICULTY,
  itemCount: 3,
  notes: "",
};

function positionsOf(params: GenerationParams): ParticipantPosition[] {
  if (params.audience === "OPERATOR_112") return [null];
  if (params.audience === "DDS") return params.dispatcherCode === null ? [] : [params.dispatcherCode];

  return [...(params.sharedWithOperator ? [null] : []), ...params.sharedCodes];
}

function workspaceOf(audience: GenerationAudience): ScenarioWorkspaceMode {
  return audience === "SHARED" ? "SHARED" : "INDIVIDUAL";
}

export function generationRequestBody(
  params: GenerationParams,
  teacherId: string,
  requestId: string,
): ScenarioGenerationRequestDto {
  const notes = params.notes.trim();

  return {
    teacher_id: teacherId,
    classification_group: params.group ?? "",
    record_id: params.recordId,
    difficulty: params.difficulty === AI_DIFFICULTY ? null : Number(params.difficulty),
    workspace_mode: workspaceOf(params.audience),
    required_participant_positions: positionsOf(params),
    item_count: params.itemCount,
    notes: notes === "" ? null : notes,
    request_id: requestId,
  };
}

export type GenerationParamsErrors = Partial<Record<"group" | "dispatcherCode" | "sharedCodes" | "itemCount" | "notes", string>>;

export function validateGenerationParams(params: GenerationParams): GenerationParamsErrors {
  const errors: GenerationParamsErrors = {};

  if (params.group === null) errors.group = "Выберите хотя бы группу происшествий";
  if (params.audience === "DDS" && params.dispatcherCode === null) errors.dispatcherCode = "Выберите службу диспетчера";
  if (params.audience === "SHARED" && params.sharedCodes.length + (params.sharedWithOperator ? 1 : 0) < 2) {
    errors.sharedCodes = "На общем рабочем месте нужны хотя бы две позиции";
  }
  if (!Number.isInteger(params.itemCount) || params.itemCount < MIN_ITEMS || params.itemCount > MAX_ITEMS) {
    errors.itemCount = `От ${MIN_ITEMS} до ${MAX_ITEMS} элементов`;
  }
  if (params.notes.trim().length > MAX_NOTES_LENGTH) errors.notes = `Не длиннее ${MAX_NOTES_LENGTH} символов`;

  return errors;
}

export type GenerationFailure = "cancelled" | "unavailable" | "rejected" | "failed";

const UNAVAILABLE_STATUSES = new Set([404, 405, 501, 502, 503, 504]);
const REJECTED_STATUSES = new Set([400, 409, 422]);

export function generationFailure(status: number | undefined, aborted: boolean): GenerationFailure {
  if (aborted) return "cancelled";
  if (status === undefined || UNAVAILABLE_STATUSES.has(status)) return "unavailable";
  if (REJECTED_STATUSES.has(status)) return "rejected";

  return "failed";
}

export const generationFailureText: Record<Exclude<GenerationFailure, "cancelled">, string> = {
  unavailable: "Генерация недоступна: сервис ИИ не подключён. Соберите сценарий из шаблонов.",
  rejected: "Сервис ИИ не принял параметры. Уточните тип происшествия или особенности и повторите.",
  failed: "Сервис ИИ вернул ошибку. Повторите попытку или соберите сценарий из шаблонов.",
};
