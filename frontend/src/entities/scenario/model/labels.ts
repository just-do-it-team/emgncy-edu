import type {
  ScenarioCompletionPolicy,
  ScenarioItem,
  ScenarioItemType,
  ScenarioMode,
  ScenarioStatus,
  ScenarioWorkspaceMode,
} from "@/shared/api";

export const scenarioStatusLabels: Record<ScenarioStatus, string> = {
  DRAFT: "Черновик",
  PUBLISHED: "Опубликован",
  ARCHIVED: "В архиве",
};

export const workspaceModeLabels: Record<ScenarioWorkspaceMode, string> = {
  INDIVIDUAL: "индивидуальный",
  SHARED: "общий",
};

export const workspaceLabels: Record<ScenarioWorkspaceMode, string> = {
  INDIVIDUAL: "индивидуальное",
  SHARED: "общее на всех участников",
};

export const scenarioModeLabels: Record<ScenarioMode, string> = {
  STATIC: "статический",
  PROCEDURAL: "процедурный",
  HYBRID: "статический с процедурной подачей",
};

export const completionPolicyLabels: Record<ScenarioCompletionPolicy, string> = {
  STUDENT_CONFIRM: "обучаемый завершает сам, когда все карточки и звонки обработаны",
  AUTO_WHEN_READY: "завершается автоматически, когда все карточки и звонки обработаны",
  TEACHER_ONLY: "завершает преподаватель",
};

export const scenarioItemTypeLabels: Record<ScenarioItemType, string> = {
  INCOMING_CALL: "Звонок",
  INCIDENT_CARD: "Карточка",
};

export function scenarioItemLabels(items: ScenarioItem[]): string[] {
  const counters = new Map<ScenarioItemType, number>();

  return items.map((item) => {
    const index = (counters.get(item.itemType) ?? 0) + 1;
    counters.set(item.itemType, index);

    return `${scenarioItemTypeLabels[item.itemType]} ${index}`;
  });
}
