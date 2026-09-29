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

export type AbortActor = "participant" | "teacher" | "unknown";

export function abortReasonText(reason: string | null, actor: AbortActor): string {
  if (reason !== null) return abortReasonLabels[reason] ?? "причина прерывания не расшифрована";
  if (actor === "participant") return "обучаемый прервал попытку";
  if (actor === "teacher") return "прервана преподавателем";

  return "Попытка прервана";
}
