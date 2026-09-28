import { useState } from "react";
import { Checkbox, Group, Paper, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  forbiddenMessage,
  upgradeCandidates,
  upgradeScenariosBody,
  useUpgradeTemplateScenarios,
  type TemplateUsage,
} from "@/entities/scenario";
import { errorDetail, errorStatus, type ScenarioTemplate } from "@/shared/api";
import { Button } from "@/shared/ui";

const FORBIDDEN = 403;
const CONFLICT = 409;

interface UpgradeDraftsProps {
  latest: ScenarioTemplate;
  usages: TemplateUsage[];
  teacherId: string;
  onConflict: () => void;
}

export function UpgradeDrafts({ latest, usages, teacherId, onConflict }: UpgradeDraftsProps) {
  const upgrade = useUpgradeTemplateScenarios();
  const candidates = upgradeCandidates(usages, teacherId);
  const [selected, setSelected] = useState<string[]>([]);
  const chosen = candidates.filter((usage) => selected.includes(usage.scenarioId));

  if (!latest.isActive || candidates.length === 0) return null;

  const submit = () =>
    upgrade.mutate(
      { kind: latest.kind, templateId: latest.id, body: upgradeScenariosBody(teacherId, chosen) },
      {
        onSuccess: (updated) => {
          setSelected([]);
          notifications.show({
            title: `Черновики обновлены до версии ${latest.version}`,
            message: `Сценариев: ${updated.length}`,
            color: "gray",
          });
        },
        onError: (error) => {
          const status = errorStatus(error);

          notifications.show({
            title: "Черновики не обновлены",
            message:
              status === FORBIDDEN
                ? forbiddenMessage(errorDetail(error))
                : status === CONFLICT
                  ? "Один из сценариев изменили или утвердили раньше вас. Данные обновлены — выберите сценарии заново."
                  : "Сервер не обновил черновики: изменения не применены ни к одному сценарию.",
            color: "red",
          });
          setSelected([]);
          onConflict();
        },
      },
    );

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Text size="sm">
          Ваши черновики ссылаются на старую версию. Их можно перевести на версию {latest.version} разом: сервер
          заменит ссылки и увеличит ревизию. Назначенные занятия не изменятся — у них снимок.
        </Text>
        <Stack gap={6}>
          {candidates.map((usage) => (
            <Checkbox
              key={usage.scenarioId}
              size="xs"
              color="povDark2.6"
              label={`${usage.scenarioName} — сейчас версия ${usage.version}`}
              checked={selected.includes(usage.scenarioId)}
              onChange={(event) => {
                const { checked } = event.currentTarget;

                setSelected((current) =>
                  checked ? [...current, usage.scenarioId] : current.filter((id) => id !== usage.scenarioId),
                );
              }}
            />
          ))}
        </Stack>
        <Group gap="xs">
          <Button size="xs" loading={upgrade.isPending} disabled={chosen.length === 0} onClick={submit}>
            Обновить черновики до версии {latest.version}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
