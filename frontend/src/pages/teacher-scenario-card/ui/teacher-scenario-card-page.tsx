import { Alert, Group, Paper, Skeleton, Stack, Text, Title, Tooltip } from "@mantine/core";
import { isAxiosError } from "axios";
import { useParams } from "react-router-dom";
import { useEmergencyServices } from "@/entities/emergency-service";
import {
  completionPolicyLabels,
  difficultyLabel,
  scenarioRole,
  scenarioRoleHint,
  scenarioRoleLabels,
  scenarioStatusLabels,
  useScenario,
  workspaceLabels,
} from "@/entities/scenario";
import { useSessionStore } from "@/entities/session";
import { isRequestError, type EmergencyService, type ScenarioDetail } from "@/shared/api";
import { ACK_TIMEOUT_SECONDS, CARD_FILL_NORM_SECONDS } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";
import { Button, Fact, tooltipEvents } from "@/shared/ui";
import { serviceName } from "../model/expected-values";
import { ScenarioActions } from "./scenario-actions";
import { ScenarioComposition } from "./scenario-composition";
import { ScenarioLessons } from "./scenario-lessons";
import classes from "./scenario-card.module.scss";

const NOT_FOUND_STATUSES = new Set([404, 422]);
const SECONDS_IN_MINUTE = 60;

function errorStatus(error: Error): number | undefined {
  if (isRequestError(error)) return error.status;

  return isAxiosError(error) ? error.response?.status : undefined;
}

function normsText(): string {
  return `реакция на карточку ${ACK_TIMEOUT_SECONDS} с, обработка карточки ${CARD_FILL_NORM_SECONDS / SECONDS_IN_MINUTE} мин — по нормативу, в сценарии не меняются`;
}

function serviceNamesOf(
  scenario: ScenarioDetail,
  directory: Map<string, EmergencyService> | undefined,
): Map<string, string> {
  const names = new Map<string, string>();

  for (const service of scenario.items.flatMap((item) => item.notificationList)) {
    if (service.name !== null) names.set(service.code, service.name);
  }
  for (const service of directory?.values() ?? []) names.set(service.code, service.name);

  return names;
}

function participantsRange({ minParticipants, maxParticipants }: ScenarioDetail): string {
  return minParticipants === maxParticipants ? String(minParticipants) : `${minParticipants}–${maxParticipants}`;
}

function dispatcherServices(scenario: ScenarioDetail, serviceNames: Map<string, string>): string {
  const codes = new Set(
    scenario.items
      .filter((item) => item.itemType === "INCIDENT_CARD")
      .flatMap((item) => item.notificationList.map((service) => service.code)),
  );

  return [...codes].map((code) => serviceName(code, serviceNames)).join(", ");
}

function SharedParticipants({ scenario, serviceNames }: { scenario: ScenarioDetail; serviceNames: Map<string, string> }) {
  const calls = scenario.items.filter((item) => item.itemType === "INCOMING_CALL").length;
  const services = dispatcherServices(scenario, serviceNames);

  return (
    <Stack gap="sm">
      <Title order={3} size="h5" fw={600}>
        Участники
      </Title>
      <Paper withBorder p="md">
        <Stack gap={6}>
          <Text size="sm">
            Рабочее место общее на {participantsRange(scenario)} участников;{" "}
            {completionPolicyLabels[scenario.completionPolicy]}.
          </Text>
          {calls > 0 && (
            <Text size="sm">
              <Text span size="sm" c="povDark2.6">
                Оператор 112:{" "}
              </Text>
              принимает входящие звонки ({calls}); при нескольких операторах звонки закрепляются в назначении.
            </Text>
          )}
          {(services !== "" || scenario.procedural) && (
            <Text size="sm">
              <Text span size="sm" c="povDark2.6">
                Диспетчер ДДС:{" "}
              </Text>
              {services !== ""
                ? `позиции служб, куда уходят карточки: ${services}.`
                : "службы определяются карточками процедурной подачи."}
            </Text>
          )}
          <Text size="xs" c="povDark2.6">
            Кто какую роль играет, задаётся при назначении занятия: позиция ДДС — служба, без позиции — оператор 112.
          </Text>
        </Stack>
      </Paper>
    </Stack>
  );
}

