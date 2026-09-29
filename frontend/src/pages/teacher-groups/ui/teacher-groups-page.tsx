import { useState } from "react";
import { Alert, Anchor, Group, Modal, MultiSelect, Paper, SegmentedControl, Skeleton, Stack, Table, Text, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useAssignments } from "@/entities/assignment";
import { useCreateGroup, useTeacherGroups } from "@/entities/group";
import { useSessionStore } from "@/entities/session";
import { studentKeys, useTeacherStudents } from "@/entities/student";
import type { TeacherAssignment } from "@/shared/api";
import { Button, LinkRow, TablePagination, usePagination } from "@/shared/ui";
import { DUPLICATE_NAME, groupFailureText, isDuplicateName } from "../model/group-failure";
import { descriptionOrNull, validateGroupName, type GroupFieldsValues } from "../model/group-draft";
import { GroupFields } from "./group-fields";

type GroupsView = "active" | "archived";

const viewOptions: { value: GroupsView; label: string }[] = [
  { value: "active", label: "Активные" },
  { value: "archived", label: "Архив" },
];

function isView(value: string): value is GroupsView {
  return value === "active" || value === "archived";
}

function lessonsByGroup(assignments: TeacherAssignment[]): Map<string, number> {
  const lessons = new Map<string, Set<string>>();

  for (const assignment of assignments) {
    if (assignment.groupId === null || assignment.status === "CANCELLED") continue;

    lessons.set(assignment.groupId, (lessons.get(assignment.groupId) ?? new Set()).add(assignment.batchId ?? assignment.id));
  }

  return new Map([...lessons].map(([groupId, ids]) => [groupId, ids.size]));
}

interface CreateGroupValues extends GroupFieldsValues {
  studentIds: string[];
}

function CreateGroupModal({ teacherId, onClose }: { teacherId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const students = useTeacherStudents(teacherId);
  const create = useCreateGroup();
  const form = useForm<CreateGroupValues>({
    initialValues: { name: "", description: "", studentIds: [] },
    validate: { name: validateGroupName },
  });
  const options = (students.data ?? [])
    .filter((student) => !student.isBlocked)
    .map((student) => ({ value: student.id, label: student.displayName }));

  const submit = form.onSubmit((values) => {
    const picked = new Set(values.studentIds);

    create.mutate(
      {
        teacherId,
        name: values.name.trim(),
        description: descriptionOrNull(values.description),
        students: (students.data ?? [])
          .filter((student) => picked.has(student.id))
          .map((student) => ({ id: student.id, displayName: student.displayName })),
      },
      {
        onSuccess: (group) => {
          void queryClient.invalidateQueries({ queryKey: studentKeys.all });
          notifications.show({ title: "Группа создана", message: group.name, color: "gray" });
          navigate(`/teacher/groups/${group.id}`);
        },
        onError: (error) => {
          if (isDuplicateName(error)) form.setFieldError("name", DUPLICATE_NAME);
          else notifications.show({ title: "Группа не создана", message: groupFailureText(error), color: "red" });
        },
      },
    );
  });

  return (
    <Modal opened onClose={onClose} title="Новая группа" centered radius={2} transitionProps={{ duration: 0 }}>
      <form onSubmit={submit} noValidate>
        <Stack gap="sm">
          <GroupFields form={form} />
          <MultiSelect
            size="sm"
            label="Обучаемые"
            placeholder={students.isPending ? "Загружаем список…" : "Найдите по фамилии"}
            description="Можно добавить позже на странице группы"
            data={options}
            searchable
            clearable
            disabled={students.isError}
            error={students.isError ? "Список обучаемых не загрузился — добавьте их позже на странице группы." : undefined}
            nothingFoundMessage="Никого не нашли"
            {...form.getInputProps("studentIds")}
          />
          <Group justify="flex-end" gap="xs">
            <Button size="sm" variant="outline" color="povDark2.6" onClick={onClose} disabled={create.isPending}>
              Отмена
            </Button>
            <Button size="sm" type="submit" loading={create.isPending}>
              Создать
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function GroupsList({ teacherId }: { teacherId: string }) {
  const groups = useTeacherGroups(teacherId);
  const assignments = useAssignments({ assignedBy: teacherId });
  const [view, setView] = useState<GroupsView>("active");
  const [creating, setCreating] = useState(false);
  const visible = (groups.data ?? []).filter((group) => group.isActive === (view === "active"));
  const pagination = usePagination(visible);
  const lessons = lessonsByGroup(assignments.data ?? []);

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Title order={2} size="h4" fw={600}>
          Группы
        </Title>
        <Button size="sm" onClick={() => setCreating(true)}>
          Создать группу
        </Button>
      </Group>

      <SegmentedControl
        size="xs"
        radius={2}
        color="povDark2.6"
        w="fit-content"
        data={viewOptions}
        value={view}
        onChange={(value) => {
          if (isView(value)) setView(value);
        }}
        aria-label="Какие группы показать"
      />

      {groups.isPending && (
        <Paper withBorder p="md">
          <Stack gap="xs">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} height={28} radius={2} />
            ))}
          </Stack>
        </Paper>
      )}

      {groups.isError && (
        <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить группы">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">Сервер не ответил. Повторите запрос позже.</Text>
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => groups.refetch()}>
              Повторить
            </Button>
          </Stack>
        </Alert>
      )}

      {groups.isSuccess && visible.length === 0 && (
        <Paper withBorder p="md">
          <Stack gap={4} align="flex-start">
            <Text size="sm" fw={600}>
              {view === "active" ? "Активных групп нет" : "В архиве пусто"}
            </Text>
            {view === "active" && (
              <Text size="sm" c="povDark2.6">
                Создайте группу и добавьте в неё обучаемых — затем занятие можно назначить всей группе сразу.
              </Text>
            )}
          </Stack>
        </Paper>
      )}

      {groups.isSuccess && visible.length > 0 && (
        <Paper withBorder>
          <Table verticalSpacing="sm" layout="fixed" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={260}>Название</Table.Th>
                <Table.Th>Описание</Table.Th>
                <Table.Th w={120}>Обучаемых</Table.Th>
                <Table.Th w={120}>Занятий</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagination.rows.map((group) => (
                <LinkRow key={group.id}>
                  <Table.Td>
                    <Anchor
                      component={Link}
                      to={`/teacher/groups/${group.id}`}
                      size="sm"
                      fw={600}
                      c="povDark2.6"
                      underline="never"
                      lineClamp={2}
                      data-row-link
                    >
                      {group.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c={group.description ? undefined : "povDark2.6"} lineClamp={2}>
                      {group.description ?? "Без описания"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{group.students.length}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{assignments.isSuccess ? (lessons.get(group.id) ?? 0) : "—"}</Text>
                  </Table.Td>
                </LinkRow>
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

      {creating && <CreateGroupModal teacherId={teacherId} onClose={() => setCreating(false)} />}
    </Stack>
  );
}

const TeacherGroupsPage = () => {
  const teacherId = useSessionStore((state) => state.profile?.userId ?? null);

  if (teacherId === null) return null;

  return <GroupsList teacherId={teacherId} />;
};

export default TeacherGroupsPage;
