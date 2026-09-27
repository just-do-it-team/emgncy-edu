import { Group, NumberInput, Paper, SegmentedControl, Select, Stack, Text, TextInput, Textarea, Title } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import {
  completionPolicyLabels,
  difficultyLevel,
  difficultyOptions,
  workspaceDefaults,
  type ScenarioDraft,
} from "@/entities/scenario";
import type { ScenarioWorkspaceMode } from "@/shared/api";
import { ACK_TIMEOUT_SECONDS, CARD_FILL_NORM_SECONDS } from "@/shared/config";

const SECONDS_IN_MINUTE = 60;

const workspaceOptions: { value: ScenarioWorkspaceMode; label: string }[] = [
  { value: "INDIVIDUAL", label: "Индивидуальное" },
  { value: "SHARED", label: "Общее на группу" },
];

function isWorkspaceMode(value: string): value is ScenarioWorkspaceMode {
  return value === "INDIVIDUAL" || value === "SHARED";
}

export function ScenarioParams({ form }: { form: UseFormReturnType<ScenarioDraft> }) {
  const draft = form.values;
  const shared = draft.workspaceMode === "SHARED";
  const count = (value: string | number) => (typeof value === "number" ? Math.round(value) : 0);

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Title order={3} size="h5" fw={600}>
          Параметры
        </Title>
        <TextInput size="xs" label="Название" withAsterisk maxLength={255} {...form.getInputProps("name")} />
        <Textarea size="xs" label="Описание" autosize minRows={2} {...form.getInputProps("description")} />
        <Select
          size="xs"
          w={220}
          label="Сложность"
          description="Задаёт темп процедурной подачи и пул шаблонов"
          data={difficultyOptions}
          value={String(difficultyLevel(draft.difficulty))}
          onChange={(value) => {
            if (value !== null) form.setFieldValue("difficulty", Number(value));
          }}
          allowDeselect={false}
          data-path="difficulty"
        />
        <Text size="sm">
          <Text span size="sm" c="povDark2.6">
            Нормативы:{" "}
          </Text>
          реакция на карточку {ACK_TIMEOUT_SECONDS} с, обработка карточки {CARD_FILL_NORM_SECONDS / SECONDS_IN_MINUTE}{" "}
          мин. Заданы нормативно и в сценарии не меняются.
        </Text>

        <Stack gap={6}>
          <Text size="sm" fw={500}>
            Рабочее место
          </Text>
          <SegmentedControl
            size="xs"
            radius={2}
            color="povDark2.6"
            w="fit-content"
            data={workspaceOptions}
            value={draft.workspaceMode}
            onChange={(value) => {
              if (isWorkspaceMode(value)) form.setValues(workspaceDefaults(value));
            }}
            aria-label="Рабочее место"
          />
          {shared ? (
            <Stack gap={6}>
              <Group gap="sm" align="flex-start">
                <NumberInput
                  size="xs"
                  w={160}
                  label="Участников от"
                  min={1}
                  max={100}
                  allowDecimal={false}
                  {...form.getInputProps("minParticipants")}
                  onChange={(value) => form.setFieldValue("minParticipants", count(value))}
                />
                <NumberInput
                  size="xs"
                  w={160}
                  label="до"
                  min={1}
                  max={100}
                  allowDecimal={false}
                  {...form.getInputProps("maxParticipants")}
                  onChange={(value) => form.setFieldValue("maxParticipants", count(value))}
                />
              </Group>
              <Text size="sm">Занятие {completionPolicyLabels.TEACHER_ONLY}.</Text>
              <Text size="xs" c="povDark2.6">
                Роли распределяются при назначении занятия: участник с позицией ДДС работает за службу, без позиции —
                оператором 112 и принимает звонки.
              </Text>
            </Stack>
          ) : (
            <Text size="sm">Каждый обучаемый работает отдельно; {completionPolicyLabels[draft.completionPolicy]}.</Text>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}
