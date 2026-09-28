import { useState } from "react";
import { Checkbox, Group, Paper, SegmentedControl, Select, Stack, Switch, Text, Title } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import {
  cardSourceTypeLabels,
  cardSourceTypes,
  defaultTrigger,
  emptyCardFields,
  emptyExpected,
  itemLabel,
  moveItem,
  nextItemKey,
  type InlineVariant,
  type ScenarioDraft,
  type ScenarioItemDraft,
  type TemplateEntry,
} from "@/entities/scenario";
import { CardFieldsEditor, ExpectedEditor, type ServiceOption } from "@/features/expected-result-form";
import type { ScenarioTemplate } from "@/shared/api";
import { ActionIcon, Button } from "@/shared/ui";
import { TemplatePicker } from "./template-picker";
import { TriggerFields } from "./trigger-fields";
import classes from "./scenario-editor.module.scss";

const inlineVariantOptions: { value: InlineVariant; label: string }[] = [
  { value: "card112", label: "Карточка 112" },
  { value: "cardDds", label: "Карточка ДДС" },
];

function isInlineVariant(value: string): value is InlineVariant {
  return value === "card112" || value === "cardDds";
}

export interface ItemReview {
  requiredKeys: ReadonlySet<string>;
  checkedKeys: ReadonlySet<string>;
  generated: ReadonlyMap<string, ScenarioItemDraft>;
  onCheck: (key: string, checked: boolean) => void;
}

interface CompositionEditorProps {
  form: UseFormReturnType<ScenarioDraft>;
  aiReview: ItemReview | null;
  templates: Map<string, ScenarioTemplate>;
  entries: TemplateEntry[];
  services: ServiceOption[];
  serviceNames: Map<string, string>;
  errors: Record<string, string>;
}

interface ItemEditorProps extends Omit<CompositionEditorProps, "serviceNames"> {
  index: number;
  expanded: boolean;
  dragging: boolean;
  onToggle: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}

function newerVersion(entries: TemplateEntry[], template: ScenarioTemplate): ScenarioTemplate | null {
  const entry = entries.find((candidate) => candidate.versions.some((version) => version.id === template.id));
  const latest = entry?.latest;

  return latest && latest.id !== template.id && latest.isActive && latest.version > template.version ? latest : null;
}

function TemplateSource({
  form,
  index,
  template,
  entries,
}: {
  form: UseFormReturnType<ScenarioDraft>;
  index: number;
  template: ScenarioTemplate | undefined;
  entries: TemplateEntry[];
}) {
  if (!template) {
    return (
      <Text size="sm" c="var(--mantine-color-error)">
        Шаблон не найден в библиотеке. Удалите элемент или выберите другой шаблон.
      </Text>
    );
  }

  const newer = newerVersion(entries, template);
  const switchTo = (target: ScenarioTemplate) =>
    form.setFieldValue(
      "items",
      form.values.items.map(
        (item, position): ScenarioItemDraft =>
          position === index ? { ...item, source: { kind: "TEMPLATE", templateId: target.id } } : item,
      ),
    );

  return (
    <Stack gap={4}>
      <Group gap="xs" wrap="wrap">
        <Text size="sm">{template.name}</Text>
        <Text size="xs" c="povDark2.6">
          версия {template.version}
        </Text>
      </Group>
      {(!template.isActive || newer) && (
        <Group gap="sm" wrap="wrap" className={classes.notice}>
          <Text size="sm">
            {!template.isActive
              ? "Шаблон деактивирован: сервер не примет сценарий с этой версией."
              : `Есть новая версия шаблона — ${newer?.version}. Сценарий сам на неё не переключится.`}
          </Text>
          {newer && (
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => switchTo(newer)}>
              Перейти на версию {newer.version}
            </Button>
          )}
        </Group>
      )}
    </Stack>
  );
}

