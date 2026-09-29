import type { ExpertReviewContext, JsonObject, JsonValue } from "@/shared/api";

export interface TypedText {
  label: string;
  text: string;
}

const CARD_TEXT_FIELDS: [string, string][] = [
  ["description", "описание"],
  ["incident_address", "адрес"],
  ["reported_address", "адрес со слов заявителя"],
];

function textOf(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Текст, который обучаемый ввёл сам: описание и адрес карточки, созданной из его звонка, и
 * комментарии к решениям и статусам ДДС. Поля карточек, выпущенных сценарием, не берутся — их
 * заполнил автор эталона, а не обучаемый. В общей попытке комментарии фильтруются по участнику.
 */
export function typedTexts(context: ExpertReviewContext, participantId: string | null): TypedText[] {
  const callOperators = new Map(
    context.actions.flatMap((action) =>
      action.kind === "call" && action.stage === "answered" && action.entityId !== null
        ? [[action.entityId, action.actorUserId] as const]
        : [],
    ),
  );
  const calls = context.incomingCalls
    .filter((call) => participantId === null || callOperators.get(call.trainingCallId) === participantId)
    .flatMap((call, index) =>
      CARD_TEXT_FIELDS.flatMap(([field, label]) => {
        const text = textOf(call.currentState?.[field]);

        return text === null ? [] : [{ label: `Звонок ${index + 1}: ${label}`, text }];
      }),
    );
  const comments = context.actions.flatMap((action) =>
    (action.kind === "service_decision" || action.kind === "service_status_changed") &&
    action.comment !== null &&
    action.comment.trim() !== "" &&
    (participantId === null || action.actorUserId === participantId)
      ? [{ label: "Комментарий ДДС", text: action.comment }]
      : [],
  );

  return [...calls, ...comments];
}

/** Тексты эталона: их слова считаются верными, чтобы названия из сценария не попадали в ошибки. */
export function referenceTexts(context: ExpertReviewContext): string[] {
  return [...context.incomingCalls, ...context.cards].flatMap((element) => {
    const card = isObject(element.expectedResult.card) ? element.expectedResult.card : null;
    const classification = isObject(card?.classification) ? card.classification : null;

    return [
      ...CARD_TEXT_FIELDS.flatMap(([field]) => textOf(card?.[field]) ?? []),
      textOf(classification?.final_incident_type) ?? [],
    ].flat();
  });
}
