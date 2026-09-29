import { Alert, Anchor, Skeleton, Stack, Text } from "@mantine/core";
import { Link, useMatch, useParams, useSearchParams } from "react-router-dom";
import {
  emptyTemplateDraft,
  groupTemplates,
  isAiDraft,
  isReviewSection,
  reviewSectionsOf,
  templateDraftFromTemplate,
  useTemplate,
  useTemplates,
  type TemplateDraft,
} from "@/entities/scenario";
import { useSessionStore } from "@/entities/session";
import type { ScenarioTemplateKind, TemplateVariant } from "@/shared/api";
import { safeReturnPath } from "@/shared/config";
import { Button } from "@/shared/ui";
import { TemplateEditorForm } from "./template-editor-form";

const TEMPLATES_PATH = "/teacher/scenarios/templates";
const DRAFT_EDIT_PATTERN = `${TEMPLATES_PATH}/:kind/:templateId/edit`;
const COPY_SUFFIX = " (копия)";

function isVariant(value: string | null): value is TemplateVariant {
  return value === "call" || value === "card112" || value === "cardDds";
}

function isKind(value: string | undefined): value is ScenarioTemplateKind {
  return value === "card" || value === "call";
}

function parseSource(value: string | null): { kind: ScenarioTemplateKind; templateId: string } | null {
  const [kind, templateId] = value?.split(":") ?? [];

  return isKind(kind) && templateId ? { kind, templateId } : null;
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить шаблон">
      <Stack gap="xs" align="flex-start">
        <Text size="sm">Шаблон удалён, адрес неверный или сервер не ответил.</Text>
        <Button size="xs" variant="outline" color="povDark2.6" onClick={onRetry}>
          Повторить
        </Button>
      </Stack>
    </Alert>
  );
}

function CopyEditor({ source, userId }: { source: { kind: ScenarioTemplateKind; templateId: string }; userId: string }) {
  const template = useTemplate(source);

  if (template.isPending) return <Skeleton height={320} radius={2} />;
  if (template.isError) return <LoadError onRetry={() => template.refetch()} />;

  const draft: TemplateDraft = { ...templateDraftFromTemplate(template.data), name: `${template.data.name}${COPY_SUFFIX}` };

  return (
    <TemplateEditorForm
      initial={draft}
      target={{ templateKey: null, version: 1, previousVersion: null }}
      draftOf={null}
      userId={userId}
      cancelPath={`${TEMPLATES_PATH}/${source.kind}/${source.templateId}`}
    />
  );
}

function NewVersionEditor({ kind, templateId, userId }: { kind: ScenarioTemplateKind; templateId: string; userId: string }) {
  const template = useTemplate({ kind, templateId });
  const templates = useTemplates();

  if (template.isPending || templates.isPending) return <Skeleton height={320} radius={2} />;
  if (template.isError) return <LoadError onRetry={() => template.refetch()} />;
  if (templates.isError) return <LoadError onRetry={() => templates.refetch()} />;

  const cardPath = `${TEMPLATES_PATH}/${kind}/${templateId}`;

  if (template.data.createdBy !== userId) {
    return (
      <Alert variant="outline" color="povDark2.6" title="Новую версию создаёт только автор">
        <Stack gap="xs" align="flex-start">
          <Text size="sm">Шаблон создан другим преподавателем. Можно создать свою копию и изменить её.</Text>
          <Anchor
            component={Link}
            to={`${TEMPLATES_PATH}/new?variant=${template.data.variant}&from=${kind}:${templateId}`}
            size="sm"
            c="povDark2.6"
            underline="always"
          >
            Создать копию
          </Anchor>
        </Stack>
      </Alert>
    );
  }

  if (isAiDraft(template.data)) {
    return (
      <Alert variant="outline" color="povDark2.6" title="Черновик ИИ правится на месте">
        <Stack gap="xs" align="flex-start">
          <Text size="sm">Новая версия создаётся от опубликованного шаблона. Черновик исправьте и опубликуйте.</Text>
          <Anchor component={Link} to={`${cardPath}/edit`} size="sm" c="povDark2.6" underline="always">
            Исправить черновик
          </Anchor>
        </Stack>
      </Alert>
    );
  }

  const entry = groupTemplates(templates.data).find(
    (candidate) => candidate.latest.kind === kind && candidate.templateKey === template.data.templateKey,
  );
  const latestVersion = entry?.latest.version ?? template.data.version;

  return (
    <TemplateEditorForm
      initial={templateDraftFromTemplate(template.data)}
      target={{ templateKey: template.data.templateKey, version: latestVersion + 1, previousVersion: latestVersion }}
      draftOf={null}
      userId={userId}
      cancelPath={cardPath}
    />
  );
}

