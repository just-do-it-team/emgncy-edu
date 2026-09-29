import { useEffect, useRef, useState } from "react";
import { Alert, Group, MultiSelect, Paper, Select, Stack, Stepper, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
import { useForm } from "@mantine/form";
import { useEmergencyServices } from "@/entities/emergency-service";
import {
  failureOf,
  isGenerationFinished,
  rememberedGenerations,
  rememberGeneration,
  useStartTemplateGeneration,
  useTemplateGeneration,
} from "@/entities/scenario";
import {
  errorDetail,
  errorStatus,
  type DispatcherServiceCode,
  type TemplateGenerationDto,
  type TemplateGenerationStatus,
} from "@/shared/api";
import { Button } from "@/shared/ui";
import { serviceWithCode } from "@/shared/config";

const DISPATCHER_CODES: DispatcherServiceCode[] = ["101", "102", "103", "104"];
const TICK_MS = 1000;
const SECOND_MS = 1000;
const TEMPLATES_PATH = "/teacher/scenarios/templates";

const generationSteps: TemplateGenerationStatus[] = ["PENDING", "PROCESSING", "COMPLETED"];

function elapsedText(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / SECOND_MS));

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const statusTexts: Record<TemplateGenerationStatus, string> = {
  PENDING: "Задача поставлена в очередь",
  PROCESSING: "Модель составляет звонок 112 и карточки ДДС",
  COMPLETED: "Черновики готовы",
  FAILED: "Генерация не удалась",
};

function isDispatcherCode(value: string | null): value is DispatcherServiceCode {
  return DISPATCHER_CODES.some((code) => code === value);
}

interface GenerationParams {
  main: string | null;
  others: string[];
}

interface GenerateTemplatesFormProps {
  userId: string;
  initialService: string | null;
  onCompleted: (generation: TemplateGenerationDto) => void;
}

export function GenerateTemplatesForm({ userId, initialService, onCompleted }: GenerateTemplatesFormProps) {
  const services = useEmergencyServices();
  const start = useStartTemplateGeneration();
  const [generationId, setGenerationId] = useState<string | null>(() => rememberedGenerations(userId).at(-1) ?? null);
  const [advanced, setAdvanced] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const reportedId = useRef<string | null>(null);
  const generation = useTemplateGeneration(generationId);
  const form = useForm<GenerationParams>({
    initialValues: { main: isDispatcherCode(initialService) ? initialService : null, others: [] },
    validate: { main: (value) => (isDispatcherCode(value) ? null : "Выберите основную службу") },
  });
  const nameOf = (code: string) =>
    serviceWithCode(code, [...(services.data?.values() ?? [])].find((service) => service.code === code)?.name ?? null);
  const options = DISPATCHER_CODES.map((code) => ({ value: code, label: nameOf(code) }));
  const current = generation.data;
  const finished = isGenerationFinished(current);
  const running = generationId !== null && !finished;

  useEffect(() => {
    if (!running) return;

    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);

    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (current?.status !== "COMPLETED" || reportedId.current === current.id) return;

    reportedId.current = current.id;
    onCompleted(current);
  }, [current, onCompleted]);

  const submit = form.onSubmit(({ main, others }) => {
    if (!isDispatcherCode(main) || start.isPending) return;

    const codes = [main, ...others.filter((code): code is DispatcherServiceCode => isDispatcherCode(code) && code !== main)];

    start.mutate(
      { dds_service_codes: codes, created_by: userId },
      {
        onSuccess: (created) => {
          rememberGeneration(userId, created.id);
          setNow(Date.now());
          setGenerationId(created.id);
        },
      },
    );
  });

  const reset = () => {
    setGenerationId(null);
    start.reset();
  };

  if (generationId !== null) {
    const startedAt = current ? Date.parse(current.created_at) : now;
    const step = current === undefined ? 0 : generationSteps.indexOf(current.status);

    return (
      <Paper withBorder p="md">
        <Stack gap="sm" align="flex-start" role="status" aria-live="polite">
          <Title order={3} size="h5" fw={600}>
            {current ? statusTexts[current.status] : "Задача отправлена"}
            {running ? ` — идёт ${elapsedText(now - startedAt)}` : ""}
          </Title>
          {current?.status !== "FAILED" && (
            <Stepper active={step < 0 ? 0 : step} size="xs" color="povDark2.6" allowNextStepsSelect={false}>
              <Stepper.Step label="В очереди" />
              <Stepper.Step label="Модель составляет" />
              <Stepper.Step label="Черновики готовы" />
            </Stepper>
          )}
          {running && (
            <Text size="sm">
              Модель составляет звонок 112 и карточки ДДС. Обычно 1–5 минут. Можно уйти со страницы — черновики
              появятся в «Шаблонах» со статусом «Черновик ИИ».
            </Text>
          )}
          {generation.isError && (
            <Text size="sm">Не удалось получить статус генерации. Проверка повторится при следующем обновлении.</Text>
          )}
          {current?.status === "FAILED" && (
            <Alert variant="outline" color="povDark2.6" title="Модель не справилась">
              <Text size="sm">
                {current.last_error ?? "Сервер не сообщил причину."} Попыток: {current.attempts}. Запустите генерацию заново.
              </Text>
            </Alert>
          )}
          <Group gap="xs">
            <Button size="sm" variant="outline" color="povDark2.6" component={Link} to={TEMPLATES_PATH}>
              Перейти к шаблонам
            </Button>
            <Button size="sm" onClick={reset}>
              Новая генерация
            </Button>
          </Group>
        </Stack>
      </Paper>
    );
  }

  const startFailure = start.isError ? failureOf(errorStatus(start.error), errorDetail(start.error), () => "") : null;

  return (
    <Paper withBorder p="md">
      <form onSubmit={submit} noValidate>
        <Stack gap="sm">
          <Text size="sm">
            Модель сама придумает событие и составит входящий звонок и карточку ДДС; вы проверите и опубликуете.
          </Text>
          {startFailure && (
            <Alert variant="outline" color="povDark2.6" title="Генерация не запущена">
              <Text size="sm">
                {startFailure.kind === "validation"
                  ? startFailure.issues.map((issue) => issue.message).join(" ")
                  : errorStatus(start.error) === undefined
                    ? "Сервис генерации недоступен. Соберите шаблон вручную."
                    : startFailure.message}
              </Text>
            </Alert>
          )}
          <Select
            size="sm"
            w={{ base: "100%", sm: 320 }}
            label="Основная служба"
            description="По ней выбирается тип происшествия"
            withAsterisk
            data={options}
            {...form.getInputProps("main")}
          />
          <Button
            size="xs"
            variant="outline"
            color="povDark2.6"
            w="fit-content"
            aria-expanded={advanced}
            onClick={() => setAdvanced((current) => !current)}
          >
            {advanced ? "Скрыть дополнительное" : "Дополнительно"}
          </Button>
          {advanced && (
            <MultiSelect
              size="xs"
              w={{ base: "100%", sm: 420 }}
              label="Другие службы ДДС"
              description="Необязательно: для каждой добавится своя карточка ДДС"
              data={options.filter((option) => option.value !== form.values.main)}
              maxValues={DISPATCHER_CODES.length - 1}
              {...form.getInputProps("others")}
            />
          )}
          <Group justify="flex-end">
            <Button size="sm" type="submit" loading={start.isPending}>
              Сгенерировать шаблоны
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}
