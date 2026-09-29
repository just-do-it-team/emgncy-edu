import { useState } from "react";
import { Alert, Anchor, Group, Modal, MultiSelect, Paper, Skeleton, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useAddGroupMembers, useRemoveGroupMember, useRenameGroup, useSetGroupActive, useTeacherGroups } from "@/entities/group";
import { useSessionStore } from "@/entities/session";
import { studentKeys, useTeacherStudents } from "@/entities/student";
import type { Group as LearningGroup } from "@/shared/api";
import { Button, tooltipEvents } from "@/shared/ui";
import { DUPLICATE_NAME, groupFailureText, isDuplicateName } from "../model/group-failure";
import { descriptionOrNull, validateGroupName, type GroupFieldsValues } from "../model/group-draft";
import { GroupFields } from "./group-fields";

const GROUPS_PATH = "/teacher/groups";
const ARCHIVED_HINT = "Группа в архиве: верните её из архива, чтобы менять состав и назначать занятия.";

function RenameModal({ group, teacherId, onClose }: { group: LearningGroup; teacherId: string; onClose: () => void }) {
  const rename = useRenameGroup();
  const form = useForm<GroupFieldsValues>({
    initialValues: { name: group.name, description: group.description ?? "" },
    validate: { name: validateGroupName },
  });

  const submit = form.onSubmit((values) =>
    rename.mutate(
      { groupId: group.id, actorId: teacherId, name: values.name.trim(), description: descriptionOrNull(values.description) },
      {
        onSuccess: onClose,
        onError: (error) => {
          if (isDuplicateName(error)) form.setFieldError("name", DUPLICATE_NAME);
          else notifications.show({ title: "Группа не изменена", message: groupFailureText(error), color: "red" });
        },
      },
    ),
  );

  return (
    <Modal opened onClose={onClose} title="Изменить группу" centered radius={2} transitionProps={{ duration: 0 }}>
      <form onSubmit={submit} noValidate>
        <Stack gap="sm">
          <GroupFields form={form} />
          <Group justify="flex-end" gap="xs">
            <Button size="sm" variant="outline" color="povDark2.6" onClick={onClose} disabled={rename.isPending}>
              Отмена
            </Button>
            <Button size="sm" type="submit" loading={rename.isPending}>
              Сохранить
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function ArchiveModal({ group, teacherId, onClose }: { group: LearningGroup; teacherId: string; onClose: () => void }) {
  const setActive = useSetGroupActive();
  const archiving = group.isActive;

  const confirm = () =>
    setActive.mutate(
      { groupId: group.id, actorId: teacherId, active: !archiving },
      {
        onSuccess: () => {
          notifications.show({
            title: archiving ? "Группа в архиве" : "Группа возвращена из архива",
            message: group.name,
            color: "gray",
          });
          onClose();
        },
        onError: (error) =>
          notifications.show({ title: "Действие не выполнено", message: groupFailureText(error), color: "red" }),
      },
    );

  return (
    <Modal
      opened
      onClose={onClose}
      title={archiving ? "Перенести группу в архив" : "Вернуть группу из архива"}
      centered
      radius={2}
      transitionProps={{ duration: 0 }}
    >
      <Stack gap="sm">
        <Text size="sm">
          {archiving
            ? `Группа «${group.name}» уйдёт в архив: состав не будет меняться, новые занятия ей не назначить. Уже назначенные занятия и результаты сохранятся. Удалить группу нельзя — только архивировать.`
            : `Группа «${group.name}» снова станет активной: можно менять состав и назначать занятия.`}
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button size="sm" variant="outline" color="povDark2.6" onClick={onClose} disabled={setActive.isPending}>
            Отмена
          </Button>
          <Button size="sm" loading={setActive.isPending} onClick={confirm}>
            {archiving ? "В архив" : "Вернуть"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function Members({ group, teacherId }: { group: LearningGroup; teacherId: string }) {
  const queryClient = useQueryClient();
  const students = useTeacherStudents(teacherId);
  const add = useAddGroupMembers();
  const remove = useRemoveGroupMember();
  const [picked, setPicked] = useState<string[]>([]);
  const inGroup = new Set(group.students.map((student) => student.id));
  const candidates = (students.data ?? []).filter((student) => !student.isBlocked && !inGroup.has(student.id));
  const locked = !group.isActive;
  const refreshStudents = () => queryClient.invalidateQueries({ queryKey: studentKeys.all });
  const fail = (error: unknown) =>
    notifications.show({ title: "Состав не изменён", message: groupFailureText(error), color: "red" });

  const addPicked = () => {
    const chosen = new Set(picked);

    add.mutate(
      {
        groupId: group.id,
        actorId: teacherId,
        students: candidates
          .filter((student) => chosen.has(student.id))
          .map((student) => ({ id: student.id, displayName: student.displayName })),
      },
      {
        onSuccess: () => {
          setPicked([]);
          void refreshStudents();
        },
        onError: fail,
      },
    );
  };

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Title order={3} size="h5" fw={600}>
          Состав: {group.students.length}
        </Title>

        <Tooltip label={ARCHIVED_HINT} disabled={!locked} events={tooltipEvents} multiline w={320} color="povDark.6" radius={0}>
          <Group gap="xs" align="flex-end" wrap="wrap">
            <MultiSelect
              size="xs"
              w={{ base: "100%", sm: 420 }}
              label="Добавить обучаемых"
              placeholder={students.isPending ? "Загружаем список…" : "Найдите по фамилии"}
              data={candidates.map((student) => ({ value: student.id, label: student.displayName }))}
              value={picked}
              onChange={setPicked}
              searchable
              clearable
              disabled={locked || students.isError}
              error={students.isError ? "Список обучаемых не загрузился." : undefined}
              nothingFoundMessage="Никого не нашли"
            />
            <Button
              size="xs"
              loading={add.isPending}
              disabled={locked || picked.length === 0}
              onClick={addPicked}
            >
              {picked.length === 0 ? "Добавить" : `Добавить: ${picked.length}`}
            </Button>
          </Group>
        </Tooltip>
        {students.isSuccess && candidates.length === 0 && !locked && (
          <Text size="xs" c="povDark2.6">
            Добавлять некого: в списке — обучаемые из ваших групп и те, кому вы уже назначали занятия.
          </Text>
        )}

        {group.students.length === 0 ? (
          <Text size="sm">В группе пока никого нет.</Text>
        ) : (
          <Table verticalSpacing={6} fz="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Обучаемый</Table.Th>
                <Table.Th w={140} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {group.students.map((student) => (
                <Table.Tr key={student.id}>
                  <Table.Td>{student.displayName}</Table.Td>
                  <Table.Td>
                    <Tooltip label={ARCHIVED_HINT} disabled={!locked} events={tooltipEvents} multiline w={320} color="povDark.6" radius={0}>
                      <Button
                        size="xs"
                        variant="outline"
                        color="povDark2.6"
                        data-disabled={locked || undefined}
                        aria-disabled={locked}
                        loading={remove.isPending && remove.variables.studentId === student.id}
                        onClick={(event) => {
                          if (locked) {
                            event.preventDefault();
                            return;
                          }
                          remove.mutate(
                            { groupId: group.id, actorId: teacherId, studentId: student.id },
                            { onSuccess: () => void refreshStudents(), onError: fail },
                          );
                        }}
                      >
                        Убрать
                      </Button>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Paper>
  );
}

function GroupCard({ group, teacherId }: { group: LearningGroup; teacherId: string }) {
  const [dialog, setDialog] = useState<"rename" | "archive" | null>(null);
  const assignBlock = !group.isActive ? ARCHIVED_HINT : group.students.length === 0 ? "Сначала добавьте обучаемых в группу." : null;

  return (
    <Stack gap="md">
      <Anchor component={Link} to={GROUPS_PATH} size="sm" c="povDark2.6" underline="always" w="fit-content">
        Все группы
      </Anchor>
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Stack gap={4}>
          <Title order={2} size="h4" fw={600}>
            {group.name}
          </Title>
          <Text size="sm" c={group.description ? undefined : "povDark2.6"}>
            {group.description ?? "Без описания"}
          </Text>
          {!group.isActive && (
            <Text size="sm" fw={600}>
              В архиве
            </Text>
          )}
        </Stack>
        <Group gap="xs" wrap="wrap">
          <Tooltip label={assignBlock} disabled={assignBlock === null} events={tooltipEvents} multiline w={320} color="povDark.6" radius={0}>
            <Button
              size="sm"
              component={Link}
              to={`/teacher/lessons/new?group=${group.id}`}
              data-disabled={assignBlock !== null || undefined}
              aria-disabled={assignBlock !== null}
              onClick={(event) => {
                if (assignBlock !== null) event.preventDefault();
              }}
            >
              Назначить занятие этой группе
            </Button>
          </Tooltip>
          <Button size="sm" variant="outline" color="povDark2.6" onClick={() => setDialog("rename")}>
            Изменить
          </Button>
          <Button size="sm" variant="outline" color="povDark2.6" onClick={() => setDialog("archive")}>
            {group.isActive ? "В архив" : "Вернуть из архива"}
          </Button>
        </Group>
      </Group>

      <Members group={group} teacherId={teacherId} />

      {dialog === "rename" && <RenameModal group={group} teacherId={teacherId} onClose={() => setDialog(null)} />}
      {dialog === "archive" && <ArchiveModal group={group} teacherId={teacherId} onClose={() => setDialog(null)} />}
    </Stack>
  );
}

function GroupDetails({ groupId, teacherId }: { groupId: string; teacherId: string }) {
  const groups = useTeacherGroups(teacherId);
  const group = groups.data?.find((candidate) => candidate.id === groupId);

  if (groups.isPending) return <Skeleton height={320} radius={2} />;

  if (groups.isError || group === undefined) {
    return (
      <Alert variant="outline" color="povDark2.6" title={groups.isError ? "Не удалось загрузить группу" : "Группа не найдена"}>
        <Stack gap="xs" align="flex-start">
          <Text size="sm">
            {groups.isError ? "Сервер не ответил. Повторите запрос позже." : "Группа удалена, принадлежит другому преподавателю или адрес неверный."}
          </Text>
          {groups.isError ? (
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => groups.refetch()}>
              Повторить
            </Button>
          ) : (
            <Anchor component={Link} to={GROUPS_PATH} size="sm" c="povDark2.6" underline="always">
              К списку групп
            </Anchor>
          )}
        </Stack>
      </Alert>
    );
  }

  return <GroupCard group={group} teacherId={teacherId} />;
}

const TeacherGroupPage = () => {
  const { groupId } = useParams();
  const teacherId = useSessionStore((state) => state.profile?.userId ?? null);

  if (teacherId === null || groupId === undefined) return null;

  return <GroupDetails groupId={groupId} teacherId={teacherId} />;
};

export default TeacherGroupPage;
