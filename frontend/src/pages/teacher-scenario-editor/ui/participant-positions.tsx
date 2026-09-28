import { Group, MultiSelect, Select, Stack, Switch, Text } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { suggestedPositions, type ScenarioDraft } from "@/entities/scenario";
import type { ServiceOption } from "@/features/expected-result-form";
import type { ParticipantPosition, ScenarioTemplate } from "@/shared/api";
import { Button } from "@/shared/ui";

const OPERATOR = "operator";

function toOption(position: ParticipantPosition): string {
  return position ?? OPERATOR;
}

function fromOption(value: string): ParticipantPosition {
  return value === OPERATOR ? null : value;
}

function mainServicesOf(draft: ScenarioDraft, templates: Map<string, ScenarioTemplate>): string[] {
  return draft.items.flatMap((item) => {
    if (item.itemType !== "INCIDENT_CARD") return [];

    const main =
      item.source.kind === "TEMPLATE"
        ? templates.get(item.source.templateId)?.services[0]
        : item.source.expected.services[0];

    return main === undefined ? [] : [main];
  });
}

interface ParticipantPositionsProps {
  form: UseFormReturnType<ScenarioDraft>;
  services: ServiceOption[];
  templates: Map<string, ScenarioTemplate>;
}

export function ParticipantPositions({ form, services, templates }: ParticipantPositionsProps) {
  const draft = form.values;
  const positions = draft.requiredPositions;
  const suggestion = suggestedPositions({
    workspaceMode: draft.workspaceMode,
    hasCalls: draft.items.some((item) => item.itemType === "INCOMING_CALL"),
    mainServices: mainServicesOf(draft, templates),
    minParticipants: draft.minParticipants,
  });
  const label = (position: ParticipantPosition) =>
    position === null
      ? "Оператор 112"
      : `ДДС: ${services.find((service) => service.code === position)?.name ?? `служба ${position}`}`;
  const options = [
    { value: OPERATOR, label: "Оператор 112" },
    ...services.map((service) => ({ value: service.code, label: `ДДС: ${service.name}` })),
  ];
  const error = form.errors.requiredPositions;
  const setPositions = (next: ParticipantPosition[] | null) => form.setFieldValue("requiredPositions", next);

  return (
    <Stack gap={6} data-path="requiredPositions" tabIndex={-1}>
      <Text size="sm" fw={500}>
        Кто проходит
      </Text>
      <Switch
        size="sm"
        label="Задать обязательные позиции"
        checked={positions !== null}
        onChange={(event) => setPositions(event.currentTarget.checked ? suggestion : null)}
      />
      {positions === null ? (
        <Text size="xs" c="povDark2.6">
          Без ограничения: роли распределяются при назначении занятия, роль сценария в списке определяется по составу.
        </Text>
      ) : (
        <Stack gap={6}>
          <Group gap="sm" align="flex-end" wrap="wrap">
            {draft.workspaceMode === "INDIVIDUAL" ? (
              <Select
                size="xs"
                w={320}
                label="Обучаемый работает как"
                data={options}
                value={toOption(positions[0] ?? null)}
                allowDeselect={false}
                searchable
                error={error}
                onChange={(value) => {
                  if (value !== null) setPositions([fromOption(value)]);
                }}
              />
            ) : (
              <MultiSelect
                size="xs"
                w={420}
                label={`Обязательные позиции, не больше ${draft.minParticipants}`}
                data={options}
                value={positions.map(toOption)}
                maxValues={draft.minParticipants}
                searchable
                error={error}
                onChange={(values) => setPositions(values.map(fromOption))}
              />
            )}
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => setPositions(suggestion)}>
              Подставить по составу
            </Button>
          </Group>
          <Text size="xs" c="povDark2.6">
            По составу: {suggestion.map(label).join(", ")}. Назначение занятия должно покрыть все обязательные позиции,
            иначе сервер его не примет.
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
