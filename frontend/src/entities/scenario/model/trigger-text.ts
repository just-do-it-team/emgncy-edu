import type { ScenarioTrigger } from "@/shared/api";

function afterDelay(seconds: number): string {
  return seconds > 0 ? `через ${seconds} с` : "сразу";
}

export function triggerText(
  trigger: ScenarioTrigger | null,
  itemLabel: (key: string) => string,
  actionLabel: (actionType: string) => string | null,
): string {
  if (trigger === null) return "условие подачи не задано";
  if (trigger.type === "TIME_OFFSET") return afterDelay(trigger.offsetSeconds);

  const action = actionLabel(trigger.actionType) ?? `${trigger.actionType} (названия нет)`;

  return `после действия «${action}» по элементу «${itemLabel(trigger.itemKey)}», ${afterDelay(trigger.delaySeconds)}`;
}
