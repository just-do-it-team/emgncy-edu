import { useState } from "react";
import { Anchor, Group, List, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Link } from "react-router-dom";
import { forbiddenMessage, useDeactivateTemplate, type TemplateUsage } from "@/entities/scenario";
import { errorDetail, errorStatus, type ScenarioTemplate } from "@/shared/api";
import { Button } from "@/shared/ui";

const FORBIDDEN = 403;
const CONFLICT = 409;

interface DeactivateTemplateProps {
  template: ScenarioTemplate;
  userId: string;
  blockingUsages: TemplateUsage[] | null;
}

export function DeactivateTemplate({ template, userId, blockingUsages }: DeactivateTemplateProps) {
  const [opened, setOpened] = useState(false);
  const deactivate = useDeactivateTemplate();
  const blocked = blockingUsages === null || blockingUsages.length > 0;

  const confirm = () =>
    deactivate.mutate(
      { kind: template.kind, templateId: template.id, userId },
      {
        onSuccess: () => {
          setOpened(false);
          notifications.show({ title: "Шаблон деактивирован", message: `Версия ${template.version} больше не предлагается при сборке сценариев.`, color: "gray" });
        },
        onError: (error) => {
          setOpened(false);
          notifications.show({
            title: "Шаблон не деактивирован",
            message:
              errorStatus(error) === CONFLICT
                ? "На эту версию ссылается неархивный сценарий. Список сценариев обновлён."
                : errorStatus(error) === FORBIDDEN
                  ? forbiddenMessage(errorDetail(error))
                  : "Сервер не выполнил действие. Повторите попытку позже.",
            color: "red",
          });
        },
      },
    );

  return (
    <>
      <Button size="sm" variant="outline" color="povDark2.6" onClick={() => setOpened(true)}>
        Деактивировать
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={`Деактивировать версию ${template.version}`}
        centered
        radius={2}
        transitionProps={{ duration: 0 }}
      >
        <Stack gap="sm">
          {blockingUsages === null ? (
            <Text size="sm">
              Не удалось проверить, какие сценарии ссылаются на шаблон. Повторите позже, когда список сценариев
              загрузится.
            </Text>
          ) : blockingUsages.length > 0 ? (
            <>
              <Text size="sm">
                Сервер не деактивирует версию, пока на неё ссылаются неархивные сценарии. Переведите их на другую
                версию в редакторе сценария или перенесите в архив:
              </Text>
              <List size="sm" spacing={2}>
                {blockingUsages.map((usage) => (
                  <List.Item key={usage.scenarioId}>
                    <Anchor component={Link} to={`/teacher/scenarios/${usage.scenarioId}`} size="sm" c="povDark2.6" underline="always">
                      {usage.scenarioName}
                    </Anchor>
                  </List.Item>
                ))}
              </List>
            </>
          ) : (
            <Text size="sm">
              Версия пропадёт из выбора при сборке сценариев и из процедурных пулов. Сценарии в архиве и уже
              назначенные занятия не пострадают: у них сохранён снимок. Вернуть активность нельзя — при
              необходимости создайте новую версию.
            </Text>
          )}
          <Group justify="flex-end" gap="xs">
            <Button size="sm" variant="outline" color="povDark2.6" onClick={() => setOpened(false)}>
              Отмена
            </Button>
            <Button size="sm" disabled={blocked} loading={deactivate.isPending} onClick={confirm}>
              Деактивировать
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