interface DraftEditorProps {
  kind: ScenarioTemplateKind;
  templateId: string;
  userId: string;
  sectionsParam: string | null;
  returnPath: string | null;
}

function DraftEditor({ kind, templateId, userId, sectionsParam, returnPath }: DraftEditorProps) {
  const template = useTemplate({ kind, templateId });

  if (template.isPending) return <Skeleton height={320} radius={2} />;
  if (template.isError) return <LoadError onRetry={() => template.refetch()} />;

  const cardPath = `${TEMPLATES_PATH}/${kind}/${templateId}`;

  if (template.data.createdBy !== userId || !isAiDraft(template.data)) {
    return (
      <Alert variant="outline" color="povDark2.6" title="Черновик не редактируется">
        <Stack gap="xs" align="flex-start">
          <Text size="sm">
            На месте правится только свой черновик ИИ. Опубликованный шаблон меняется новой версией, чужой — через копию.
          </Text>
          <Anchor component={Link} to={cardPath} size="sm" c="povDark2.6" underline="always">
            Открыть карточку шаблона
          </Anchor>
        </Stack>
      </Alert>
    );
  }

  const allowed = new Set(reviewSectionsOf(template.data));
  const sections = (sectionsParam ?? "").split(",").filter(isReviewSection).filter((section) => allowed.has(section));

  return (
    <TemplateEditorForm
      initial={templateDraftFromTemplate(template.data)}
      target={{ templateKey: template.data.templateKey, version: template.data.version, previousVersion: null }}
      draftOf={{ template: template.data, sections, returnPath }}
      userId={userId}
      cancelPath={returnPath ?? cardPath}
    />
  );
}

const TeacherTemplateEditorPage = () => {
  const { kind, templateId } = useParams();
  const [searchParams] = useSearchParams();
  const userId = useSessionStore((state) => state.profile?.userId ?? null);
  const draftEdit = useMatch(DRAFT_EDIT_PATTERN) !== null;

  if (userId === null) return null;

  if (templateId !== undefined && draftEdit) {
    return isKind(kind) ? (
      <DraftEditor
        key={templateId}
        kind={kind}
        templateId={templateId}
        userId={userId}
        sectionsParam={searchParams.get("sections")}
        returnPath={safeReturnPath(searchParams.get("returnTo"), "teacher")}
      />
    ) : (
      <Alert variant="outline" color="povDark2.6" title="Шаблон не найден">
        <Text size="sm">Адрес шаблона неверный.</Text>
      </Alert>
    );
  }

  if (templateId !== undefined) {
    return isKind(kind) ? (
      <NewVersionEditor kind={kind} templateId={templateId} userId={userId} />
    ) : (
      <Alert variant="outline" color="povDark2.6" title="Шаблон не найден">
        <Text size="sm">Адрес шаблона неверный.</Text>
      </Alert>
    );
  }

  const source = parseSource(searchParams.get("from"));

  if (source) return <CopyEditor key={`${source.kind}:${source.templateId}`} source={source} userId={userId} />;

  const variantParam = searchParams.get("variant");
  const variant = isVariant(variantParam) ? variantParam : "call";

  return (
    <TemplateEditorForm
      key={variant}
      initial={emptyTemplateDraft(variant)}
      target={{ templateKey: null, version: 1, previousVersion: null }}
      draftOf={null}
      userId={userId}
      cancelPath={TEMPLATES_PATH}
    />
  );
};

export default TeacherTemplateEditorPage;
