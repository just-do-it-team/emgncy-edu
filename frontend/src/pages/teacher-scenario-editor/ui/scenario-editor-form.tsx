import { useRef, useState } from "react";
import { Alert, Group, Modal, Stack, Text, Title, Tooltip } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { Link, useNavigate } from "react-router-dom";
import {
  aiApprovalBlock,
  aiReviewProgress,
  groupTemplates,
  hasErrors,
  itemLabel,
  saveAiReview,
  scenarioCreateBody,
  scenarioDurationSeconds,
  scenarioPathOf,
  scenarioServerIssue,
  scenarioUpdateBody,
  useCreateScenario,
  usePublishScenario,
  useRefreshTemplates,
  useUpdateScenario,
  validateScenarioDraft,
  withItemChecked,
  type AiReview,
  type DraftIssue,
  type SavedScenario,
  type ScenarioDraft,
} from "@/entities/scenario";
import {
  classificationFor,
  recordExists,
  serverFailure,
  useActiveServices,
} from "@/features/expected-result-form";
import { errorDetail, type ScenarioTemplate } from "@/shared/api";
import { errorMessages, focusFormField, formatDateTime, useLeaveGuard } from "@/shared/lib";
import { Button, IssuesList, LeaveConfirmModal, tooltipEvents } from "@/shared/ui";
import { useServiceNames } from "@/widgets/expected-result-view";
import { CompositionEditor, type ItemReview } from "./composition-editor";
import { ProceduralEditor } from "./procedural-editor";
import { ScenarioParams } from "./scenario-params";
import { ScenarioSummary } from "./scenario-summary";

const SCENARIOS_PATH = "/teacher/scenarios";
const COPY_SUFFIX = " (копия)";
const MAX_NAME_LENGTH = 255;

export interface ScenarioTarget {
  scenarioId: string;
  revision: number;
}

interface ScenarioEditorFormProps {
  initial: ScenarioDraft;
  aiReview: AiReview | null;
  aiOriginal: ScenarioDraft | null;
  target: ScenarioTarget | null;
  templates: ScenarioTemplate[];
  userId: string;
  cancelPath: string;
  onReload: () => void;
}

