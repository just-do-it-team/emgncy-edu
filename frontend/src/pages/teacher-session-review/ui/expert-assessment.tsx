import { useState } from "react";
import { Group, List, Modal, NumberInput, SegmentedControl, Stack, Text, Textarea, Tooltip } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useUpdateExpertAssessment } from "@/entities/expert-review";
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

function failureText(error: unknown): string {
  const status = errorStatus(error);

  if (status === CONFLICT) return "Попытка не завершена: сервер принимает оценку только у завершённой попытки.";
  if (status === VALIDATION) return "Сервер не принял оценку: попытка назначена другим преподавателем или балл вне шкалы.";

  return "Сервер не ответил. Оценка не сохранена, повторите позже.";
}

function passedText(passed: boolean | null): string {
  return passed === null ? "—" : passed ? "зачтено" : "не зачтено";
}

interface ExpertAssessmentCellProps {
  session: ReviewSession;
  teacherId: string;
  aborted: boolean;
  dismissed: string[];
}

export function ExpertAssessmentCell({ session, teacherId, aborted, dismissed }: ExpertAssessmentCellProps) {
  const update = useUpdateExpertAssessment(session.id, teacherId);
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

  const submit = form.onSubmit((values) =>
    update.mutate(assessmentBody(values, dismissed), {
      onSuccess: () => {
        setOpened(false);
        notifications.show({ title: "Оценка сохранена", message: "Итог попытки — по оценке преподавателя", color: "gray" });
      },
      onError: (error) => notifications.show({ title: "Оценка не сохранена", message: failureText(error), color: "red" }),
    }),
  );

  return (
    <>
      <div className={classes.cell}>
        <span className={classes.cellLabel}>Оценка преподавателя</span>
        <Group gap={8} wrap="nowrap">
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
          ) : (
            <span className={classes.cellValue}>нет</span>
          )}
          <Tooltip label={ABORTED_HINT} disabled={!aborted} events={tooltipEvents} multiline w={260} color="povDark.6" radius={0}>
            <Button
              size="compact-xs"
              variant="outline"
              color="povDark2.6"
              data-disabled={aborted || undefined}
              aria-disabled={aborted}
              onClick={(event) => {
                if (aborted) event.preventDefault();
                else open();
              }}
            >
              {saved ? "Изменить" : "Оценить"}
            </Button>
          </Tooltip>
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
