import { Group, Paper, Select, Stack, Text, TextInput } from "@mantine/core";
import { responseStatusLabel } from "@/entities/expert-review";
import {
  nextStatuses,
  requiresComment,
  statusCommentComparison,
  unitNumberLabel,
  type StatusStepDraft,
} from "@/entities/scenario";
import { Button } from "@/shared/ui";
import type { FormBinding } from "../model/form-binding";

interface StatusHistoryEditorProps {
  form: FormBinding;
  path: string;
  services: string[];
  history: Record<string, StatusStepDraft[]>;
  serviceName: (code: string) => string;
}

export function StatusHistoryEditor({ form, path, services, history, serviceName }: StatusHistoryEditorProps) {
  const setSteps = (code: string, steps: StatusStepDraft[]) => form.setFieldValue(`${path}.${code}`, steps);

  return (
    <Stack gap="xs">
      <Stack gap={0}>
        <Text size="sm" fw={500}>
          Статусы реагирования
        </Text>
        <Text size="xs" c="povDark2.6">
          Цепочка по каждой службе — только допустимыми переходами. Последний статус станет статусом службы в эталоне.
          Номер подразделения хранится, но не оценивается.
        </Text>
      </Stack>
      {services.length === 0 && (
        <Text size="sm" c="povDark2.6">
          Сначала выберите службы.
        </Text>
      )}
      {services.map((code) => {
        const steps = history[code] ?? [];
        const next = nextStatuses(steps.map((step) => step.status));

        return (
          <Paper key={code} withBorder p="sm">
            <Stack gap="xs">
              <Text size="sm" fw={600} data-path={`${path}.${code}`} tabIndex={-1}>
                {serviceName(code)}
              </Text>
              {steps.length === 0 && (
                <Text size="xs" c="povDark2.6">
                  Статусов нет. Сервер требует хотя бы одну смену статуса для каждой службы эталона.
                </Text>
              )}
              {steps.map((step, index) => (
                <Group key={index} gap="xs" align="flex-start" wrap="wrap">
                  <Text size="sm" w={220} pt={4} data-path={`${path}.${code}.${index}.status`} tabIndex={-1}>
                    {index + 1}. {responseStatusLabel(step.status)}
                  </Text>
                  <TextInput
                    size="xs"
                    flex={1}
                    miw={220}
                    label="Комментарий"
                    aria-label={`Комментарий к шагу ${index + 1}: ${responseStatusLabel(step.status)}`}
                    withAsterisk={requiresComment(step.status)}
                    description={`${requiresComment(step.status) ? "Обязателен" : "Необязателен"}; ${statusCommentComparison}`}
                    {...form.getInputProps(`${path}.${code}.${index}.comment`)}
                  />
                  <TextInput
                    size="xs"
                    w={180}
                    label={unitNumberLabel(code)}
                    description="Не оценивается"
                    {...form.getInputProps(`${path}.${code}.${index}.unitNumber`)}
                  />
                </Group>
              ))}
              <Group gap="xs" align="flex-end">
                <Select
                  size="xs"
                  w={260}
                  label="Следующий статус"
                  placeholder={next.length === 0 ? "Цепочка завершена" : "Выберите статус"}
                  data={next.map((status) => ({ value: status, label: responseStatusLabel(status) }))}
                  value={null}
                  disabled={next.length === 0}
                  onChange={(status) => {
                    const chosen = next.find((candidate) => candidate === status);

                    if (chosen) setSteps(code, [...steps, { status: chosen, comment: "", unitNumber: "" }]);
                  }}
                />
                <Button
                  size="xs"
                  variant="outline"
                  color="povDark2.6"
                  disabled={steps.length === 0}
                  onClick={() => setSteps(code, steps.slice(0, -1))}
                >
                  Убрать последний статус
                </Button>
              </Group>
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}

