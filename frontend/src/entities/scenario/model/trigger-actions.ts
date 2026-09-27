import type { ScenarioItemType } from "@/shared/api";

export interface TriggerAction {
  code: string;
  label: string;
}

export const triggerActions: Record<ScenarioItemType, TriggerAction[]> = {
  INCOMING_CALL: [
    { code: "INCOMING_CALL_ANSWERED", label: "Вызов принят" },
    { code: "INCIDENT_CARD_CREATED_FROM_CALL", label: "Карточка создана из вызова" },
    { code: "INCOMING_CALL_COMPLETED", label: "Вызов завершён" },
  ],
  INCIDENT_CARD: [
    { code: "CARD_OPENED", label: "Карточка раскрыта службой" },
    { code: "CARD_ACCEPTED", label: "Карточка принята службой" },
    { code: "CARD_REJECTED", label: "Карточка отклонена службой" },
    { code: "SERVICE_STATUS_CHANGED", label: "Смена статуса реагирования" },
    { code: "OUTGOING_CALL_COMPLETED", label: "Исходящий звонок завершён" },
    { code: "CARD_UPDATED", label: "Карточка изменена" },
    { code: "CARD_STATUS_CHANGED", label: "Смена статуса карточки" },
  ],
};

const dispatcherSilentActions = new Set(["CARD_UPDATED", "CARD_STATUS_CHANGED"]);

export function isDispatcherSilentAction(code: string): boolean {
  return dispatcherSilentActions.has(code);
}

export function isKnownTriggerAction(sourceType: ScenarioItemType, code: string): boolean {
  return triggerActions[sourceType].some((action) => action.code === code);
}
