import { Alert, Group, Modal, MultiSelect, NumberInput, SegmentedControl, Skeleton, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { Link, useNavigate } from "react-router-dom";
import { incidentCategoryLabels } from "@/entities/incident";
import {
  categoryOf,
  difficultyLabel,
  difficultyOptions,
  isTemplateUsable,
  poolSizesAbove,
  proceduralPool,
  proceduralScenarioDraft,
  scenarioCreateBody,
  scenarioDurationSeconds,
  scenarioPathOf,
  useCreateScenario,
  useFreshTemplates,
} from "@/entities/scenario";
import { classificationFor, serverFailure } from "@/features/expected-result-form";
import type { ParticipantPosition } from "@/shared/api";
import { PROCEDURAL_PACE_BY_DIFFICULTY } from "@/shared/config";
import { Button } from "@/shared/ui";
import { serviceName, useServiceNames } from "@/widgets/expected-result-view";

const MAX_TARGET_COUNT = 100;
const DEFAULT_TARGET_COUNT = 5;

type ProceduralRole = "dds" | "operator";

const roleOptions: { value: ProceduralRole; label: string }[] = [
  { value: "dds", label: "Диспетчер ДДС" },
  { value: "operator", label: "Оператор 112" },
];

function isRole(value: string): value is ProceduralRole {
  return value === "dds" || value === "operator";
}

interface ProceduralValues {
  name: string;
  role: ProceduralRole;
  services: string[];
  categories: string[];
  targetCount: number;
  difficulty: string;
}

function paceText(difficulty: number): string {
  const pace = PROCEDURAL_PACE_BY_DIFFICULTY.get(difficulty);

  if (!pace) return "";

  const first = pace.initialDelaySeconds === 0 ? "сразу" : `через ${pace.initialDelaySeconds} с`;

  return `Темп задан сложностью: первая карточка ${first}, затем каждые ${pace.releaseIntervalSeconds} с, открыто одновременно не больше ${pace.maxActive}.`;
}

function positionsOf(values: ProceduralValues): ParticipantPosition[] {
  return values.role === "operator" ? [null] : values.services;
}

export function ProceduralScenarioModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const templates = useFreshTemplates();
  const serviceNames = useServiceNames();
  const create = useCreateScenario();
  const form = useForm<ProceduralValues>({
    initialValues: { name: "", role: "dds", services: [], categories: [], targetCount: DEFAULT_TARGET_COUNT, difficulty: "1" },
    validate: {
      name: (value) => (value.trim() === "" ? "Введите название сценария." : null),
      services: (value, values) => (values.role === "dds" && value.length === 0 ? "Выберите хотя бы одну службу." : null),
      targetCount: (value) =>
        Number.isInteger(value) && value >= 1 && value <= MAX_TARGET_COUNT ? null : `От 1 до ${MAX_TARGET_COUNT} карточек.`,
    },
  });
  const values = form.values;
  const difficulty = Number(values.difficulty);
  const all = templates.data ?? [];
  const anyCategory = proceduralPool(all, positionsOf(values), difficulty, []);
  const pool = proceduralPool(all, positionsOf(values), difficulty, values.categories.map(Number));
  const categoryCounts = new Map<number, number>();

  for (const code of anyCategory.flatMap((template) => categoryOf(template) ?? [])) {
    categoryCounts.set(code, (categoryCounts.get(code) ?? 0) + 1);
  }

  const categoryOptions = Object.entries(incidentCategoryLabels).map(([code, label]) => ({ value: code, label }));
  const choosing = values.role === "dds" && values.services.length === 0;
  const short = !choosing && pool.length < values.targetCount;
  const ddsTemplates = all.filter((template) => template.variant === "cardDds" && isTemplateUsable(template));
  const templatesPerService = new Map<string, number>();

  for (const code of ddsTemplates.flatMap((template) => template.services)) {
    templatesPerService.set(code, (templatesPerService.get(code) ?? 0) + 1);
  }

  const sizesAbove = short ? poolSizesAbove(all, positionsOf(values), difficulty, values.categories.map(Number)) : [];
  const difficultyHint = sizesAbove
    .filter((level) => level.size > pool.length)
    .map((level, index) =>
      index === 0
        ? `При сложности «${difficultyLabel(level.difficulty)}» подойдёт ${level.size}`
        : `«${difficultyLabel(level.difficulty)}» — ${level.size}`,
    )
    .join(", ");
  const generatePath =
    values.role === "dds" && values.services[0] !== undefined
      ? `/teacher/scenarios/templates/generate?service=${values.services[0]}`
      : "/teacher/scenarios/templates/generate";
  const serviceOptions = [...templatesPerService.keys()]
    .map((code) => ({ value: code, label: serviceName(code, serviceNames) }))
    .sort((first, second) => first.label.localeCompare(second.label, "ru"));

  const submit = form.onSubmit((submitted) => {
    if (short) return;

    const draft = proceduralScenarioDraft(
      { name: submitted.name.trim(), positions: positionsOf(submitted), targetCount: submitted.targetCount, difficulty },
      pool,
    );

    create.mutate(scenarioCreateBody(draft, classificationFor, scenarioDurationSeconds(draft), userId), {
      onSuccess: (scenario) => navigate(`/teacher/scenarios/${scenario.id}/edit`),
      onError: (error) => {
        const failure = serverFailure(error, scenarioPathOf);

        notifications.show({
          title: "Сценарий не создан",
          message: failure.kind === "validation" ? failure.issues.map((issue) => issue.message).join(" ") : failure.message,
          color: "red",
        });
      },
    });
  });

  return (
    <Modal opened onClose={onClose} title="Процедурный сценарий" size="lg" centered radius={2} transitionProps={{ duration: 0 }}>
      <form onSubmit={submit} noValidate>
        <Stack gap="sm">
          <Text size="sm" c="povDark2.6">
            Карточки подаются по очереди из пула опубликованных шаблонов. Черновик откроется в редакторе — там можно
            всё уточнить перед утверждением.
          </Text>
          <TextInput size="sm" label="Название" withAsterisk data-autofocus {...form.getInputProps("name")} />
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Кто работает
            </Text>
            <SegmentedControl
              size="xs"
              radius={2}
              color="povDark2.6"
              w="fit-content"
              data={roleOptions}
              value={values.role}
              onChange={(value) => {
                if (isRole(value)) form.setValues({ role: value, services: [], categories: [] });
              }}
              aria-label="Кто работает"
            />
          </Stack>
          {values.role === "dds" ? (
            <MultiSelect
              size="sm"
              label="Службы ДДС"
              description="Несколько служб — общее рабочее место: каждую службу занимает свой обучаемый"
              placeholder={templates.isPending ? "Загружаем шаблоны…" : "Выберите службы"}
              data={serviceOptions}
              searchable
              nothingFoundMessage="Нет опубликованных карточек ДДС для такой службы"
              renderOption={({ option }) => (
                <Text size="sm">
                  {option.label} — шаблонов: {templatesPerService.get(option.value) ?? 0}
                </Text>
              )}
              {...form.getInputProps("services")}
            />
          ) : (
            <Text size="sm" c="povDark2.6">
              Оператору 112 подаются готовые карточки 112: оценивается итоговое состояние каждой карточки.
            </Text>
          )}
          <MultiSelect
            size="sm"
            label="Категории происшествий"
            description="Не выбрано — любые категории"
            placeholder="Все категории"
            data={categoryOptions}
            clearable
            renderOption={({ option }) => {
              const count = categoryCounts.get(Number(option.value)) ?? 0;

              return (
                <Text size="sm" c={count === 0 ? "povDark2.6" : undefined}>
                  {option.label} — шаблонов: {count}
                </Text>
              );
            }}
            {...form.getInputProps("categories")}
          />
          <Group gap="sm" align="flex-start" wrap="wrap">
            <NumberInput
              size="sm"
              w={200}
              label="Сколько карточек"
              min={1}
              max={MAX_TARGET_COUNT}
              allowDecimal={false}
              {...form.getInputProps("targetCount")}
              onChange={(value) => form.setFieldValue("targetCount", typeof value === "number" ? value : 0)}
            />
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Сложность
              </Text>
              <SegmentedControl
                size="xs"
                radius={2}
                color="povDark2.6"
                data={difficultyOptions}
                {...form.getInputProps("difficulty")}
                aria-label="Сложность"
              />
            </Stack>
          </Group>
          <Text size="sm" c="povDark2.6">
            {paceText(difficulty)}
          </Text>

          {templates.isPending ? (
            <Skeleton height={24} radius={2} />
          ) : templates.isError ? (
            <Alert variant="outline" color="povDark2.6" title="Шаблоны не загрузились">
              <Button size="xs" variant="outline" color="povDark2.6" onClick={() => templates.refetch()}>
                Повторить
              </Button>
            </Alert>
          ) : choosing ? null : (
            <Stack gap={4} aria-live="polite">
              <Text size="sm" fw={600}>
                Подходящих шаблонов в пуле: {pool.length}
              </Text>
              {short && (
                <Stack gap="xs" align="flex-start">
                  <Text size="sm">
                    {pool.length === 0
                      ? "Опубликованных шаблонов для этой роли и сложности нет."
                      : `Шаблонов меньше, чем карточек: карточки не повторяются, поэтому нужно не меньше ${values.targetCount}.`}{" "}
                    В пул входят опубликованные шаблоны {values.role === "operator" ? "карточек 112" : "карточек ДДС выбранных служб"}{" "}
                    выбранных категорий со сложностью не выше выбранной и с заданным типом происшествия. Уменьшите число карточек,
                    поднимите сложность или добавьте шаблоны.
                  </Text>
                  {difficultyHint !== "" && (
                    <Text size="sm">
                      {difficultyHint}.
                    </Text>
                  )}
                  <Button size="xs" variant="outline" color="povDark2.6" component={Link} to={generatePath}>
                    Сгенерировать шаблоны с ИИ
                  </Button>
                </Stack>
              )}
            </Stack>
          )}

          <Group justify="flex-end" gap="xs">
            <Button size="sm" variant="outline" color="povDark2.6" onClick={onClose} disabled={create.isPending}>
              Отмена
            </Button>
            <Button size="sm" type="submit" loading={create.isPending} disabled={templates.isPending || short}>
              Создать черновик
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
