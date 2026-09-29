import { MultiSelect, NumberInput, Paper, SegmentedControl, Stack, Switch, Text, Title } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { classifierRecords } from "@/entities/incident";
import { eligiblePoolSize, isTemplateUsable, type PoolKind, type ScenarioDraft } from "@/entities/scenario";
import type { ScenarioTemplate } from "@/shared/api";
import { PROCEDURAL_PACE_BY_DIFFICULTY } from "@/shared/config";

const poolOptions: { value: PoolKind; label: string }[] = [
  { value: "all", label: "Все подходящие шаблоны" },
  { value: "templates", label: "Выбранные шаблоны" },
  { value: "groups", label: "Группы классификатора" },
];

const groupOptions = [...new Map(classifierRecords.map((record) => [String(record.codes[0]), record.group]))]
  .map(([value, label]) => ({ value, label }))
  .sort((first, second) => first.label.localeCompare(second.label, "ru"));

function isPoolKind(value: string): value is PoolKind {
  return value === "all" || value === "templates" || value === "groups";
}

function paceText(difficulty: number): string | null {
  const pace = PROCEDURAL_PACE_BY_DIFFICULTY.get(difficulty);

  if (!pace) return null;

  const first = pace.initialDelaySeconds === 0 ? "сразу" : `через ${pace.initialDelaySeconds} с`;

  return `Темп задаёт сложность сценария: первая карточка ${first}, затем каждые ${pace.releaseIntervalSeconds} с, открыто одновременно не больше ${pace.maxActive}.`;
}

interface ProceduralEditorProps {
  form: UseFormReturnType<ScenarioDraft>;
  cardTemplates: ScenarioTemplate[];
}

export function ProceduralEditor({ form, cardTemplates }: ProceduralEditorProps) {
  const draft = form.values;
  const procedural = draft.procedural;
  const eligible = eligiblePoolSize(draft, cardTemplates);
  const pace = paceText(draft.difficulty);
  const templateOptions = cardTemplates
    .filter((template) => isTemplateUsable(template) && template.recordId !== null)
    .map((template) => ({ value: template.id, label: `${template.name}, версия ${template.version}` }))
    .sort((first, second) => first.label.localeCompare(second.label, "ru"));

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Title order={3} size="h5" fw={600}>
          Процедурная подача
        </Title>
        <Switch
          size="sm"
          label="Добавлять карточки ДДС из пула шаблонов"
          {...form.getInputProps("procedural.enabled", { type: "checkbox" })}
        />
        {procedural.enabled && (
          <Stack gap="sm">
            {pace && (
              <Text size="sm" c="povDark2.6">
                {pace}
              </Text>
            )}
            <NumberInput
              size="xs"
              w={220}
              label="Сколько карточек подать"
              min={1}
              max={100}
              allowDecimal={false}
              {...form.getInputProps("procedural.targetCount")}
              onChange={(value) =>
                form.setFieldValue("procedural.targetCount", typeof value === "number" ? Math.round(value) : 0)
              }
            />
            <SegmentedControl
              size="xs"
              radius={2}
              color="povDark2.6"
              data={poolOptions}
              value={procedural.poolKind}
              onChange={(value) => {
                if (isPoolKind(value)) form.setFieldValue("procedural.poolKind", value);
              }}
              aria-label="Пул шаблонов"
              w="fit-content"
            />
            {procedural.poolKind === "templates" && (
              <MultiSelect
                size="xs"
                label="Шаблоны карточек"
                data={templateOptions}
                searchable
                {...form.getInputProps("procedural.templateIds")}
              />
            )}
            {procedural.poolKind === "groups" && (
              <MultiSelect
                size="xs"
                label="Группы классификатора"
                data={groupOptions}
                searchable
                value={procedural.groupCodes.map(String)}
                error={form.errors["procedural.groupCodes"]}
                data-path="procedural.groupCodes"
                onChange={(values) => form.setFieldValue("procedural.groupCodes", values.map(Number))}
              />
            )}
            <Text size="sm">
              Подходящих шаблонов в пуле: {eligible}. В пул входят активные шаблоны карточек со сложностью не выше
              сложности сценария и с заданным типом происшествия.
            </Text>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
