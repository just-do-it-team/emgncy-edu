import { useState } from "react";
import { Anchor, Group, List, Modal, NumberInput, SegmentedControl, Stack, Text, Textarea, Tooltip } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useUpdateExpertAssessment } from "@/entities/expert-review";
import { monitoringKeys, nextPendingAttempt, useTeacherSessions } from "@/entities/monitoring";
import { errorStatus, type ReviewSession } from "@/shared/api";
import { formatDateTime } from "@/shared/lib";
import { Button, tooltipEvents } from "@/shared/ui";
import {
  assessmentBody,
  differsFromAutomatic,
  MAX_COMMENT_LENGTH,
  MAX_SCORE,
  teacherText,
  validateAssessment,
  type AssessmentValues,
} from "../model/expert-assessment";
import classes from "./session-review.module.scss";

const scoreFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const CONFLICT = 409;
const VALIDATION = 422;
const PASSED = "passed";
const FAILED = "failed";
const ABORTED_HINT = "Прерванную попытку оценить нельзя: сервер принимает оценку только у завершённой";
const NO_AUTOMATIC_HINT = "Автоматическая оценка не рассчитана — подтверждать нечего, выставьте оценку через «Исправить»";

function failureText(error: unknown): string {
  const status = errorStatus(error);

  if (status === CONFLICT) return "Попытка не завершена: сервер принимает оценку только у завершённой попытки.";
  if (status === VALIDATION) return "Сервер не принял оценку: попытка назначена другим преподавателем или балл вне шкалы.";

  return "Сервер не ответил. Оценка не сохранена, повторите позже.";
}

function passedText(passed: boolean | null): string {
  return passed === null ? "—" : passed ? "зачтено" : "не зачтено";
}

interface ExpertAssessmentBlockProps {
  session: ReviewSession;
  teacherId: string;
  aborted: boolean;
  dismissed: string[];
}

