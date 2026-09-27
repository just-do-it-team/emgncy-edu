import { useState } from "react";
import { Group, List, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import {
  scenarioItemLabels,
  useArchiveScenario,
  useCopyScenario,
  usePublishScenario,
} from "@/entities/scenario";
import type { ScenarioDetail } from "@/shared/api";
import { Button } from "@/shared/ui";
import { scenarioActionError } from "../model/action-error";

type PendingAction = "publish" | "archive";

const confirmations: Record<PendingAction, { title: string; text: string; confirm: string }> = {
  publish: {
    title: "Утвердить сценарий",
    text: "Утверждённый сценарий можно назначать обучаемым. Править его сервер не позволяет, а снять утверждение пока нельзя: для правок создайте копию.",
    confirm: "Утвердить",
  },
  archive: {
    title: "Перенести сценарий в архив",
    text: "Сценарий пропадёт из списка по умолчанию, и его нельзя будет назначить. Уже назначенные занятия не пострадают: у них сохранён снимок сценария.",
    confirm: "В архив",
  },
};

interface ScenarioActionsProps {
  scenario: ScenarioDetail;
  userId: string;
  own: boolean;
  onConflict: () => void;
}

export function ScenarioActions({ scenario, userId, own, onConflict }: ScenarioActionsProps) {
  const navigate = useNavigate();
  const publish = usePublishScenario();
  const archive = useArchiveScenario();
  const copy = useCopyScenario();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const busy = publish.isPending || archive.isPending || copy.isPending;
  const itemLabels = scenarioItemLabels(scenario.items);

  const close = () => {
    setPending(null);
    setIssues([]);
  };

  const fail = (error: unknown) => {
    const problem = scenarioActionError(error, itemLabels);

    if (problem.kind === "validation") {
      setIssues(problem.issues);
      return;
    }

    close();
    if (problem.kind === "conflict") {
      notifications.show({
        title: "Сценарий изменился на сервере",
        message: "Кто-то изменил сценарий раньше вас. Данные обновлены, проверьте их и повторите действие.",
        color: "orange",
      });
      onConflict();
      return;
    }

    notifications.show({ title: "Действие не выполнено", message: problem.message, color: "red" });
  };

  const confirm = () => {
    const request = { scenarioId: scenario.id, revision: scenario.revision, userId };
    const mutation = pending === "publish" ? publish : archive;

    mutation.mutate(request, { onSuccess: close, onError: fail });
  };

  const makeCopy = () =>
    copy.mutate(
      { scenarioId: scenario.id, userId },
      {
        onSuccess: (copyId) => navigate(`/teacher/scenarios/${copyId}`),
        onError: fail,
      },
    );

  const confirmation = pending && confirmations[pending];

  return (
    <>
      <Group gap="xs">
        {own && scenario.status === "DRAFT" && (
          <Button size="sm" disabled={busy} onClick={() => setPending("publish")}>
            Утвердить
          </Button>
        )}
        {own && scenario.status !== "ARCHIVED" && (
          <Button size="sm" variant="outline" color="povDark2.6" disabled={busy} onClick={() => setPending("archive")}>
            В архив
          </Button>
        )}
        <Button size="sm" variant="outline" color="povDark2.6" loading={copy.isPending} disabled={busy} onClick={makeCopy}>
          Создать копию
        </Button>
      </Group>

      <Modal
        opened={confirmation !== null}
        onClose={close}
        title={confirmation?.title}
        centered
        radius={2}
        transitionProps={{ duration: 0 }}
      >
        <Stack gap="sm">
          <Text size="sm">{confirmation?.text}</Text>
          {issues.length > 0 && (
            <Stack gap={4}>
              <Text size="sm" fw={600}>
                Сервер не принял сценарий:
              </Text>
              <List size="sm" spacing={2}>
                {issues.map((issue, index) => (
                  <List.Item key={index}>{issue}</List.Item>
                ))}
              </List>
            </Stack>
          )}
          <Group justify="flex-end" gap="xs">
            <Button size="sm" variant="outline" color="povDark2.6" onClick={close} disabled={busy}>
              Отмена
            </Button>
            <Button size="sm" loading={busy} onClick={confirm}>
              {confirmation?.confirm}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
