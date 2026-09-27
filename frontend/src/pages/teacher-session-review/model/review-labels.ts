import type { CallSpeaker } from "@/shared/api";

export const speakerLabels: Record<CallSpeaker, string> = {
  CALLER: "ЗАЯВИТЕЛЬ",
  OPERATOR: "ОПЕРАТОР",
  RESPONSE_LEAD: "БРИГАДА",
};

export const significanceLabels = {
  high: "высокая значимость",
  medium: "средняя значимость",
  low: "низкая значимость",
} as const;