interface ScenarioCardProps {
  scenario: ScenarioDetail;
  teacherId: string;
  onConflict: () => void;
}

function ScenarioCard({ scenario, teacherId, onConflict }: ScenarioCardProps) {
  const services = useEmergencyServices();
  const serviceNames = serviceNamesOf(scenario, services.data);
  const role = scenarioRole(scenario.composition);
  const own = scenario.createdBy === teacherId;

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
            <Stack gap={4}>
              <Title order={2} size="h4" fw={600}>
                {scenario.name}
              </Title>
              {scenario.description && <Text size="sm">{scenario.description}</Text>}
            </Stack>
            <ScenarioActions scenario={scenario} userId={teacherId} own={own} onConflict={onConflict} />
          </Group>

          <Group gap="xl" align="flex-start" wrap="wrap">
            <Fact label="Роль">
              <Tooltip label={scenarioRoleHint} events={tooltipEvents} multiline w={260} color="povDark.6" radius={0}>
                <span tabIndex={0} className={classes.focusable}>
                  {role === null ? "—" : scenarioRoleLabels[role]}
                </span>
              </Tooltip>
            </Fact>
            <Fact label="Сложность">{difficultyLabel(scenario.difficulty)}</Fact>
            <Fact label="Статус">{scenarioStatusLabels[scenario.status]}</Fact>
            <Fact label="Автор">{own ? "Вы" : "Другой преподаватель"}</Fact>
            <Fact label="Рабочее место">{workspaceLabels[scenario.workspaceMode]}</Fact>
            <Fact label="Создан">{formatDateTime(scenario.createdAt)}</Fact>
            <Fact label="Обновлён">{formatDateTime(scenario.updatedAt)}</Fact>
            <Fact label="Ревизия">{scenario.revision}</Fact>
          </Group>

          <Text size="sm">
            <Text span size="sm" c="povDark2.6">
              Нормативы:{" "}
            </Text>
            {normsText()}
          </Text>

          {!own && (
            <Text size="xs" c="povDark2.6">
              Сценарий создан другим преподавателем: утверждать и архивировать его может только автор. Можно создать
              свою копию.
            </Text>
          )}
        </Stack>
      </Paper>

      {scenario.workspaceMode === "SHARED" && <SharedParticipants scenario={scenario} serviceNames={serviceNames} />}

      <ScenarioComposition scenario={scenario} serviceNames={serviceNames} />

      <ScenarioLessons scenarioId={scenario.id} teacherId={teacherId} />
    </Stack>
  );
}

function ScenarioScreen({ scenarioId, teacherId }: { scenarioId: string; teacherId: string }) {
  const scenario = useScenario(scenarioId);

  if (scenario.isPending) {
    return (
      <Stack gap="md">
        <Skeleton height={140} radius={2} />
        <Skeleton height={240} radius={2} />
      </Stack>
    );
  }

  if (scenario.isError) {
    const status = errorStatus(scenario.error);
    const notFound = status !== undefined && NOT_FOUND_STATUSES.has(status);

    return (
      <Alert
        variant="outline"
        color="povDark2.6"
        title={notFound ? "Сценарий не найден" : "Не удалось загрузить сценарий"}
      >
        <Stack gap="xs" align="flex-start">
          <Text size="sm">
            {notFound
              ? "Сценарий удалён или идентификатор в адресе неверный."
              : "Сервер не ответил. Повторите запрос позже."}
          </Text>
          <Button size="xs" variant="outline" color="povDark2.6" onClick={() => scenario.refetch()}>
            Повторить
          </Button>
        </Stack>
      </Alert>
    );
  }

  return <ScenarioCard scenario={scenario.data} teacherId={teacherId} onConflict={() => void scenario.refetch()} />;
}

const TeacherScenarioCardPage = () => {
  const { scenarioId = "" } = useParams();
  const teacherId = useSessionStore((state) => state.profile?.userId ?? null);

  if (teacherId === null) return null;

  return <ScenarioScreen scenarioId={scenarioId} teacherId={teacherId} />;
};

export default TeacherScenarioCardPage;
