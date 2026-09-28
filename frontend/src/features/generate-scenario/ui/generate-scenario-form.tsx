import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Anchor,
  Checkbox,
  Group,
  MultiSelect,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { Link } from "react-router-dom";
import { useEmergencyServices } from "@/entities/emergency-service";
import { classifierGroups, classifierRecords } from "@/entities/incident";
import { difficultyOptions, scenarioDraftFromGenerated, type AiReview, type ScenarioDraft } from "@/entities/scenario";
import { errorStatus } from "@/shared/api";
import { Button } from "@/shared/ui";
import { generateScenario } from "../api/generate-scenario";
import {
  AI_DIFFICULTY,
  emptyGenerationParams,
  generationFailure,
  generationFailureText,
  generationRequestBody,
  MAX_ITEMS,
  MAX_NOTES_LENGTH,
  MIN_ITEMS,
  validateGenerationParams,
  type GenerationAudience,
  type GenerationFailure,
  type GenerationParams,
} from "../model/generation-params";

const TICK_MS = 1000;
const SECOND_MS = 1000;

const audienceOptions: { value: GenerationAudience; label: string }[] = [
  { value: "OPERATOR_112", label: "Оператор 112" },
  { value: "DDS", label: "Диспетчер ДДС" },
  { value: "SHARED", label: "Общее рабочее место" },
];

const difficultyChoices = [{ value: AI_DIFFICULTY, label: "Предложит ИИ" }, ...difficultyOptions];

function isAudience(value: string): value is GenerationAudience {
  return audienceOptions.some((option) => option.value === value);
}

export interface GeneratedScenario {
  draft: ScenarioDraft;
  review: AiReview;
}

interface Running {
  startedAt: number;
  controller: AbortController;
}

interface GenerateScenarioFormProps {
  teacherId: string;
  onGenerated: (result: GeneratedScenario) => void;
}