export function ScenarioEditorForm({
  initial,
  aiReview,
  aiOriginal,
  target,
  templates,
  userId,
  cancelPath,
  onReload,
}: ScenarioEditorFormProps) {
  const navigate = useNavigate();
  const services = useActiveServices();
  const serviceNames = useServiceNames();
  const create = useCreateScenario();
  const update = useUpdateScenario();
  const publish = usePublishScenario();
  const refreshTemplates = useRefreshTemplates();
  const [checking, setChecking] = useState(false);
  const revision = useRef(target?.revision ?? null);
  const saving = useRef(false);
  const [issues, setIssues] = useState<DraftIssue[] | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [saved, setSaved] = useState(false);
  const [review, setReview] = useState(aiReview);
  const form = useForm<ScenarioDraft>({ initialValues: initial });
  const guard = useLeaveGuard(form.isDirty() && !saved);
  const draft = form.values;
  const activeServices = services.data ? new Set(services.data.map((service) => service.code)) : null;
  const contextOf = (list: ScenarioTemplate[]) => ({
    recordExists,
    activeServices,
    templates: new Map(list.map((template) => [template.id, template])),
    cardTemplates: list.filter((template) => template.kind === "card"),
  });
  const context = contextOf(templates);
  const { templates: templatesById, cardTemplates } = context;
  const entries = groupTemplates(templates);
  const liveIssues = issues === null ? null : validateScenarioDraft(draft, context);
  const durationSeconds = scenarioDurationSeconds(draft);
  const busy = checking || create.isPending || update.isPending || publish.isPending;
  const itemIssueOf = (error: unknown) => {
    const detail = errorDetail(error);

    return typeof detail === "string" ? scenarioServerIssue(detail, draft.items, templatesById) : null;
  };
  const itemKeys = draft.items.map((item) => item.key);
  const labelOf = (key: string) => itemLabel(draft.items, itemKeys.indexOf(key));
  const approvalBlock = aiApprovalBlock(review, itemKeys, labelOf);
  const progress = review === null ? null : aiReviewProgress(review, itemKeys);
  const itemReview: ItemReview | null =
    review === null
      ? null
      : {
          requiredKeys: new Set(review.itemKeys),
          checkedKeys: new Set(review.checkedKeys),
          generated: new Map((aiOriginal?.items ?? []).map((item) => [item.key, item])),
          onCheck: (key, checked) => setReview(withItemChecked(review, key, checked)),
        };

  const focus = (path: string) => focusFormField(path === "" ? null : form.getInputNode(path));

  const report = (next: DraftIssue[]) => {
    setIssues(next);
    form.setErrors(errorMessages(next));

    const first = next.find((issue) => issue.severity === "error");

    if (first) requestAnimationFrame(() => focus(first.path));
  };

  const finish = (scenario: SavedScenario, title: string) => {
    setSaved(true);
    if (review !== null) saveAiReview(scenario.id, review);
    notifications.show({ title, message: draft.name.trim(), color: "gray" });
    navigate(`${SCENARIOS_PATH}/${scenario.id}`);
  };

  const publishSaved = (scenario: SavedScenario) =>
    publish.mutate(
      { scenarioId: scenario.id, revision: scenario.revision, userId },
      {
        onSuccess: () => finish(scenario, "Сценарий сохранён и утверждён"),
        onError: (error) => {
          const failure = serverFailure(error, scenarioPathOf);
          const itemIssue = itemIssueOf(error);

          setSaved(true);
          if (review !== null) saveAiReview(scenario.id, review);
          notifications.show({
            title: "Черновик сохранён, но не утверждён",
            message:
              itemIssue !== null
                ? itemIssue.message
                : failure.kind === "validation"
                  ? failure.issues.map((issue) => issue.message).join(" ")
                  : failure.message,
            color: "orange",
          });
          navigate(`${SCENARIOS_PATH}/${scenario.id}`);
        },
      },
    );

  const fail = (error: unknown, found: DraftIssue[]) => {
    const failure = serverFailure(error, scenarioPathOf);

    if (failure.kind === "conflict") {
      setConflict(true);
      return;
    }
    if (failure.kind === "validation") {
      const itemIssue = itemIssueOf(error);

      report([...found.filter((issue) => issue.severity === "warning"), ...(itemIssue ? [itemIssue] : failure.issues)]);
      if (itemIssue) void refreshTemplates();
      return;
    }
    if (failure.kind === "forbidden") {
      notifications.show({ title: "Сценарий не сохранён", message: failure.message, color: "red" });
      onReload();
      return;
    }

    notifications.show({ title: "Сценарий не сохранён", message: failure.message, color: "red" });
  };

  const save = async (andPublish: boolean) => {
    if (andPublish && approvalBlock !== null) return;
    // Кнопка блокируется только после перерисовки, а проверка шаблонов асинхронная: без флага второй
    // клик успевает отправить тот же PATCH с той же ревизией и получает 409.
    if (saving.current) return;
    saving.current = true;

    setChecking(true);
    const fresh = await refreshTemplates().catch(() => templates);
    setChecking(false);

    const found = validateScenarioDraft(draft, contextOf(fresh));

    if (hasErrors(found)) {
      saving.current = false;
      report(found);
      return;
    }

    setIssues(found);
    form.clearErrors();

    const onSuccess = (scenario: SavedScenario) => {
      revision.current = scenario.revision;
      saving.current = false;
      if (andPublish) publishSaved(scenario);
      else finish(scenario, target === null ? "Сценарий создан" : "Черновик сохранён");
    };
    const onError = (error: unknown) => {
      saving.current = false;
      fail(error, found);
    };

    if (target === null || revision.current === null) {
      create.mutate(scenarioCreateBody(draft, classificationFor, durationSeconds, userId), { onSuccess, onError });
      return;
    }

    update.mutate(
      {
        scenarioId: target.scenarioId,
        body: scenarioUpdateBody(draft, classificationFor, durationSeconds, userId, revision.current),
      },
      { onSuccess, onError },
    );
  };

  const saveAsCopy = () => {
    const name = `${draft.name.trim().slice(0, MAX_NAME_LENGTH - COPY_SUFFIX.length)}${COPY_SUFFIX}`;

    setConflict(false);
    create.mutate(scenarioCreateBody({ ...draft, name }, classificationFor, durationSeconds, userId), {
      onSuccess: (scenario) => finish(scenario, "Правки сохранены как копия"),
      onError: (error) => fail(error, []),
    });
  };

  const reload = () => {
    setConflict(false);
    onReload();
  };

  return (
    <Stack gap="md">
      <Title order={2} size="h4" fw={600}>
        {target === null ? "Новый сценарий" : `Редактирование: ${initial.name}`}
      </Title>

      {review !== null && progress !== null && (
        <Alert variant="outline" color="povDark2.6" title="Сгенерировано ИИ — проверьте эталон перед утверждением">
          <Stack gap={4}>
            <Text size="sm">
              Проверено {progress.checked} из {progress.total}. Отметьте «Эталон проверен» у каждого элемента, когда
              сверите карточку, службы и статусы. Пока проверены не все, сценарий нельзя утвердить и назначить
              обучаемым. Неизменённые предложения модели подписаны «предложено ИИ».
            </Text>
            <Text size="xs" c="povDark2.6">
              Модель {review.model}, {formatDateTime(review.generatedAt)}
            </Text>
          </Stack>
        </Alert>
      )}

      <ScenarioParams
        form={form}
        aiOriginal={aiOriginal}
        suggestedDifficulty={review?.suggestedDifficulty ?? null}
        services={services.data ?? []}
        templates={templatesById}
      />

      <CompositionEditor
        form={form}
        aiReview={itemReview}
        templates={templatesById}
        entries={entries}
        services={services.data ?? []}
        serviceNames={serviceNames}
        errors={errorMessages(liveIssues ?? [])}
      />

      <ProceduralEditor form={form} cardTemplates={cardTemplates} />

      <ScenarioSummary draft={draft} templates={templatesById} />

      {liveIssues && <IssuesList issues={liveIssues} blockingTitle="Нельзя сохранить" onFocus={focus} />}

      <Group justify="flex-end" gap="xs">
        <Button size="sm" variant="outline" color="povDark2.6" component={Link} to={cancelPath}>
          Отмена
        </Button>
        <Tooltip label={approvalBlock} disabled={approvalBlock === null} events={tooltipEvents} multiline w={320} color="povDark.6" radius={0}>
          <Button
            size="sm"
            variant="outline"
            color="povDark2.6"
            loading={busy}
            data-disabled={approvalBlock !== null || undefined}
            aria-disabled={approvalBlock !== null}
            onClick={(event) => {
              if (approvalBlock !== null) event.preventDefault();
              else setConfirmPublish(true);
            }}
          >
            Сохранить и утвердить
          </Button>
        </Tooltip>
        <Button size="sm" loading={busy} onClick={() => void save(false)}>
          Сохранить черновик
        </Button>
      </Group>

      <Modal
        opened={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        title="Сохранить и утвердить"
        centered
        radius={2}
        transitionProps={{ duration: 0 }}
      >
        <Stack gap="sm">
          <Text size="sm">
            Утверждённый сценарий можно назначать обучаемым. Чтобы снова его править, верните его в черновик из
            карточки сценария.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button size="sm" variant="outline" color="povDark2.6" onClick={() => setConfirmPublish(false)}>
              Отмена
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setConfirmPublish(false);
                void save(true);
              }}
            >
              Утвердить
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={conflict}
        onClose={() => setConflict(false)}
        title="Сценарий изменён на сервере"
        centered
        radius={2}
        transitionProps={{ duration: 0 }}
      >
        <Stack gap="sm">
          <Text size="sm">
            Пока вы редактировали, сценарий сохранили в другой вкладке или его утвердили. Ваши правки пока не потеряны:
            можно сохранить их отдельным сценарием либо загрузить актуальную версию.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button size="sm" variant="outline" color="povDark2.6" onClick={reload}>
              Перезагрузить (правки будут потеряны)
            </Button>
            <Button size="sm" loading={create.isPending} onClick={saveAsCopy}>
              Сохранить мои правки как копию
            </Button>
          </Group>
        </Stack>
      </Modal>

      <LeaveConfirmModal opened={guard.pendingPath !== null} onStay={guard.stay} onLeave={guard.leave} />
    </Stack>
  );
}
