import type { CallSpeaker } from "@/shared/api";

export const speakerLabels: Record<CallSpeaker, string> = {
  CALLER: "ЗАЯВИТЕЛЬ",
  OPERATOR: "ОПЕРАТОР",
  RESPONSE_LEAD: "РУКОВОДИТЕЛЬ БРИГАДЫ",
};

export const significanceLabels = {
  high: "высокая значимость",
  medium: "средняя значимость",
  low: "низкая значимость",
} as const;

const abortReasonLabels: Record<string, string> = {
  PRESENCE_TIMEOUT: "обучаемый потерял связь с тренажёром, попытка прервана автоматически",
};

export function abortReasonText(reason: string | null): string {
  if (reason === null) return "прервана преподавателем";

  return abortReasonLabels[reason] ?? `причина от сервера без расшифровки: ${reason}`;
}
