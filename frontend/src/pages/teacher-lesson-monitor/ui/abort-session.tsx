import { useState } from "react";
import { Group, Modal, Stack, Text, Textarea, Tooltip } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useAbortSession } from "@/entities/monitoring";
import { errorStatus } from "@/shared/api";
import { Button, tooltipEvents } from "@/shared/ui";

const REASON_MAX_LENGTH = 2000;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const VALIDATION = 422;

const individualAbortHint = "Индивидуальную попытку может прервать только обучаемый";

function failureText(error: unknown): string {
  const status = errorStatus(error);

  if (status === CONFLICT) return "Попытка уже завершена или прервана. Данные обновлены.";
  if (status === VALIDATION) return "Сервер не дал прервать: прервать можно только идущую попытку общего рабочего места, назначенного вами.";
  if (status === FORBIDDEN) return "Сервер не подтвердил ваши права на это занятие. Войдите заново.";
  if (status === NOT_FOUND) return "Попытка не найдена: возможно, занятие удалено.";

  return "Сервер не ответил. Попытка не прервана, повторите позже.";
}

interface AbortForm {
  reason: string;
}

interface AbortSessionButtonProps {
  sessionId: string;
  teacherId: string;
  shared: boolean;
  participantNames: string[];
}

export function AbortSessionButton({ sessionId, teacherId, shared, participantNames }: AbortSessionButtonProps) {
  const abort = useAbortSession();
  const [opened, setOpened] = useState(false);
  const form = useForm<AbortForm>({
    initialValues: { reason: "" },
    validate: {
      reason: (value) => {
        if (value.trim().length === 0) return "Укажите причину: сервер не прерывает попытку без неё";
        if (value.trim().length > REASON_MAX_LENGTH) return `Не длиннее ${REASON_MAX_LENGTH} символов`;

        return null;
      },
    },
  });

  const close = () => {
    if (abort.isPending) return;
    setOpened(false);
    form.reset();
  };

  const submit = form.onSubmit(({ reason }) =>
    abort.mutate(
      { sessionId, teacherId, reason: reason.trim() },
      {
        onSuccess: () => {
          setOpened(false);
          form.reset();
          notifications.show({ title: "Попытка прервана", message: participantNames.join(", "), color: "gray" });
        },
        onError: (error) => {
          setOpened(false);
          notifications.show({ title: "Попытка не прервана", message: failureText(error), color: "red" });
        },
      },
    ),
  );

  return (
    <>
      <Tooltip label={individualAbortHint} disabled={shared} events={tooltipEvents} multiline w={260} color="povDark.6" radius={0}>
        <Button
          size="compact-xs"
          variant="outline"
          color="povDark2.6"
          data-disabled={!shared || undefined}
          aria-disabled={!shared}
          onClick={(event) => {
            if (shared) setOpened(true);
            else event.preventDefault();
          }}
        >
          Прервать
        </Button>
      </Tooltip>

      <Modal
        opened={opened}
        onClose={close}
        title="Прервать попытку"
        centered
        radius={2}
        transitionProps={{ duration: 0 }}
      >
        <form onSubmit={submit} noValidate>
          <Stack gap="sm">
            <Text size="sm">
              Попытка общего рабочего места будет прервана для всех участников: {participantNames.join(", ")}.
              Продолжить её нельзя, балл не выставляется.
            </Text>
            <Textarea
              label="Причина"
              required
              autosize
              minRows={2}
              maxLength={REASON_MAX_LENGTH}
              data-autofocus
              {...form.getInputProps("reason")}
            />
            <Group justify="flex-end" gap="xs">
              <Button size="sm" variant="outline" color="povDark2.6" onClick={close} disabled={abort.isPending}>
                Не прерывать
              </Button>
              <Button size="sm" type="submit" loading={abort.isPending}>
                Прервать попытку
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
