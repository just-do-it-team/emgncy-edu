import type {
  ProceduralGeneration,
  ScenarioCompletionPolicy,
  ScenarioItem,
  ScenarioItemType,
  ScenarioMode,
  ScenarioStatus,
  ScenarioWorkspaceMode,
} from "@/shared/api";
import type { ScenarioRole } from "./scenario-role";

export const scenarioStatusLabels: Record<ScenarioStatus, string> = {
  DRAFT: "Черновик",
  PUBLISHED: "Утверждён",
  ARCHIVED: "Архив",
};

export const scenarioRoleLabels: Record<ScenarioRole, string> = {
  OPERATOR_112: "112",
  DDS: "ДДС",
  MIXED: "Смешанный",
};

export const scenarioRoleHint =
  "Роль задают обязательные позиции сценария. Если их нет, роль определена по составу: звонки — работа оператора 112, карточки — диспетчера ДДС";

const pluralRules = new Intl.PluralRules("ru");

const cardForms: Partial<Record<Intl.LDMLPluralRule, string>> = {
  one: "карточка",
  few: "карточки",
  many: "карточек",
};

export function cardsPhrase(count: number): string {
  return `${count} ${cardForms[pluralRules.select(count)] ?? "карточки"}`;
}

export function proceduralPoolText(generation: ProceduralGeneration, difficulty: number): string {
  const source =
    generation.templateIds !== null
      ? `выбранных шаблонов: ${generation.templateIds.length}`
      : generation.classificationGroupCodes !== null
        ? `шаблонов групп классификатора ${generation.classificationGroupCodes.join(", ")}`
        : "всех активных шаблонов карточек";

  return `${cardsPhrase(generation.targetCount)} из пула ${source}, сложностью не выше ${difficulty}. Какие именно — определяется при старте попытки.`;
}

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

export const cardSourceTypeLabels: Record<string, string> = {
  CALL: "Звонок",
  SMS: "СМС",
  VIS: "ВИС",
  ERA_GLONASS: "ЭРА-ГЛОНАСС",
  REGIONAL_112: "Система 112 другого региона",
  MANUAL: "Введена вручную",
};

const unitNouns: Record<string, string> = {
  "101": "Номер расчёта",
  "103": "Номер бригады",
};

export function unitNumberLabel(serviceCode: string): string {
  return unitNouns[serviceCode] ?? "Номер подразделения";
}
