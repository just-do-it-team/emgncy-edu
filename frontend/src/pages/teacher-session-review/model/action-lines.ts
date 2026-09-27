import type { ActionEvent, EmergencyService, FieldChange } from "@/shared/api";
import {
  actionTypeLabel,
  callStageLabels,
  cardFieldLabel,
  cardStatusLabel,
  formatJsonValue,
  outgoingCallStageLabels,
  responseStatusLabel,
  serviceLabel,
  sessionStageLabels,
} from "@/entities/expert-review";

export interface ActionLine {
  label: string;
  value: string | null;
}

const STRUCTURED_FIELDS = new Set(["classification", "questionnaire"]);

const unitNounByServiceCode: Record<string, string> = {
  "101": "расчёт",
  "103": "бригада",
};

function unitLabel(
  serviceId: string | null,
  unitNumber: string,
  services: Map<string, EmergencyService> | undefined,
): string {
  const code = serviceId === null ? undefined : services?.get(serviceId)?.code;
  const noun = (code !== undefined ? unitNounByServiceCode[code] : undefined) ?? "подразделение";

  return `${noun} №${unitNumber}`;
}

function changeLine(change: FieldChange): ActionLine {
  return {
    label: cardFieldLabel(change.field),
    value: STRUCTURED_FIELDS.has(change.field) ? "изменена" : formatJsonValue(change.after),
  };
}

function withComment(lines: ActionLine[], comment: string | null): ActionLine[] {
  return comment ? [...lines, { label: "комментарий", value: comment }] : lines;
}

export function actionLines(
  event: ActionEvent,
  services: Map<string, EmergencyService> | undefined,
): ActionLine[] {
  switch (event.kind) {
    case "card_created":
      return [{ label: event.releasedByScenario ? "карточка выпущена сценарием" : "карточка создана", value: null }];
    case "card_updated": {
      const lines = event.changes.map(changeLine);
      const unchanged = event.declaredButUnchanged.map(cardFieldLabel);

      if (unchanged.length > 0) {
        lines.push({ label: "отправлено без изменений", value: unchanged.join(", ") });
      }

      return lines.length > 0 ? lines : [{ label: "карточка сохранена без изменений", value: null }];
    }
    case "classification_updated":
      return [{ label: "классификация", value: event.changes.map((change) => change.field).join(", ") || null }];
    case "card_status_changed":
      return withComment(
        [{ label: "статус карточки", value: event.to ? cardStatusLabel(event.to) : "—" }],
        event.reason,
      );
    case "service_added":
      return [{ label: "добавлена служба", value: serviceLabel(event.serviceId, services) }];
    case "card_opened":
      return [
        {
          label: event.onTime === false ? "карточка раскрыта позже срока" : "карточка раскрыта",
          value: serviceLabel(event.serviceId, services),
        },
      ];
    case "service_decision":
      return withComment(
        [
          {
            label: event.onTime === false ? "решение позже срока" : "решение",
            value: `${event.decision === "ACCEPTED" ? "Принята" : "Не принята"}, ${serviceLabel(event.serviceId, services)}`,
          },
        ],
        event.comment,
      );
    case "service_status_changed":
      return withComment(
        [
          {
            label: "статус",
            value: [
              event.to ? responseStatusLabel(event.to) : "—",
              serviceLabel(event.serviceId, services),
              ...(event.unitNumber ? [unitLabel(event.serviceId, event.unitNumber, services)] : []),
            ].join(", "),
          },
        ],
        event.comment,
      );
    case "deadline_missed":
      return [
        {
          label: event.deadline === "open" ? "просрочено раскрытие" : "просрочено решение",
          value: serviceLabel(event.serviceId, services),
        },
      ];
    case "call":
      return [{ label: callStageLabels[event.stage], value: null }];
    case "outgoing_call":
      return [{ label: outgoingCallStageLabels[event.stage], value: null }];
    case "session":
      return [{ label: sessionStageLabels[event.stage], value: null }];
    case "transcribed":
      return [{ label: "распознана речь", value: null }];
    case "outbound_evaluation":
      return [
        {
          label:
            event.stage === "requested"
              ? "запрошена оценка исходящего звонка"
              : "оценка исходящего звонка",
          value:
            event.stage === "requested" ? null : event.outcome === "SUCCESS" ? "соответствует" : "ниже порога",
        },
      ];
    case "rejected":
      return [
        {
          label: `${actionTypeLabel(event.actionType) ?? event.actionType}: отклонено сервером`,
          value: null,
        },
      ];
    case "unknown":
      return [{ label: actionTypeLabel(event.actionType) ?? event.actionType, value: null }];
  }
}
