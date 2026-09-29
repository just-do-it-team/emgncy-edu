import { Alert, Anchor, Group, Paper, Skeleton, Stack, Text, Title } from "@mantine/core";
import { Link, useParams } from "react-router-dom";
import { classifierRecords } from "@/entities/incident";
import {
  activeUsages,
  difficultyLabel,
  groupTemplates,
  isAiDraft,
  templateState,
  templateStateLabels,
  templateUsages,
  templateVariantLabels,
  useScenarios,
  useTemplate,
  useTemplates,
} from "@/entities/scenario";
import { useSessionStore } from "@/entities/session";
import { TemplateReviewPanel } from "@/features/template-review";
import { errorStatus, type ScenarioTemplate, type ScenarioTemplateKind } from "@/shared/api";
import { formatDateTime } from "@/shared/lib";
import { Button, Fact } from "@/shared/ui";
import {
  ExpectedResultView,
  InitialCallView,
  InitialCardView,
  useServiceNames,
} from "@/widgets/expected-result-view";
import { DeactivateTemplate } from "./deactivate-template";
import { TemplateUsageTable, TemplateVersions } from "./template-usage";
import { UpgradeDrafts } from "./upgrade-drafts";

const NOT_FOUND_STATUSES = new Set([404, 422]);

function isKind(value: string | undefined): value is ScenarioTemplateKind {
  return value === "card" || value === "call";
}

function typeName(template: ScenarioTemplate): string {
  if (template.recordId === null) return "не задан";

  return classifierRecords.find((record) => record.id === template.recordId)?.name ?? "не найден в классификаторе";
}

interface TemplateCardProps {
  template: ScenarioTemplate;
  teacherId: string;
}