export function GenerateScenarioForm({ teacherId, onGenerated }: GenerateScenarioFormProps) {
  const services = useEmergencyServices();
  const [running, setRunning] = useState<Running | null>(null);
  const [failure, setFailure] = useState<Exclude<GenerationFailure, "cancelled"> | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const runningRef = useRef<Running | null>(null);
  const form = useForm<GenerationParams>({
    initialValues: emptyGenerationParams,
    validate: validateGenerationParams,
  });
  const params = form.values;
  const serviceOptions = [...(services.data?.values() ?? [])].map((service) => ({
    value: service.code,
    label: `${service.code} ${service.name}`,
  }));
  const typeOptions =
    params.group === null
      ? []
      : classifierRecords
          .filter((record) => record.group === params.group)
          .map((record) => ({ value: String(record.id), label: record.name }));

  useEffect(() => {
    if (running === null) return;

    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);

    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => () => runningRef.current?.controller.abort(), []);

  const finish = () => {
    runningRef.current = null;
    setRunning(null);
  };

  const submit = form.onSubmit(async (values) => {
    if (runningRef.current !== null) return;

    const next = { startedAt: Date.now(), controller: new AbortController() };

    runningRef.current = next;
    setRunning(next);
    setNow(next.startedAt);
    setFailure(null);

    try {
      const result = await generateScenario(
        generationRequestBody(values, teacherId, crypto.randomUUID()),
        next.controller.signal,
      );
      const draft = scenarioDraftFromGenerated(result.scenario);

      finish();
      onGenerated({
        draft,
        review: {
          model: result.generation.model,
          generatedAt: result.generation.generated_at,
          suggestedDifficulty: result.generation.difficulty_suggested ? draft.difficulty : null,
          itemKeys: draft.items.map((item) => item.key),
          checkedKeys: [],
        },
      });
    } catch (error) {
      const kind = generationFailure(errorStatus(error), next.controller.signal.aborted);

      finish();
      if (kind !== "cancelled") setFailure(kind);
    }
  });

  if (running !== null) {
    return (
      <Paper withBorder p="md">
        <Stack gap="sm" align="flex-start" role="status" aria-live="polite">
          <Title order={3} size="h5" fw={600}>
            Идёт генерация сценария — {Math.max(0, Math.floor((now - running.startedAt) / SECOND_MS))} с
          </Title>
          <Text size="sm">
            Модель составляет карточки, данные заявителя и эталон по выбранному типу из классификатора. Обычно это
            занимает до минуты. Результат откроется в редакторе как черновик — ничего не сохраняется, пока вы его не
            проверите.
          </Text>
          <Button size="sm" variant="outline" color="povDark2.6" onClick={() => running.controller.abort()}>
            Отменить
          </Button>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper withBorder p="md">
      <form onSubmit={submit} noValidate>
        <Stack gap="sm">
          <Title order={3} size="h5" fw={600}>
            Параметры генерации
          </Title>

          {failure && (
            <Alert variant="outline" color="povDark2.6" title="Сценарий не сгенерирован">
              <Stack gap="xs" align="flex-start">
                <Text size="sm">{generationFailureText[failure]}</Text>
                {failure === "unavailable" && (
                  <Anchor component={Link} to="/teacher/scenarios/new" size="sm" c="povDark2.6" underline="always">
                    Собрать сценарий из шаблонов
                  </Anchor>
                )}
              </Stack>
            </Alert>
          )}

          <Group gap="sm" align="flex-start" grow>
            <Select
              size="xs"
              label="Группа происшествий"
              withAsterisk
              data={classifierGroups}
              searchable
              {...form.getInputProps("group")}
              onChange={(value) => {
                form.setFieldValue("group", value);
                form.setFieldValue("recordId", null);
              }}
            />
            <Select
              size="xs"
              label="Тип происшествия"
              description="Необязательно: без типа модель выберет типы внутри группы"
              placeholder={params.group === null ? "Сначала выберите группу" : "Любой тип группы"}
              data={typeOptions}
              disabled={params.group === null}
              searchable
              clearable
              value={params.recordId === null ? null : String(params.recordId)}
              onChange={(value) => form.setFieldValue("recordId", value === null ? null : Number(value))}
            />
          </Group>

          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Кто проходит
            </Text>
            <SegmentedControl
              size="xs"
              radius={2}
              data={audienceOptions}
              value={params.audience}
              onChange={(value) => {
                if (isAudience(value)) form.setFieldValue("audience", value);
              }}
            />
          </Stack>

          {params.audience === "DDS" && (
            <Select
              size="xs"
              w={320}
              label="Служба диспетчера"
              withAsterisk
              data={serviceOptions}
              searchable
              {...form.getInputProps("dispatcherCode")}
            />
          )}

          {params.audience === "SHARED" && (
            <Stack gap="xs">
              <Checkbox size="xs" label="Оператор 112" {...form.getInputProps("sharedWithOperator", { type: "checkbox" })} />
              <MultiSelect
                size="xs"
                label="Диспетчеры служб"
                data={serviceOptions}
                searchable
                {...form.getInputProps("sharedCodes")}
              />
            </Stack>
          )}

          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Сложность
            </Text>
            <SegmentedControl
              size="xs"
              radius={2}
              data={difficultyChoices}
              value={params.difficulty}
              onChange={(value) => form.setFieldValue("difficulty", value)}
            />
          </Stack>

          <NumberInput
            size="xs"
            w={220}
            label="Число элементов"
            min={MIN_ITEMS}
            max={MAX_ITEMS}
            allowDecimal={false}
            {...form.getInputProps("itemCount")}
          />

          <Textarea
            size="xs"
            label="Особенности"
            description="Необязательно. Например: «заявитель путает адрес», «несколько пострадавших»"
            autosize
            minRows={2}
            maxLength={MAX_NOTES_LENGTH}
            {...form.getInputProps("notes")}
          />

          <Group justify="flex-end" gap="xs">
            <Button size="sm" variant="outline" color="povDark2.6" component={Link} to="/teacher/scenarios">
              Отмена
            </Button>
            <Button size="sm" type="submit">
              Сгенерировать
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}
