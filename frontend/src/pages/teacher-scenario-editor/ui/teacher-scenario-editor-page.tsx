import { useState } from "react";
import { Alert, Anchor, Skeleton, Stack, Text, Title } from "@mantine/core";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { emptyScenarioDraft, loadAiReview, scenarioDraftFromDetail, useScenario, useTemplates } from "@/entities/scenario";
import { useSessionStore } from "@/entities/session";
import { GenerateScenarioForm, type GeneratedScenario } from "@/features/generate-scenario";
import type { ScenarioTemplate } from "@/shared/api";
import { Button } from "@/shared/ui";
import { mocks } from "@/shared/config";
import { AiScenarioWizard } from "./ai-scenario-wizard";
import { ScenarioEditorForm } from "./scenario-editor-form";

const SCENARIOS_PATH = "/teacher/scenarios";
const GENERATE_PARAM = "ai";

function LoadError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <Alert variant="outline" color="povDark2.6" title={title}>
      <Stack gap="xs" align="flex-start">
        <Text size="sm">Данные удалены, адрес неверный или сервер не ответил.</Text>
        <Button size="xs" variant="outline" color="povDark2.6" onClick={onRetry}>
          Повторить
        </Button>
      </Stack>
    </Alert>
  );
}

function Refusal({ title, text, scenarioId }: { title: string; text: string; scenarioId: string }) {
  return (
    <Alert variant="outline" color="povDark2.6" title={title}>
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{text}</Text>
        <Anchor component={Link} to={`${SCENARIOS_PATH}/${scenarioId}`} size="sm" c="povDark2.6" underline="always">
          Открыть карточку сценария
        </Anchor>
      </Stack>
    </Alert>
  );
}

interface ExistingEditorProps {
  scenarioId: string;
  templates: ScenarioTemplate[];
  userId: string;
}

function ExistingEditor({ scenarioId, templates, userId }: ExistingEditorProps) {
  const scenario = useScenario(scenarioId);
  const [generation, setGeneration] = useState(0);

  if (scenario.isPending) return <Skeleton height={320} radius={2} />;
  if (scenario.isError) return <LoadError title="Не удалось загрузить сценарий" onRetry={() => scenario.refetch()} />;

  const detail = scenario.data;

  if (detail.createdBy !== userId) {
    return (
      <Refusal
        title="Редактирует только автор"
        text="Сценарий создан другим преподавателем. В карточке сценария можно создать свою копию и изменить её."
        scenarioId={scenarioId}
      />
    );
  }

  if (detail.status !== "DRAFT") {
    return (
      <Refusal
        title="Сценарий не редактируется"
        text="Править можно только черновик. Утверждённый или архивный сценарий меняется через копию."
        scenarioId={scenarioId}
      />
    );
  }

  return (
    <ScenarioEditorForm
      key={generation}
      initial={scenarioDraftFromDetail(detail)}
      aiReview={loadAiReview(scenarioId)}
      aiOriginal={null}
      target={{ scenarioId, revision: detail.revision }}
      templates={templates}
      userId={userId}
      cancelPath={`${SCENARIOS_PATH}/${scenarioId}`}
      onReload={() => void scenario.refetch().then(() => setGeneration((current) => current + 1))}
    />
  );
}

interface GeneratedEditorProps {
  templates: ScenarioTemplate[];
  userId: string;
}

function LegacyGeneratedEditor({ templates, userId }: GeneratedEditorProps) {
  const [generated, setGenerated] = useState<GeneratedScenario | null>(null);

  if (generated === null) {
    return (
      <Stack gap="md">
        <Title order={2} size="h4" fw={600}>
          Сценарий с помощью ИИ
        </Title>
        <GenerateScenarioForm teacherId={userId} onGenerated={setGenerated} />
      </Stack>
    );
  }

  return (
    <ScenarioEditorForm
      initial={generated.draft}
      aiReview={generated.review}
      aiOriginal={generated.draft}
      target={null}
      templates={templates}
      userId={userId}
      cancelPath={SCENARIOS_PATH}
      onReload={() => undefined}
    />
  );
}

const TeacherScenarioEditorPage = () => {
  const { scenarioId } = useParams();
  const [searchParams] = useSearchParams();
  const userId = useSessionStore((state) => state.profile?.userId ?? null);
  const templates = useTemplates();

  if (userId === null) return null;
  if (templates.isPending) return <Skeleton height={320} radius={2} />;
  if (templates.isError) {
    return <LoadError title="Не удалось загрузить библиотеку шаблонов" onRetry={() => templates.refetch()} />;
  }

  if (scenarioId !== undefined) {
    return <ExistingEditor key={scenarioId} scenarioId={scenarioId} templates={templates.data} userId={userId} />;
  }

  if (searchParams.get(GENERATE_PARAM) !== null) {
    return mocks.legacyAiScenario ? (
      <LegacyGeneratedEditor templates={templates.data} userId={userId} />
    ) : (
      <AiScenarioWizard templates={templates.data} userId={userId} />
    );
  }

  return (
    <ScenarioEditorForm
      initial={emptyScenarioDraft}
      aiReview={null}
      aiOriginal={null}
      target={null}
      templates={templates.data}
      userId={userId}
      cancelPath={SCENARIOS_PATH}
      onReload={() => undefined}
    />
  );
};

export default TeacherScenarioEditorPage;
