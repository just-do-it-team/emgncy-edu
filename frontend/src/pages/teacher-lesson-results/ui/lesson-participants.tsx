import { Paper, Stack, Table, Text, Title } from "@mantine/core";
import { participantStatusLabels } from "@/entities/assignment";
import { participantRoleLabels } from "@/entities/monitoring";
import type { Lesson } from "@/features/teacher-lessons";
import type { TeacherAssignment, TeacherAssignmentParticipant } from "@/shared/api";
import { formatShortDateTime } from "@/shared/lib";
import { TablePagination, usePagination } from "@/shared/ui";
import classes from "./lesson-results.module.scss";

interface ParticipantRow {
  key: string;
  name: string;
  participant: TeacherAssignmentParticipant;
  usedAttempts: number;
  maxAttempts: number;
}

function participantRows(lesson: Lesson, names: Map<string, string> | undefined): ParticipantRow[] {
  const attemptsByAssignment = new Map<string, number>();

  for (const session of lesson.sessions) {
    attemptsByAssignment.set(session.assignmentId, (attemptsByAssignment.get(session.assignmentId) ?? 0) + 1);
  }

  const rowsOf = (assignment: TeacherAssignment) =>
    assignment.participants.map((participant) => ({
      key: `${assignment.id}:${participant.userId}`,
      name: names?.get(participant.userId) ?? `обучаемый ${participant.userId.slice(0, 8)}`,
      participant,
      usedAttempts: attemptsByAssignment.get(assignment.id) ?? 0,
      maxAttempts: assignment.maxAttempts,
    }));

  return lesson.assignments.flatMap(rowsOf).sort((first, second) => first.name.localeCompare(second.name, "ru"));
}

function MomentCell({ value }: { value: string | null }) {
  return value === null ? (
    <Text size="sm" c="povDark2.6">
      —
    </Text>
  ) : (
    <Text size="sm" className={classes.numeric}>
      {formatShortDateTime(value)}
    </Text>
  );
}

interface LessonParticipantsProps {
  lesson: Lesson;
  names: Map<string, string> | undefined;
}

export function LessonParticipants({ lesson, names }: LessonParticipantsProps) {
  const rows = participantRows(lesson, names);
  const pagination = usePagination(rows);
  const showPosition = rows.some((row) => row.participant.positionCode !== null);

  return (
    <Stack gap="sm">
      <Title order={3} size="h5" fw={600}>
        Участники
      </Title>
      {rows.length === 0 ? (
        <Paper withBorder p="md">
          <Text size="sm" c="povDark2.6">
            В назначениях занятия нет участников.
          </Text>
        </Paper>
      ) : (
        <Paper withBorder>
          <Table verticalSpacing="sm" layout="fixed">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Обучаемый</Table.Th>
                <Table.Th w={140}>Роль</Table.Th>
                {showPosition && <Table.Th w={120}>Позиция ДДС</Table.Th>}
                <Table.Th w={110}>Статус</Table.Th>
                <Table.Th w={130}>Готов к старту</Table.Th>
                <Table.Th w={130}>Завершил</Table.Th>
                <Table.Th w={90}>Попыток</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagination.rows.map((row) => (
                <Table.Tr key={row.key}>
                  <Table.Td>
                    <Text size="sm" truncate="end">
                      {row.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{participantRoleLabels[row.participant.role]}</Text>
                  </Table.Td>
                  {showPosition && (
                    <Table.Td>
                      <Text size="sm" c={row.participant.positionCode ? undefined : "povDark2.6"}>
                        {row.participant.positionCode ?? "—"}
                      </Text>
                    </Table.Td>
                  )}
                  <Table.Td>
                    <Text size="sm">{participantStatusLabels[row.participant.status]}</Text>
                  </Table.Td>
                  <Table.Td>
                    <MomentCell value={row.participant.readyAt} />
                  </Table.Td>
                  <Table.Td>
                    <MomentCell value={row.participant.completedAt} />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" className={classes.numeric}>
                      {row.usedAttempts} из {row.maxAttempts}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <TablePagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onPageChange={pagination.onPageChange}
            onPageSizeChange={pagination.onPageSizeChange}
          />
        </Paper>
      )}
    </Stack>
  );
}
