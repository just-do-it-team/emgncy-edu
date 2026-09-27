const callActionLabels = {
  INCOMING_CALL_RINGING: "входящий вызов",
  INCOMING_CALL_ANSWERED: "вызов принят",
  INCIDENT_CARD_CREATED_FROM_CALL: "карточка создана из вызова",
  INCOMING_CALL_COMPLETED: "вызов завершён",
} as const;

const outgoingCallActionLabels = {
  OUTGOING_CALL_STARTED: "начат исходящий звонок",
  OUTGOING_CALL_COMPLETED: "исходящий звонок завершён",
} as const;

const sessionActionLabels = {
  SESSION_STARTED: "попытка начата",
  SESSION_COMPLETED: "попытка завершена",
  SESSION_ABORTED: "попытка прервана",
  EXPERT_ASSESSMENT_UPDATED: "сохранена оценка преподавателя",
} as const;

const actionTypeLabels: Record<string, string> = {
  CARD_CREATED: "создание карточки",
  CARD_RELEASED: "выпуск карточки",
  CARD_UPDATED: "изменение карточки",
  CARD_FEATURES_UPDATED: "изменение классификации",
  CARD_STATUS_CHANGED: "смена статуса карточки",
  CARD_SERVICE_ADDED: "добавление службы",
  CARD_OPENED: "раскрытие карточки",
  CARD_ACCEPTED: "принятие карточки",
  CARD_REJECTED: "отклонение карточки",
  SERVICE_STATUS_CHANGED: "смена статуса реагирования",
  ...callActionLabels,
  ...outgoingCallActionLabels,
  ...sessionActionLabels,
};

export const callStageLabels = {
  ringing: callActionLabels.INCOMING_CALL_RINGING,
  answered: callActionLabels.INCOMING_CALL_ANSWERED,
  card_linked: callActionLabels.INCIDENT_CARD_CREATED_FROM_CALL,
  completed: callActionLabels.INCOMING_CALL_COMPLETED,
} as const;

export const outgoingCallStageLabels = {
  started: outgoingCallActionLabels.OUTGOING_CALL_STARTED,
  completed: outgoingCallActionLabels.OUTGOING_CALL_COMPLETED,
} as const;

export const sessionStageLabels = {
  started: sessionActionLabels.SESSION_STARTED,
  completed: sessionActionLabels.SESSION_COMPLETED,
  aborted: sessionActionLabels.SESSION_ABORTED,
  expert_assessment: sessionActionLabels.EXPERT_ASSESSMENT_UPDATED,
} as const;

export function actionTypeLabel(actionType: string): string | null {
  return actionTypeLabels[actionType] ?? null;
}
