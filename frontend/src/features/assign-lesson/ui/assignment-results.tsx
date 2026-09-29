import { Anchor, Group, List, Paper, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
import { Button } from "@/shared/ui";
import type { RequestOutcome, ScenarioRoles } from "../model/assignment-plan";

interface AssignmentResultsProps {
  outcomes: RequestOutcome[];
  rolesById: Map<string, ScenarioRoles>;
  groupName: (groupId: string | null) => string;
  studentName: (studentId: string) => string;
  retrying: boolean;
  onRetry: () => void;
}

export function AssignmentResults({ outcomes, rolesById, groupName, studentName, retrying, onRetry }: AssignmentResultsProps) {
  const created = outcomes.filter((outcome) => outcome.result.ok);
  const failed = outcomes.length - created.length;

  const describe = (outcome: RequestOutcome) =>
    `${rolesById.get(outcome.request.scenarioId)?.name ?? "Сценарий"}, ${groupName(outcome.request.groupId)}: ${outcome.request.studentIds
      .map(studentName)
      .join(", ")}`;

  return (
    <Paper withBorder p="md" aria-live="polite">
      <Stack gap="sm">
        <Title order={3} size="h5" fw={600}>
          {failed === 0 ? `Создано занятий: ${created.length}` : `Создано ${created.length} из ${outcomes.length}`}
        </Title>
        <List size="sm" spacing={4}>
          {outcomes.map((outcome) => (
            <List.Item key={outcome.request.key}>
              {outcome.result.ok ? (
                <Anchor
                  component={Link}
                  to={`/teacher/lessons/${outcome.result.lessonId}`}
                  size="sm"
                  c="povDark2.6"
                  underline="always"
                >
                  {describe(outcome)}
                </Anchor>
              ) : (
                <Text size="sm">
                  {describe(outcome)} — не создано. {outcome.result.message}
                </Text>
              )}
            </List.Item>
          ))}
        </List>
        {failed > 0 && (
          <Group gap="xs">
            <Button size="sm" loading={retrying} onClick={onRetry}>
              Повторить неудавшиеся: {failed}
            </Button>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}
