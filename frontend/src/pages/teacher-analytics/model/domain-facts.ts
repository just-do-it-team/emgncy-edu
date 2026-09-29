import type { ActionEvent, JsonObject, JsonValue, ReviewCall } from "@/shared/api";
import type { AddressMismatch, DispatchStage, ServiceCheck, StageTime } from "./student-stats.ts";

const REPORTED_ADDRESS = "card.reported_address";

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function codes(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function expectedCard(call: Pick<ReviewCall, "expectedResult">): JsonObject {
  return isObject(call.expectedResult.card) ? call.expectedResult.card : {};
}

/**
 * Адрес со слов заявителя в звонках оператора 112. Проверка есть там, где эталон задаёт адрес;
 * ошибка — расхождение сервера по этому полю. Адрес места происшествия не берётся: оператор его
 * уточняет по ориентирам, и он может законно отличаться от эталона.
 */
export function addressFacts(
  calls: Pick<ReviewCall, "expectedResult" | "automaticResult">[],
): { checks: number; mismatches: AddressMismatch[] } {
  const checked = calls.filter((call) => text(expectedCard(call).reported_address) !== null);
  const mismatches = checked.flatMap((call) =>
    (call.automaticResult?.discrepancies ?? []).flatMap((discrepancy) =>
      discrepancy.path === REPORTED_ADDRESS
        ? [{ expected: text(discrepancy.expected) ?? "—", actual: text(discrepancy.actual) ?? "не указан" }]
        : [],
    ),
  );

  return { checks: checked.length, mismatches };
}

/** Каждая служба эталона в каждом звонке: оповещена ли она в итоговой карточке оператора. */
export function serviceFacts(calls: Pick<ReviewCall, "expectedResult" | "currentState">[]): ServiceCheck[] {
  return calls.flatMap((call) => {
    if (call.currentState === null) return [];

    const card = expectedCard(call);
    const classification = isObject(card.classification) ? card.classification : {};
    const incidentType = text(classification.final_incident_type) ?? "тип не задан";
    const notified = new Set(codes(call.currentState.services));

    return codes(card.services).map((serviceCode) => ({ incidentType, serviceCode, missed: !notified.has(serviceCode) }));
  });
}

const stageOfStatus: Record<string, DispatchStage> = {
  RESPONSE_STARTED: "responseStarted",
  ARRIVED: "arrived",
  WORK_COMPLETED: "completed",
};

/**
 * Время этапов по карточкам ДДС от статуса «Получена службой». Сервер ставит его, когда диспетчер
 * раскрывает карточку, поэтому отсчёт идёт от первого раскрытия участником; дальше — первое
 * решение «Принята» и первые переходы в «Начало реагирования», «Прибытие», «Работы завершены».
 */
export function stageFacts(actions: ActionEvent[], userId: string): StageTime[] {
  const own = actions.filter((action) => action.actorUserId === userId && action.incidentCardId !== null);
  const cards = new Set(own.map((action) => action.incidentCardId));

  return [...cards].flatMap((cardId) => {
    const onCard = own
      .filter((action) => action.incidentCardId === cardId)
      .sort((first, second) => Date.parse(first.occurredAt) - Date.parse(second.occurredAt));
    const opened = onCard.find((action) => action.kind === "card_opened");

    if (opened === undefined) return [];

    const start = Date.parse(opened.occurredAt);
    const reached = new Map<DispatchStage, number>();

    for (const action of onCard) {
      const stage =
        action.kind === "service_decision" && action.decision === "ACCEPTED"
          ? "accepted"
          : action.kind === "service_status_changed" && action.to !== null
            ? stageOfStatus[action.to]
            : undefined;

      if (stage !== undefined && !reached.has(stage)) reached.set(stage, Date.parse(action.occurredAt) - start);
    }

    return [...reached].map(([stage, ms]) => ({ stage, ms }));
  });
}
