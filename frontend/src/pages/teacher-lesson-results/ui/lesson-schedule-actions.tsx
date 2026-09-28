import { useState } from "react";
import { Group, Modal, Stack, Text, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import {
  assignmentWindowProblem,
  scheduleBody,
  scheduleChangeBlock,
  ScheduleFields,
  scheduleTarget,
  useCancelLesson,
  useRescheduleLesson,
  type ScheduleValue,
} from "@/entities/assignment";
import type { Lesson } from "@/features/teacher-lessons";
import { errorStatus } from "@/shared/api";
import { Button, tooltipEvents } from "@/shared/ui";

const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const VALIDATION = 422;

function failureText(error: unknown): string {
  const status = errorStatus(error);

  if (status === FORBIDDEN || status === NOT_FOUND) return "Изменить занятие может только назначивший его преподаватель.";
  if (status === CONFLICT) return "Занятие уже началось или по нему есть попытки: изменить его нельзя. Данные обновлены.";
  if (status === VALIDATION) return "Сервер не принял даты: срок должен быть позже начала и ещё не наступить.";

  return "Сервер не ответил. Повторите попытку позже.";
}

type Dialog = "reschedule" | "cancel";

export function LessonScheduleActions({ lesson }: { lesson: Lesson }) {
  const navigate = useNavigate();
  const reschedule = useRescheduleLesson();
  const cancel = useCancelLesson();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [schedule, setSchedule] = useState<ScheduleValue>({ availableFrom: lesson.availableFrom, dueAt: lesson.dueAt });
  const [shownProblem, setShownProblem] = useState(false);
  const target = scheduleTarget(
    lesson.batchId,
    lesson.assignments.map((assignment) => assignment.id),
  );
  const block =
    target === null
      ? "Занятие собрано из нескольких назначений без пакета: сервер меняет их только по одному."
      : scheduleChangeBlock(
          lesson.assignments.map((assignment) => assignment.status),
          lesson.sessions.length,
        );
  const now = Date.now();
  const problem = assignmentWindowProblem(schedule.availableFrom, schedule.dueAt, now);
  const busy = reschedule.isPending || cancel.isPending;

  const open = (next: Dialog) => {
    setSchedule({ availableFrom: lesson.availableFrom, dueAt: lesson.dueAt });
    setShownProblem(false);
    setDialog(next);
  };

  const fail = (error: unknown) => {
    setDialog(null);
    notifications.show({ title: "Занятие не изменено", message: failureText(error), color: "red" });
  };

  const confirmReschedule = () => {
    setShownProblem(true);
    if (target === null || problem !== null) return;

    reschedule.mutate(
      { target, body: scheduleBody(schedule, now) },
      {
        onSuccess: () => {
          setDialog(null);
          notifications.show({ title: "Занятие перенесено", message: lesson.scenarioName, color: "gray" });
        },
        onError: fail,
      },
    );
  };

  const confirmCancel = () => {
    if (target === null) return;

    cancel.mutate(target, {
      onSuccess: () => {
        notifications.show({ title: "Занятие отменено", message: lesson.scenarioName, color: "gray" });
        navigate("/teacher/lessons");
      },
      onError: fail,
    });
  };

  const action = (label: string, next: Dialog) => (
    <Tooltip label={block} disabled={block === null} events={tooltipEvents} multiline w={280} color="povDark.6" radius={0}>
      <Button
        size="xs"
        variant="outline"
        color="povDark2.6"
        data-disabled={block !== null || undefined}
        aria-disabled={block !== null}
        onClick={(event) => {
          if (block !== null) event.preventDefault();
          else open(next);
        }}
      >
        {label}
      </Button>
    </Tooltip>
  );

  return (
    <>
      {action("Перенести", "reschedule")}
      {action("Отменить занятие", "cancel")}

      <Modal
        opened={dialog === "reschedule"}
        onClose={() => setDialog(null)}
        title="Перенести занятие"
        centered
        radius={2}
        transitionProps={{ duration: 0 }}
      >
        <Stack gap="sm">
          <ScheduleFields
            value={schedule}
            now={now}
            error={shownProblem && problem !== null ? problem : undefined}
            onChange={setSchedule}
          />
          <Group justify="flex-end" gap="xs">
            <Button size="sm" variant="outline" color="povDark2.6" onClick={() => setDialog(null)} disabled={busy}>
              Отмена
            </Button>
            <Button size="sm" loading={reschedule.isPending} onClick={confirmReschedule}>
              Перенести
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={dialog === "cancel"}
        onClose={() => setDialog(null)}
        title="Отменить занятие"
        centered
        radius={2}
        transitionProps={{ duration: 0 }}
      >
        <Stack gap="sm">
          <Text size="sm">
            Занятие «{lesson.scenarioName}» будет отменено, участников: {lesson.participantIds.length}. Обучаемые
            больше не смогут его начать; вернуть отменённое занятие нельзя — понадобится назначить заново.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button size="sm" variant="outline" color="povDark2.6" onClick={() => setDialog(null)} disabled={busy}>
              Не отменять
            </Button>
            <Button size="sm" loading={cancel.isPending} onClick={confirmCancel}>
              Отменить занятие
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
