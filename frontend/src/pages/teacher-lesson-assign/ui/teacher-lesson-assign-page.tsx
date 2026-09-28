import { Alert, Anchor, Skeleton, Stack, Text, Title } from "@mantine/core";
import { Link, useSearchParams } from "react-router-dom";
import { AssignLessonForm } from "@/features/assign-lesson";
import { useScenarios } from "@/entities/scenario";
import { useSessionStore } from "@/entities/session";
import { Button } from "@/shared/ui";

const TeacherLessonAssignPage = () => {
  const [searchParams] = useSearchParams();
  const userId = useSessionStore((state) => state.profile?.userId ?? null);
  const scenarios = useScenarios();

  if (userId === null) return null;

  const published = scenarios.data?.filter((scenario) => scenario.status === "PUBLISHED") ?? [];
  const requested = searchParams.get("scenario");
  const initialScenarioId = published.some((scenario) => scenario.id === requested) ? requested : null;

  return (
    <Stack gap="md">
      <Title order={2} size="h4" fw={600}>
        Назначить занятие
      </Title>
      {scenarios.isPending ? (
        <Skeleton height={320} radius={2} />
      ) : scenarios.isError ? (
        <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить сценарии">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">Сервер не ответил. Повторите запрос позже.</Text>
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => scenarios.refetch()}>
              Повторить
            </Button>
          </Stack>
        </Alert>
      ) : published.length === 0 ? (
        <Alert variant="outline" color="povDark2.6" title="Нет утверждённых сценариев">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">Назначить можно только утверждённый сценарий. Утвердите черновик в его карточке.</Text>
            <Anchor component={Link} to="/teacher/scenarios" size="sm" c="povDark2.6" underline="always">
              К сценариям
            </Anchor>
          </Stack>
        </Alert>
      ) : (
        <AssignLessonForm
          key={initialScenarioId ?? "none"}
          scenarios={published}
          initialScenarioId={initialScenarioId}
          userId={userId}
        />
      )}
    </Stack>
  );
};

export default TeacherLessonAssignPage;
