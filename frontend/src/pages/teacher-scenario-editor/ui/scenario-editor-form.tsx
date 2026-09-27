import { useState } from "react";
import { Group, Modal, Stack, Text, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { Link, useNavigate } from "react-router-dom";
import {
  estimateDurationSeconds,
  groupTemplates,
  hasErrors,
  scenarioCreateBody,
  scenarioPathOf,
  scenarioUpdateBody,
  useCreateScenario,
  usePublishScenario,
  useUpdateScenario,
  validateScenarioDraft,
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
import type { ScenarioTemplate } from "@/shared/api";
import { CARD_OPEN_NORM_SECONDS, FIRST_ENTRY_NORM_SECONDS, PROCEDURAL_PACE_BY_DIFFICULTY } from "@/shared/config";
import { errorMessages, focusFormField, useLeaveGuard } from "@/shared/lib";
import { Button, IssuesList, LeaveConfirmModal } from "@/shared/ui";
import { useServiceNames } from "@/widgets/expected-result-view";
import { CompositionEditor } from "./composition-editor";
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
  target: ScenarioTarget | null;
  templates: ScenarioTemplate[];
  userId: string;
  cancelPath: string;
  onReload: () => void;
}

function durationOf(draft: ScenarioDraft): number {
  const pace = PROCEDURAL_PACE_BY_DIFFICULTY.get(draft.difficulty);

  return estimateDurationSeconds(draft, {
    cardReactionSeconds: CARD_OPEN_NORM_SECONDS + FIRST_ENTRY_NORM_SECONDS,
    proceduralInitialDelaySeconds: pace?.initialDelaySeconds ?? 0,
    proceduralIntervalSeconds: pace?.releaseIntervalSeconds ?? 0,
  });
}

export function ScenarioEditorForm({ initial, target, templates, userId, cancelPath, onReload }: ScenarioEditorFormProps) {
  const navigate = useNavigate();
  const services = useActiveServices();
  const serviceNames = useServiceNames();
  const create = useCreateScenario();
  const update = useUpdateScenario();
  const publish = usePublishScenario();
  const [baseRevision] = useState(target?.revision ?? null);
  const [issues, setIssues] = useState<DraftIssue[] | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [saved, setSaved] = useState(false);
  const form = useForm<ScenarioDraft>({ initialValues: initial });
  const guard = useLeaveGuard(form.isDirty() && !saved);
  const draft = form.values;
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const entries = groupTemplates(templates);
  const cardTemplates = templates.filter((template) => template.kind === "card");
  const activeServices = services.data ? new Set(services.data.map((service) => service.code)) : null;
  const context = { recordExists, activeServices, templates: templatesById, cardTemplates };
  const liveIssues = issues === null ? null : validateScenarioDraft(draft, context);
  const durationSeconds = durationOf(draft);
  const busy = create.isPending || update.isPending || publish.isPending;

  const focus = (path: string) => focusFormField(path === "" ? null : form.getInputNode(path));

  const report = (next: DraftIssue[]) => {
    setIssues(next);
    form.setErrors(errorMessages(next));

    const first = next.find((issue) => issue.severity === "error");

    if (first) requestAnimationFrame(() => focus(first.path));
  };

  const finish = (scenario: SavedScenario, title: string) => {
    setSaved(true);
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

          setSaved(true);
          notifications.show({
            title: "Черновик сохранён, но не утверждён",
            message:
              failure.kind === "validation"
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
      report([...found.filter((issue) => issue.severity === "warning"), ...failure.issues]);
      return;
    }
    if (failure.kind === "forbidden") {
      notifications.show({ title: "Сценарий не сохранён", message: failure.message, color: "red" });
      onReload();
      return;
    }

    notifications.show({ title: "Сценарий не сохранён", message: failure.message, color: "red" });
  };

  const save = (andPublish: boolean) => {
    const found = validateScenarioDraft(draft, context);

    if (hasErrors(found)) {
      report(found);
      return;
    }

    setIssues(found);
    form.clearErrors();

    const onSuccess = (scenario: SavedScenario) =>
      andPublish ? publishSaved(scenario) : finish(scenario, target === null ? "Сценарий создан" : "Черновик сохранён");
    const onError = (error: unknown) => fail(error, found);

    if (target === null || baseRevision === null) {
      create.mutate(scenarioCreateBody(draft, classificationFor, durationSeconds, userId), { onSuccess, onError });
      return;
    }

    update.mutate(
      {
        scenarioId: target.scenarioId,
        body: scenarioUpdateBody(draft, classificationFor, durationSeconds, userId, baseRevision),
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

      <ScenarioParams form={form} services={services.data ?? []} templates={templatesById} />

      <CompositionEditor
        form={form}
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
        <Button size="sm" variant="outline" color="povDark2.6" loading={busy} onClick={() => setConfirmPublish(true)}>
          Сохранить и утвердить
        </Button>
        <Button size="sm" loading={busy} onClick={() => save(false)}>
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
                save(true);
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