function InlineSource({ form, index, services, errors }: Pick<ItemEditorProps, "form" | "index" | "services" | "errors">) {
  const item = form.values.items[index];

  if (!item || item.source.kind !== "INLINE") return null;

  const path = `items.${index}.source`;
  const source = item.source;

  return (
    <Stack gap="sm" className={classes.inline}>
      <Text size="sm" c="povDark2.6">
        Встроенная карточка хранится только в этом сценарии. Поле эталона, оставленное пустым, не проверяется.
      </Text>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <SegmentedControl
          size="xs"
          radius={2}
          color="povDark2.6"
          data={inlineVariantOptions}
          value={source.variant}
          onChange={(value) => {
            if (isInlineVariant(value)) form.setFieldValue(`${path}.variant`, value);
          }}
          aria-label={`${itemLabel(form.values.items, index)}: вид карточки`}
        />
        <Select
          size="xs"
          w={240}
          label="Источник карточки"
          data={cardSourceTypes.map((type) => ({ value: type, label: cardSourceTypeLabels[type] ?? type }))}
          allowDeselect={false}
          {...form.getInputProps(`${path}.card.sourceType`)}
        />
      </Group>
      <Switch
        size="sm"
        label="Исходная карточка совпадает с эталоном"
        {...form.getInputProps(`${path}.card.initialSameAsExpected`, { type: "checkbox" })}
      />
      {!source.card.initialSameAsExpected && (
        <CardFieldsEditor
          form={form}
          path={`${path}.card.initial`}
          value={source.card.initial}
          modes={null}
          callerKnowledge={false}
        />
      )}
      <ExpectedEditor
        form={form}
        path={`${path}.expected`}
        value={source.expected}
        variant={source.variant}
        source="INLINE"
        services={services}
        errors={errors}
      />
    </Stack>
  );
}

function ItemEditor(props: ItemEditorProps) {
  const { form, index, templates, entries, expanded, dragging, onToggle, onDragStart, onDragEnd, onDrop, errors, aiReview } = props;
  const items = form.values.items;
  const item = items[index];
  const [over, setOver] = useState(false);

  if (!item) return null;

  const label = itemLabel(items, index);
  const sourceError = errors[`items.${index}.source`];
  const generated = aiReview?.generated.get(item.key);
  const untouched = generated !== undefined && JSON.stringify(generated) === JSON.stringify(item);
  const move = (to: number, direction: "up" | "down") => {
    form.setFieldValue("items", moveItem(items, index, to));
    requestAnimationFrame(() => {
      const card = document.querySelector(`[data-item-key="${item.key}"]`);
      const same = card?.querySelector<HTMLButtonElement>(`[data-move="${direction}"]:not(:disabled)`);
      const other = card?.querySelector<HTMLButtonElement>(`[data-move]:not(:disabled)`);

      (same ?? other)?.focus();
    });
  };
  const remove = () => {
    form.setFieldValue("items", items.filter((_candidate, position) => position !== index));
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-path="items"]')?.focus());
  };

  return (
    <Paper
      withBorder
      p="sm"
      radius={2}
      className={over && !dragging ? classes.dropTarget : undefined}
      data-path={`items.${index}.source`}
      data-item-key={item.key}
      tabIndex={-1}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onDrop();
      }}
    >
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Group gap="xs" wrap="nowrap">
            <span
              className={classes.handle}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", item.key);
                onDragStart();
              }}
              onDragEnd={onDragEnd}
              title="Перетащите, чтобы изменить порядок"
            >
              <GripVertical size={16} aria-hidden />
            </span>
            <Text size="sm" fw={600}>
              {label}
            </Text>
            <Text size="xs" c="povDark2.6">
              {item.source.kind === "TEMPLATE" ? "из шаблона" : "встроенная"}
              {untouched ? ", предложено ИИ" : ""}
            </Text>
          </Group>
          <Group gap={4} wrap="nowrap">
            {item.source.kind === "INLINE" && (
              <Button size="xs" variant="outline" color="povDark2.6" onClick={onToggle} aria-expanded={expanded}>
                {expanded ? "Свернуть" : "Изменить карточку"}
              </Button>
            )}
            <ActionIcon
              color="povDark2.6"
              aria-label={`${label}: выше`}
              data-move="up"
              disabled={index === 0}
              onClick={() => move(index - 1, "up")}
            >
              <ArrowUp size={16} />
            </ActionIcon>
            <ActionIcon
              color="povDark2.6"
              aria-label={`${label}: ниже`}
              data-move="down"
              disabled={index === items.length - 1}
              onClick={() => move(index + 1, "down")}
            >
              <ArrowDown size={16} />
            </ActionIcon>
            <ActionIcon color="povDark2.6" aria-label={`${label}: удалить`} onClick={remove}>
              <Trash2 size={16} />
            </ActionIcon>
          </Group>
        </Group>

        {aiReview && aiReview.requiredKeys.has(item.key) && (
          <Checkbox
            size="xs"
            label="Эталон проверен"
            description="Отметьте после того, как сверили карточку, службы и статусы с тем, что должен сделать обучаемый"
            checked={aiReview.checkedKeys.has(item.key)}
            onChange={(event) => aiReview.onCheck(item.key, event.currentTarget.checked)}
          />
        )}

        {item.source.kind === "TEMPLATE" && (
          <TemplateSource form={form} index={index} template={templates.get(item.source.templateId)} entries={entries} />
        )}

        {sourceError && (
          <Text size="xs" c="var(--mantine-color-error)">
            {sourceError}
          </Text>
        )}

        <TriggerFields form={form} index={index} />

        {item.source.kind === "INLINE" && expanded && <InlineSource {...props} />}
      </Stack>
    </Paper>
  );
}

