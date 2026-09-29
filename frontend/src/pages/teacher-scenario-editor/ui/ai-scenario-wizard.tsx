import { useCallback, useState } from "react";
import { Alert, Anchor, Group, Paper, Skeleton, Stack, Stepper, Text, Title } from "@mantine/core";
import { Link, useSearchParams } from "react-router-dom";
import {
  scenarioDraftFromTemplates,
  templateReviewProgress,
  templateState,
  useTemplateGeneration,
  type ScenarioDraft,
} from "@/entities/scenario";
import { GenerateTemplatesForm, generatedTemplatesOf } from "@/features/generate-templates";
import { TemplateReviewPanel } from "@/features/template-review";
import type { ScenarioTemplate, TemplateGenerationDto } from "@/shared/api";
import { Button } from "@/shared/ui";
import { ScenarioEditorForm } from "./scenario-editor-form";

const GENERATION_PARAM = "generation";
const SCENARIOS_PATH = "/teacher/scenarios";

interface ReviewStepProps {
  generation: TemplateGenerationDto;
  templates: ScenarioTemplate[];
  userId: string;
  returnTo: string;
  onCompose: (draft: ScenarioDraft) => void;
}

function ReviewStep({ generation, templates, userId, returnTo, onCompose }: ReviewStepProps) {
  const generated = generatedTemplatesOf(generation, templates);
  const call = generated.find((template) => template.kind === "call");
  const cards = generated.filter((template) => template.kind === "card");
  const published = generated.filter((template) => templateState(template) === "published").length;
  const ready = call !== undefined && cards.length > 0 && published === generated.length;

  if (generated.length === 0) {
    return (
      <Alert variant="outline" color="povDark2.6" title="Шаблоны генерации не найдены">
        <Text size="sm">Сервер завершил генерацию, но шаблонов нет в списке. Обновите страницу.</Text>
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <Stack gap={2}>
            <Title order={3} size="h5" fw={600}>
              Опубликовано {published} из {generated.length}
            </Title>
            <Text size="sm">
              Проверьте секции каждого черновика и опубликуйте его. Сценарий соберётся из опубликованных шаблонов: сначала
              звонок 112, затем карточки ДДС после создания карточки из вызова.
            </Text>
          </Stack>
          <Button
            size="sm"
            data-disabled={!ready || undefined}
            aria-disabled={!ready}
            onClick={(event) => {
              if (!ready || call === undefined) event.preventDefault();
              else onCompose(scenarioDraftFromTemplates(call, cards, generation.dds_service_codes));
            }}
          >
            Собрать сценарий
          </Button>
        </Group>
      </Paper>

      {generated.map((template) => {
        const progress = templateReviewProgress(template);

        return (
          <Stack key={template.id} gap="xs">
            <Group gap="sm" wrap="wrap">
              <Text size="sm" fw={600}>
                {template.name}
              </Text>
              <Anchor
                component={Link}
                to={`/teacher/scenarios/templates/${template.kind}/${template.id}`}
                target="_blank"
                rel="noopener"
                size="sm"
                c="povDark2.6"
                underline="always"
              >
                Открыть шаблон и эталон
              </Anchor>
            </Group>
            {templateState(template) === "published" ? (
              <Text size="sm" c="povDark2.6">
                Опубликован, проверено {progress.done} из {progress.total}.
              </Text>
            ) : (
              <TemplateReviewPanel template={template} userId={userId} returnTo={returnTo} onPublished={() => undefined} />
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

interface AiScenarioWizardProps {
  templates: ScenarioTemplate[];
  userId: string;
}

/**
 * Мастер сценария с ИИ: генерация шаблонов → проверка и публикация → сборка черновика.
 * Идентификатор генерации хранится в адресе: «Исправить» уводит в редактор черновика шаблона и
 * возвращает сюда по `returnTo`, и мастер продолжает с шага проверки, не теряя прогресс.
 */
export function AiScenarioWizard({ templates, userId }: AiScenarioWizardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const generationId = searchParams.get(GENERATION_PARAM);
  const generation = useTemplateGeneration(generationId);
  const [composed, setComposed] = useState<ScenarioDraft | null>(null);
  const completed = generation.data?.status === "COMPLETED" ? generation.data : null;
  const active = composed !== null ? 2 : completed !== null ? 1 : 0;
  const returnTo = `${SCENARIOS_PATH}/new?${searchParams.toString()}`;

  const start = useCallback(
    (created: TemplateGenerationDto) =>
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);

          next.set(GENERATION_PARAM, created.id);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  if (composed !== null) {
    return (
      <ScenarioEditorForm
        initial={composed}
        aiReview={null}
        aiOriginal={null}
        target={null}
        templates={templates}
        userId={userId}
        cancelPath={SCENARIOS_PATH}
        onReload={() => undefined}
      />
    );
  }

  return (
    <Stack gap="md">
      <Title order={2} size="h4" fw={600}>
        Сценарий с помощью ИИ
      </Title>
      <Stepper active={active} size="sm" allowNextStepsSelect={false}>
        <Stepper.Step label="Генерация" description="Звонок 112 и карточки ДДС" />
        <Stepper.Step label="Проверка" description="Секции и публикация" />
        <Stepper.Step label="Сценарий" description="Черновик в редакторе" />
      </Stepper>

      {generationId !== null && generation.isPending && <Skeleton height={160} radius={2} />}

      {generationId !== null && generation.isError && (
        <Alert variant="outline" color="povDark2.6" title="Генерация не найдена">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">Сервер не нашёл генерацию из адреса или не ответил.</Text>
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => setSearchParams({ ai: "1" })}>
              Начать заново
            </Button>
          </Stack>
        </Alert>
      )}

      {completed === null && !generation.isError && (generationId === null || !generation.isPending) && (
        <GenerateTemplatesForm userId={userId} initialService={null} onCompleted={start} />
      )}

      {completed !== null && (
        <ReviewStep generation={completed} templates={templates} userId={userId} returnTo={returnTo} onCompose={setComposed} />
      )}
    </Stack>
  );
}
