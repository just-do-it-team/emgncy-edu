import { Stack, Title } from "@mantine/core";
import { useMyAttempts } from "@/entities/attempt";
import { AttemptsTable } from "@/widgets/attempts-table";

const StudentResultsPage = () => {
  const attempts = useMyAttempts();

  return (
    <Stack gap="md">
      <Title order={2} size="h4" fw={600}>
        Мои результаты
      </Title>

      <AttemptsTable
        query={attempts}
        reviewPath={(attemptId) => `/student/attempts/${attemptId}`}
        emptyTitle="Завершённых попыток пока нет"
        emptyHint="Попытка появляется здесь после того, как вы сохранили карточку и занятие завершилось. Начать можно из рабочего места."
      />
    </Stack>
  );
};

export default StudentResultsPage;
