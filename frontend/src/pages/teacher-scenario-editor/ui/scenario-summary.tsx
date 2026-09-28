import { Group, Paper, Stack, Text, Title, Tooltip } from "@mantine/core";
import {
  comparisonHints,
  expectedResultBody,
  resolvedScenarioRole,
  scenarioRoleHint,
  scenarioRoleLabels,
  strictnessOf,
  type ExpectedSource,
  type ScenarioDraft,
} from "@/entities/scenario";
import { classificationFor } from "@/features/expected-result-form";
import type { ScenarioTemplate } from "@/shared/api";
import { REACTION_NORMS_TEXT } from "@/shared/config";
import { Fact, tooltipEvents } from "@/shared/ui";
import classes from "./scenario-editor.module.scss";

function expectedSources(draft: ScenarioDraft, templates: Map<string, ScenarioTemplate>): ExpectedSource[] {
  return draft.items.flatMap((item): ExpectedSource[] => {
    if (item.source.kind === "TEMPLATE") {
      const expected = templates.get(item.source.templateId)?.expectedResult;

      return expected ? [{ source: "TEMPLATE", expected }] : [];
    }

    const { expected, variant } = item.source;
    const classification = expected.recordId === null ? null : classificationFor(expected.recordId, expected.flags);

    if (classification === null) return [];

    return [{ source: "INLINE", expected: expectedResultBody(expected, "INLINE", variant === "cardDds", classification) }];
  });
}

interface ScenarioSummaryProps {
  draft: ScenarioDraft;
  templates: Map<string, ScenarioTemplate>;
}

export function ScenarioSummary({ draft, templates }: ScenarioSummaryProps) {
  const strictness = strictnessOf(expectedSources(draft, templates));
  const { role, derived } = resolvedScenarioRole(draft.requiredPositions, {
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
                {role === null ? "—" : `${scenarioRoleLabels[role]}${derived ? " (по составу)" : ""}`}
              </span>
            </Tooltip>
          </Fact>
          {cards + (draft.procedural.enabled ? draft.procedural.targetCount : 0) > 0 && (
            <Fact label="Нормативы реакции на карточку">{REACTION_NORMS_TEXT}</Fact>
          )}
        </Group>
        <Group gap="xl" align="flex-start" wrap="wrap">
          <Fact label="Строго">{strictness.strict}</Fact>
          <Fact label="Без учёта регистра и пунктуации">
            <Tooltip label={comparisonHints.normalized} events={tooltipEvents} multiline w={320} color="povDark.6" radius={0}>
              <span tabIndex={0} className={classes.focusable}>
                {strictness.normalized}
              </span>
            </Tooltip>
          </Fact>
          <Fact label="Не оценивается">
            <Tooltip label={comparisonHints.not_scored} events={tooltipEvents} multiline w={320} color="povDark.6" radius={0}>
              <span tabIndex={0} className={classes.focusable}>
                {strictness.notScored}
              </span>
            </Tooltip>
          </Fact>
          <Fact label="Не проверяется">{strictness.notChecked}</Fact>
          <Fact label="Должно быть пустым">{strictness.mustBeEmpty}</Fact>
        </Group>
        {skipped > 0 && (
          <Text size="xs" c="povDark2.6">
            Не учтено в подсчёте полей: {skipped} — у элемента не выбран тип происшествия или шаблон не найден.
          </Text>
        )}
        {strictness.notScored > 0 && (
          <Text size="xs" c="povDark2.6">
            Описание карточки и комментарии к статусам ДДС сервер не оценивает: они хранятся для экспертной оценки.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
