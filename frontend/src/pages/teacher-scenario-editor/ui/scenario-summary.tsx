import { Group, Paper, Stack, Text, Title, Tooltip } from "@mantine/core";
import {
  expectedResultBody,
  scenarioRole,
  scenarioRoleHint,
  scenarioRoleLabels,
  strictnessOf,
  type ExpectedSource,
  type ScenarioDraft,
} from "@/entities/scenario";
import { classificationFor } from "@/features/expected-result-form";
import type { JsonObject, JsonValue, ScenarioTemplate } from "@/shared/api";
import { Fact, tooltipEvents } from "@/shared/ui";
import classes from "./scenario-editor.module.scss";

const SECONDS_IN_MINUTE = 60;

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectedSources(draft: ScenarioDraft, templates: Map<string, ScenarioTemplate>): ExpectedSource[] {
  return draft.items.flatMap((item): ExpectedSource[] => {
    if (item.source.kind === "TEMPLATE") {
      const card = templates.get(item.source.templateId)?.expectedResult.card;

      return isObject(card) ? [{ source: "TEMPLATE", card }] : [];
    }

    const { expected, variant } = item.source;
    const classification = expected.recordId === null ? null : classificationFor(expected.recordId, expected.flags);

    if (classification === null) return [];

    const card = expectedResultBody(expected, "INLINE", variant === "cardDds", classification).card;

    return isObject(card) ? [{ source: "INLINE", card }] : [];
  });
}

interface ScenarioSummaryProps {
  draft: ScenarioDraft;
  templates: Map<string, ScenarioTemplate>;
  durationSeconds: number;
}

export function ScenarioSummary({ draft, templates, durationSeconds }: ScenarioSummaryProps) {
  const strictness = strictnessOf(expectedSources(draft, templates));
  const role = scenarioRole({
    itemTypes: draft.items.map((item) => item.itemType),
    procedural: draft.procedural.enabled,
  });
  const calls = draft.items.filter((item) => item.itemType === "INCOMING_CALL").length;
  const cards = draft.items.length - calls;
  const skipped = draft.items.length - strictness.elements;

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Title order={3} size="h5" fw={600}>
          Сводка
        </Title>
        <Group gap="xl" align="flex-start" wrap="wrap">
          <Fact label="Звонков">{calls}</Fact>
          <Fact label="Карточек">{cards}</Fact>
          <Fact label="Процедурно">{draft.procedural.enabled ? draft.procedural.targetCount : "—"}</Fact>
          <Fact label="Роль">
            <Tooltip label={scenarioRoleHint} events={tooltipEvents} multiline w={260} color="povDark.6" radius={0}>
              <span tabIndex={0} className={classes.focusable}>
                {role === null ? "—" : scenarioRoleLabels[role]}
              </span>
            </Tooltip>
          </Fact>
          <Fact label="Длительность по нормативам">{`${durationSeconds / SECONDS_IN_MINUTE} мин`}</Fact>
        </Group>
        <Group gap="xl" align="flex-start" wrap="wrap">
          <Fact label="Поля проверяются">{strictness.checked}</Fact>
          <Fact label="Из них посимвольно">{strictness.literal}</Fact>
          <Fact label="Не проверяются">{strictness.notChecked}</Fact>
          <Fact label="Должны быть пустыми">{strictness.mustBeEmpty}</Fact>
        </Group>
        {skipped > 0 && (
          <Text size="xs" c="povDark2.6">
            Не учтено в подсчёте полей: {skipped} — у элемента не выбран тип происшествия или шаблон не найден.
          </Text>
        )}
        {strictness.literal > 0 && (
          <Text size="xs" c="povDark2.6">
            Посимвольно сравниваются ФИО и адреса: лишний пробел или другой регистр — расхождение.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