function TemplateCard({ template, teacherId }: TemplateCardProps) {
  const templates = useTemplates();
  const scenarios = useScenarios();
  const serviceNames = useServiceNames();
  const entry = groupTemplates(templates.data ?? []).find(
    (candidate) => candidate.latest.kind === template.kind && candidate.templateKey === template.templateKey,
  );
  const usages = entry && scenarios.data ? templateUsages(entry, scenarios.data) : null;
  const blockingUsages = usages && activeUsages(usages).filter((usage) => usage.templateId === template.id);
  const own = template.createdBy === teacherId;
  const latest = entry?.latest;
  const isCall = template.kind === "call";
  const aiDraft = isAiDraft(template);

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
            <Stack gap={4}>
              <Title order={2} size="h4" fw={600}>
                {template.name}
              </Title>
              {template.description && <Text size="sm">{template.description}</Text>}
            </Stack>
            <Group gap="xs">
              {own && aiDraft && (
                <Button size="sm" component={Link} to={`/teacher/scenarios/templates/${template.kind}/${template.id}/edit`}>
                  Исправить черновик
                </Button>
              )}
              {own && !aiDraft && latest?.id === template.id && (
                <Button
                  size="sm"
                  component={Link}
                  to={`/teacher/scenarios/templates/${template.kind}/${template.id}/new-version`}
                >
                  Создать новую версию
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                color="povDark2.6"
                component={Link}
                to={`/teacher/scenarios/templates/new?variant=${template.variant}&from=${template.kind}:${template.id}`}
              >
                Создать копию
              </Button>
              {own && template.isActive && (
                <DeactivateTemplate template={template} userId={teacherId} blockingUsages={blockingUsages} />
              )}
            </Group>
          </Group>

          <Group gap="xl" align="flex-start" wrap="wrap">
            <Fact label="Вид">{templateVariantLabels[template.variant]}</Fact>
            <Fact label="Тип происшествия">{typeName(template)}</Fact>
            <Fact label="Сложность">{difficultyLabel(template.difficulty)}</Fact>
            <Fact label="Версия">{latest ? `${template.version} из ${latest.version}` : template.version}</Fact>
            <Fact label="Статус">{templateStateLabels[templateState(template)]}</Fact>
            <Fact label="Автор">{own ? "Вы" : (template.createdByName ?? "Другой преподаватель")}</Fact>
            <Fact label="Создана">{formatDateTime(template.createdAt)}</Fact>
          </Group>

          {latest && latest.id !== template.id && (
            <Text size="sm" c="povDark2.6">
              Открыта версия {template.version}, есть более новая —{" "}
              <Anchor
                component={Link}
                to={`/teacher/scenarios/templates/${latest.kind}/${latest.id}`}
                size="sm"
                c="povDark2.6"
                underline="always"
              >
                версия {latest.version}
              </Anchor>
              .
            </Text>
          )}
          {!own && (
            <Text size="xs" c="povDark2.6">
              Шаблон создан другим преподавателем: новую версию и деактивацию делает только автор. Можно создать свою
              копию.
            </Text>
          )}
        </Stack>
      </Paper>

      {aiDraft && own && <TemplateReviewPanel template={template} userId={teacherId} returnTo={null} onPublished={() => undefined} />}

      {aiDraft && !own && (
        <Text size="sm" c="povDark2.6">
          Черновик ИИ другого преподавателя: проверяет и публикует его автор.
        </Text>
      )}

      <Stack gap="sm">
        <Title order={3} size="h5" fw={600}>
          {isCall ? "Исходный звонок" : "Исходная карточка"}
        </Title>
        {isCall && template.initialCall && <InitialCallView call={template.initialCall} />}
        {!isCall && template.initialCard && <InitialCardView card={template.initialCard} serviceNames={serviceNames} />}
      </Stack>

      <Stack gap="sm">
        <Title order={3} size="h5" fw={600}>
          Эталон
        </Title>
        <ExpectedResultView
          itemType={isCall ? "INCOMING_CALL" : "INCIDENT_CARD"}
          sourceType="TEMPLATE"
          expectedResult={template.expectedResult}
          fallbackCard={null}
          problem={null}
          serviceNames={serviceNames}
        />
      </Stack>

      {entry && <TemplateVersions entry={entry} currentId={template.id} teacherId={teacherId} />}

      <TemplateUsageTable usages={usages} latestVersion={latest?.version ?? template.version} />
      {latest && usages && (
        <UpgradeDrafts latest={latest} usages={usages} teacherId={teacherId} onConflict={() => void scenarios.refetch()} />
      )}
    </Stack>
  );
}

function TemplateScreen({ kind, templateId, teacherId }: { kind: ScenarioTemplateKind; templateId: string; teacherId: string }) {
  const template = useTemplate({ kind, templateId });

  if (template.isPending) {
    return (
      <Stack gap="md">
        <Skeleton height={140} radius={2} />
        <Skeleton height={240} radius={2} />
      </Stack>
    );
  }

  if (template.isError) {
    const status = errorStatus(template.error);
    const notFound = status !== undefined && NOT_FOUND_STATUSES.has(status);

    return (
      <Alert variant="outline" color="povDark2.6" title={notFound ? "Шаблон не найден" : "Не удалось загрузить шаблон"}>
        <Stack gap="xs" align="flex-start">
          <Text size="sm">
            {notFound ? "Шаблон удалён или адрес неверный." : "Сервер не ответил. Повторите запрос позже."}
          </Text>
          <Button size="xs" variant="outline" color="povDark2.6" onClick={() => template.refetch()}>
            Повторить
          </Button>
        </Stack>
      </Alert>
    );
  }

  return <TemplateCard template={template.data} teacherId={teacherId} />;
}

const TeacherTemplateCardPage = () => {
  const { kind, templateId = "" } = useParams();
  const teacherId = useSessionStore((state) => state.profile?.userId ?? null);

  if (teacherId === null) return null;

  if (!isKind(kind)) {
    return (
      <Alert variant="outline" color="povDark2.6" title="Шаблон не найден">
        <Text size="sm">Адрес шаблона неверный.</Text>
      </Alert>
    );
  }

  return <TemplateScreen kind={kind} templateId={templateId} teacherId={teacherId} />;
};

export default TeacherTemplateCardPage;
