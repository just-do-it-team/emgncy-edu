import { Group, NumberInput, SegmentedControl, Select, Stack, Text } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import {
  DEFAULT_TRIGGER_STEP_SECONDS,
  itemLabel,
  triggerActions,
  type ScenarioDraft,
  type TriggerDraft,
} from "@/entities/scenario";

type TriggerKind = TriggerDraft["kind"];

const kindOptions: { value: TriggerKind; label: string }[] = [
  { value: "immediate", label: "Сразу" },
  { value: "offset", label: "Через N секунд" },
  { value: "after", label: "После действия" },
];

function isKind(value: string): value is TriggerKind {
  return value === "immediate" || value === "offset" || value === "after";
}

interface TriggerFieldsProps {
  form: UseFormReturnType<ScenarioDraft>;
  index: number;
}

export function TriggerFields({ form, index }: TriggerFieldsProps) {
  const items = form.values.items;
  const item = items[index];

  if (!item) return null;

  const path = `items.${index}.trigger`;
  const trigger = item.trigger;
  const others = items.flatMap((candidate, position) =>
    position === index ? [] : [{ value: candidate.key, label: itemLabel(items, position) }],
  );
  const triggerSource =
    trigger.kind === "after" ? items.find((candidate) => candidate.key === trigger.itemKey) : undefined;
  const actionOptions = triggerSource
    ? triggerActions[triggerSource.itemType].map(({ code, label }) => ({ value: code, label }))
    : [];
  const setTrigger = (next: TriggerDraft) =>
    form.setFieldValue(
      "items",
      items.map((candidate, position) => (position === index ? { ...candidate, trigger: next } : candidate)),
    );
  const firstAction = (key: string) => {
    const source = items.find((candidate) => candidate.key === key);

    return source ? (triggerActions[source.itemType][0]?.code ?? "") : "";
  };

  const changeKind = (kind: TriggerKind) => {
    if (kind === "immediate") setTrigger({ kind });
    if (kind === "offset") setTrigger({ kind, seconds: DEFAULT_TRIGGER_STEP_SECONDS });
    if (kind === "after") {
      const previous = items[index - 1] ?? items.find((candidate) => candidate.key !== item.key);
      const itemKey = previous?.key ?? "";

      setTrigger({ kind, itemKey, actionType: firstAction(itemKey), delaySeconds: 0 });
    }
  };

  const seconds = (value: string | number) => (typeof value === "number" ? Math.max(0, Math.round(value)) : 0);

  return (
    <Stack gap={6}>
      <Group gap="sm" align="center" wrap="wrap">
        <Text size="xs" c="povDark2.6">
          Подача
        </Text>
        <SegmentedControl
          size="xs"
          radius={2}
          color="povDark2.6"
          data={kindOptions.map((option) =>
            option.value === "after" && others.length === 0 ? { ...option, disabled: true } : option,
          )}
          value={trigger.kind}
          onChange={(value) => {
            if (isKind(value)) changeKind(value);
          }}
          aria-label={`${itemLabel(items, index)}: условие подачи`}
        />
      </Group>

      {trigger.kind === "offset" && (
        <NumberInput
          size="xs"
          w={220}
          label="Секунд от начала занятия"
          min={0}
          step={30}
          allowDecimal={false}
          {...form.getInputProps(`${path}.seconds`)}
          onChange={(value) => setTrigger({ ...trigger, seconds: seconds(value) })}
        />
      )}

      {trigger.kind === "after" && (
        <Group gap="sm" align="flex-start" wrap="wrap">
          <Select
            size="xs"
            w={200}
            label="После элемента"
            data={others}
            allowDeselect={false}
            {...form.getInputProps(`${path}.itemKey`)}
            onChange={(value) => {
              if (value !== null) setTrigger({ ...trigger, itemKey: value, actionType: firstAction(value) });
            }}
          />
          <Select
            size="xs"
            w={260}
            label="Действие обучаемого"
            data={actionOptions}
            allowDeselect={false}
            {...form.getInputProps(`${path}.actionType`)}
            onChange={(value) => {
              if (value !== null) setTrigger({ ...trigger, actionType: value });
            }}
          />
          <NumberInput
            size="xs"
            w={140}
            label="Задержка, с"
            min={0}
            step={10}
            allowDecimal={false}
            {...form.getInputProps(`${path}.delaySeconds`)}
            onChange={(value) => setTrigger({ ...trigger, delaySeconds: seconds(value) })}
          />
        </Group>
      )}
    </Stack>
  );
}