export function CompositionEditor(props: CompositionEditorProps) {
  const { form, entries, serviceNames, errors } = props;
  const [pickerOpened, setPickerOpened] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const items = form.values.items;

  const append = (created: ScenarioItemDraft[]) => form.setFieldValue("items", [...items, ...created]);

  const addTemplates = (picked: ScenarioTemplate[]) => {
    const created = picked.reduce<ScenarioItemDraft[]>((next, template) => {
      const itemType = template.kind === "call" ? "INCOMING_CALL" : "INCIDENT_CARD";
      const all = [...items, ...next];

      return [
        ...next,
        { key: nextItemKey(all, itemType), itemType, trigger: defaultTrigger(all.length), source: { kind: "TEMPLATE", templateId: template.id } },
      ];
    }, []);

    append(created);
    setPickerOpened(false);
  };

  const addInline = () => {
    const key = nextItemKey(items, "INCIDENT_CARD");

    append([
      {
        key,
        itemType: "INCIDENT_CARD",
        trigger: defaultTrigger(items.length),
        source: {
          kind: "INLINE",
          variant: "card112",
          card: { sourceType: "CALL", initialSameAsExpected: false, initial: emptyCardFields },
          expected: emptyExpected("INLINE"),
        },
      },
    ]);
    setExpanded((current) => new Set(current).add(key));
  };

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);

      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <Paper withBorder p="md" data-path="items" tabIndex={-1}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Title order={3} size="h5" fw={600}>
            Состав
          </Title>
          <Group gap="xs">
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => setPickerOpened(true)}>
              Добавить из шаблонов
            </Button>
            <Button size="xs" variant="outline" color="povDark2.6" onClick={addInline}>
              Добавить встроенную карточку
            </Button>
          </Group>
        </Group>

        {items.length === 0 ? (
          <Text size="sm">
            Элементов нет. Добавьте звонки и карточки из библиотеки шаблонов, создайте встроенную карточку или включите
            процедурную подачу ниже.
          </Text>
        ) : (
          <Stack gap="xs">
            {items.map((item, index) => (
              <ItemEditor
                key={item.key}
                {...props}
                index={index}
                expanded={expanded.has(item.key)}
                dragging={dragFrom === index}
                onToggle={() => toggle(item.key)}
                onDragStart={() => setDragFrom(index)}
                onDragEnd={() => setDragFrom(null)}
                onDrop={() => {
                  if (dragFrom !== null) form.setFieldValue("items", moveItem(items, dragFrom, index));
                  setDragFrom(null);
                }}
              />
            ))}
          </Stack>
        )}

        {errors.items && (
          <Text size="xs" c="var(--mantine-color-error)">
            {errors.items}
          </Text>
        )}
      </Stack>

      {pickerOpened && (
        <TemplatePicker
          entries={entries}
          serviceNames={serviceNames}
          onClose={() => setPickerOpened(false)}
          onPick={addTemplates}
        />
      )}
    </Paper>
  );
}