export function ExpertAssessmentBlock({ session, teacherId, aborted, dismissed }: ExpertAssessmentBlockProps) {
  const update = useUpdateExpertAssessment(session.id, teacherId);
  const queryClient = useQueryClient();
  const sessions = useTeacherSessions(teacherId, "ANY");
  const current = sessions.data?.find((candidate) => candidate.sessionId === session.id);
  const next = current === undefined ? null : nextPendingAttempt(sessions.data ?? [], current);
  const [opened, setOpened] = useState(false);
  const saved = session.expertAssessment;
  const automatic = { score: session.score, passed: session.passed };
  const initialValues: AssessmentValues = {
    score: saved?.score ?? session.score ?? "",
    passed: saved?.passed ?? session.passed ?? false,
    comment: teacherText(saved?.comment ?? null),
  };
  const form = useForm<AssessmentValues>({
    initialValues,
    validate: (values) => validateAssessment(values, automatic, dismissed),
  });
  const changed = differsFromAutomatic(automatic, form.values);
  const author = saved?.evaluatedBy === teacherId ? "вы" : "другой преподаватель";
  const savedLine =
    saved === null
      ? null
      : [author, saved.evaluatedAt === null ? null : formatDateTime(saved.evaluatedAt)].filter(Boolean).join(", ");

  const open = () => {
    form.setValues(initialValues);
    form.resetDirty(initialValues);
    form.clearErrors();
    setOpened(true);
  };

  const save = (values: AssessmentValues, withDismissed: string[], message: string) =>
    update.mutate(assessmentBody(values, withDismissed), {
      onSuccess: () => {
        setOpened(false);
        void queryClient.invalidateQueries({ queryKey: monitoringKeys.lists() });
        notifications.show({ title: "Оценка сохранена", message, color: "gray" });
      },
      onError: (error) => notifications.show({ title: "Оценка не сохранена", message: failureText(error), color: "red" }),
    });

  const submit = form.onSubmit((values) => save(values, dismissed, "Итог попытки — по оценке преподавателя"));

  const confirmAutomatic = () => {
    if (automatic.score === null || automatic.passed === null) return;

    save({ score: automatic.score, passed: automatic.passed, comment: "" }, [], "Автоматическая оценка подтверждена");
  };
  const confirmBlock = aborted ? ABORTED_HINT : automatic.score === null || automatic.passed === null ? NO_AUTOMATIC_HINT : null;

  return (
    <>
      <div className={`${classes.assessment} ${saved ? "" : classes.assessmentPending}`}>
        <span className={classes.assessmentTitle}>
          {saved ? "Оценка преподавателя" : "Проверьте оценку системы: подтвердите или исправьте"}
        </span>
        <span className={classes.assessmentHint}>
          Автоматическая оценка:{" "}
          {session.score === null ? "не рассчитана" : `${scoreFormatter.format(session.score)}, ${passedText(session.passed)}`}
        </span>
        <Group gap={8} wrap="wrap">
          {saved ? (
            <Tooltip
              label={[`Оценил: ${savedLine}`, saved.comment ?? "Без комментария"].join("\n")}
              events={tooltipEvents}
              multiline
              w={360}
              color="povDark.6"
              radius={0}
              classNames={{ tooltip: classes.tooltipLines }}
            >
              <span className={`${classes.cellValue} ${classes.focusable}`} tabIndex={0}>
                {`${scoreFormatter.format(saved.score)}, ${passedText(saved.passed)}`}
              </span>
            </Tooltip>
          ) : null}
          {!saved && (
            <Tooltip label={confirmBlock} disabled={confirmBlock === null} events={tooltipEvents} multiline w={260} color="povDark.6" radius={0}>
              <Button
                size="xs"
                loading={update.isPending && !opened}
                data-disabled={confirmBlock !== null || undefined}
                aria-disabled={confirmBlock !== null}
                onClick={(event) => {
                  if (confirmBlock !== null) event.preventDefault();
                  else confirmAutomatic();
                }}
              >
                Верно — подтвердить
              </Button>
            </Tooltip>
          )}
          <Tooltip label={ABORTED_HINT} disabled={!aborted} events={tooltipEvents} multiline w={260} color="povDark.6" radius={0}>
            <Button
              size="xs"
              variant="outline"
              color="povDark2.6"
              data-disabled={aborted || undefined}
              aria-disabled={aborted}
              onClick={(event) => {
                if (aborted) event.preventDefault();
                else open();
              }}
            >
              {saved ? "Изменить" : "Исправить"}
            </Button>
          </Tooltip>
          {saved &&
            (next ? (
              <Anchor component={Link} to={`/teacher/attempts/${next.sessionId}/review`} size="xs" c="povDark2.6" underline="always">
                Следующая на проверке →
              </Anchor>
            ) : (
              current !== undefined && (
                <Text size="xs" c="povDark2.6">
                  Все попытки занятия проверены
                </Text>
              )
            ))}
        </Group>
      </div>

      <Modal
        opened={opened}
        onClose={() => {
          if (!update.isPending) setOpened(false);
        }}
        title="Оценка преподавателя"
        centered
        size="lg"
        radius={2}
        transitionProps={{ duration: 0 }}
      >
        <form onSubmit={submit} noValidate>
          <Stack gap="sm">
            <Text size="sm">
              Автоматическая оценка:{" "}
              <Text span size="sm" fw={600}>
                {session.score === null ? "не рассчитана" : scoreFormatter.format(session.score)}, {passedText(session.passed)}
              </Text>
              . Оценка преподавателя заменяет её в итогах, отчётах и у обучаемого.
            </Text>
            {saved && (
              <Text size="xs" c="povDark2.6">
                Сохранённая оценка: {scoreFormatter.format(saved.score)}, {passedText(saved.passed)} — {savedLine}
              </Text>
            )}

            <Group gap="md" align="flex-start">
              <NumberInput
                size="xs"
                w={160}
                label="Итоговый балл"
                min={0}
                max={MAX_SCORE}
                decimalScale={2}
                withAsterisk
                {...form.getInputProps("score")}
              />
              <Stack gap={4}>
                <Text size="xs" fw={500}>
                  Зачёт
                </Text>
                <SegmentedControl
                  size="xs"
                  radius={2}
                  data={[
                    { value: PASSED, label: "Зачтено" },
                    { value: FAILED, label: "Не зачтено" },
                  ]}
                  value={form.values.passed ? PASSED : FAILED}
                  onChange={(value) => form.setFieldValue("passed", value === PASSED)}
                />
              </Stack>
            </Group>

            <Textarea
              size="xs"
              label="Комментарий"
              description={changed ? "Оценка отличается от автоматической — укажите причину" : "Необязательно, если оценка совпадает с автоматической"}
              withAsterisk={changed}
              autosize
              minRows={3}
              maxLength={MAX_COMMENT_LENGTH}
              data-autofocus
              {...form.getInputProps("comment")}
            />

            {dismissed.length > 0 && (
              <Stack gap={4}>
                <Text size="xs" fw={500}>
                  Не считаю ошибками — добавится в комментарий
                </Text>
                <List size="xs" spacing={2}>
                  {dismissed.map((label) => (
                    <List.Item key={label}>{label}</List.Item>
                  ))}
                </List>
              </Stack>
            )}

            <Group justify="flex-end" gap="xs">
              <Button size="sm" variant="outline" color="povDark2.6" onClick={() => setOpened(false)} disabled={update.isPending}>
                Отмена
              </Button>
              <Button size="sm" type="submit" loading={update.isPending}>
                Сохранить оценку
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
