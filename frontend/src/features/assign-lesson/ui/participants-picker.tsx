import { useState } from "react";
import { Checkbox, Group, Paper, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { Search } from "lucide-react";
import type { Group as LearningGroup, ScenarioListItem } from "@/shared/api";
import { Button } from "@/shared/ui";
import {
  rowKey,
  rowScenarioId,
  type AssignmentDraft,
  type AssignmentRow,
  type ScenarioRoles,
} from "../model/assignment-plan";
import classes from "./assign-lesson.module.scss";

const OPERATOR = "operator";

interface ParticipantsPickerProps {
  form: UseFormReturnType<AssignmentDraft>;
  resolved: AssignmentDraft;
  groups: LearningGroup[];
  scenarios: ScenarioListItem[];
  rolesById: Map<string, ScenarioRoles>;
  active: Set<string>;
  services: { code: string; name: string }[];
  errors: Record<string, string>;
}

interface RoleCellProps {
  row: AssignmentRow;
  index: number;
  roles: ScenarioRoles | undefined;
  services: { code: string; name: string }[];
  error: string | undefined;
  onChange: (position: string | null) => void;
}

function RoleCell({ row, index, roles, services, error, onChange }: RoleCellProps) {
  if (!roles) return <Text size="sm">—</Text>;

  const hasCalls = roles.callKeys.length > 0;

  if (roles.workspaceMode === "INDIVIDUAL" && hasCalls) {
    return (
      <Text size="sm" data-path={`rows.${index}.position`} tabIndex={-1}>
        Оператор 112
      </Text>
    );
  }

  const name = (code: string) => services.find((service) => service.code === code)?.name ?? `служба ${code}`;
  const codes = roles.ddsServices.length > 0 ? roles.ddsServices : services.map((service) => service.code);
  const data = [
    ...(roles.workspaceMode === "SHARED" ? [{ value: OPERATOR, label: "Оператор 112" }] : []),
    ...codes.map((code) => ({
      value: code,
      label: `ДДС: ${name(code)}${roles.mainServices.includes(code) ? " (главная)" : ""}`,
    })),
  ];

  return (
    <Select
      size="xs"
      w={260}
      aria-label="Роль обучаемого"
      data={data}
      value={row.position ?? (roles.workspaceMode === "SHARED" ? OPERATOR : null)}
      placeholder="Выберите службу"
      allowDeselect={false}
      error={error}
      data-path={`rows.${index}.position`}
      onChange={(value) => {
        if (value !== null) onChange(value === OPERATOR ? null : value);
      }}
    />
  );
}

export function ParticipantsPicker(props: ParticipantsPickerProps) {
  const { form, resolved, groups, scenarios, rolesById, active, services, errors } = props;
  const [query, setQuery] = useState("");
  const [bulkScenario, setBulkScenario] = useState<string | null>(null);
  const draft = form.values;
  const perStudent = draft.mode === "perStudent";
  const needle = query.trim().toLocaleLowerCase("ru");
  const indexByKey = new Map(draft.rows.map((row, index) => [rowKey(row), index]));
  const scenarioOptions = scenarios.map((scenario) => ({ value: scenario.id, label: scenario.name }));

  const setRows = (rows: AssignmentRow[]) => form.setFieldValue("rows", rows);
  const newRow = (groupId: string, studentId: string): AssignmentRow => ({
    groupId,
    studentId,
    scenarioId: null,
    position: null,
    manual: false,
  });
  const toggle = (groupId: string, studentId: string, checked: boolean) =>
    setRows(
      checked
        ? [...draft.rows, newRow(groupId, studentId)]
        : draft.rows.filter((row) => rowKey(row) !== rowKey({ groupId, studentId })),
    );
  const toggleGroup = (group: LearningGroup, checked: boolean) =>
    setRows(
      checked
        ? [
            ...draft.rows,
            ...group.students
              .filter((student) => !indexByKey.has(rowKey({ groupId: group.id, studentId: student.id })))
              .map((student) => newRow(group.id, student.id)),
          ]
        : draft.rows.filter((row) => row.groupId !== group.id),
    );
  const updateRow = (index: number, patch: Partial<AssignmentRow>) =>
    setRows(draft.rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));

  if (groups.length === 0) {
    return (
      <Text size="sm">
        У вас нет активных групп. Создайте группу и добавьте в неё обучаемых в разделе «Группы», затем вернитесь к
        назначению.
      </Text>
    );
  }

  return (
    <Stack gap="sm" data-path="rows" tabIndex={-1}>
      <Group gap="xs" align="flex-end" wrap="wrap">
        <TextInput
          size="xs"
          w={240}
          label="Поиск обучаемого"
          placeholder="Фамилия или имя"
          leftSection={<Search size={14} />}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        {perStudent && (
          <>
            <Select
              size="xs"
              w={300}
              label="Сценарий для выбранных"
              data={scenarioOptions}
              value={bulkScenario}
              onChange={setBulkScenario}
              searchable
              clearable
            />
            <Button
              size="xs"
              variant="outline"
              color="povDark2.6"
              disabled={bulkScenario === null || draft.rows.length === 0}
              onClick={() => setRows(draft.rows.map((row) => ({ ...row, scenarioId: bulkScenario, manual: false })))}
            >
              Всем выбранным
            </Button>
          </>
        )}
      </Group>

      {errors.rows && (
        <Text size="xs" c="var(--mantine-color-error)">
          {errors.rows}
        </Text>
      )}

      {groups.map((group) => {
        const selected = group.students.filter((student) =>
          indexByKey.has(rowKey({ groupId: group.id, studentId: student.id })),
        ).length;
        const visible = group.students.filter(
          (student) => needle === "" || student.displayName.toLocaleLowerCase("ru").includes(needle),
        );

        return (
          <Paper key={group.id} withBorder p="sm" radius={2}>
            <Stack gap="xs">
              <Group justify="space-between" wrap="wrap" gap="sm">
                <Checkbox
                  size="xs"
                  color="povDark2.6"
                  label={`Вся группа «${group.name}»`}
                  checked={group.students.length > 0 && selected === group.students.length}
                  indeterminate={selected > 0 && selected < group.students.length}
                  disabled={group.students.length === 0}
                  onChange={(event) => toggleGroup(group, event.currentTarget.checked)}
                />
                <Text size="xs" c="povDark2.6">
                  выбрано {selected} из {group.students.length}
                </Text>
              </Group>
              {group.students.length === 0 ? (
                <Text size="sm">В группе нет обучаемых.</Text>
              ) : visible.length === 0 ? (
                <Text size="sm">Под поиск никто не попал.</Text>
              ) : (
                <Table verticalSpacing={4} fz="sm" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={36} />
                      <Table.Th>Обучаемый</Table.Th>
                      {perStudent && <Table.Th>Сценарий</Table.Th>}
                      <Table.Th>Роль</Table.Th>
                      <Table.Th>Отметки</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {visible.map((student) => {
                      const index = indexByKey.get(rowKey({ groupId: group.id, studentId: student.id }));
                      const row = index === undefined ? undefined : resolved.rows[index];
                      const scenarioId = row ? rowScenarioId(resolved, row) : null;
                      const busy = scenarioId !== null && active.has(`${scenarioId}:${student.id}`);
                      const note =
                        index === undefined
                          ? null
                          : (errors[`rows.${index}.studentId`] ?? (busy ? "Уже есть активное занятие по этому сценарию" : null));

                      return (
                        <Table.Tr key={student.id}>
                          <Table.Td>
                            <Checkbox
                              size="xs"
                              color="povDark2.6"
                              aria-label={`Выбрать: ${student.displayName}`}
                              checked={index !== undefined}
                              onChange={(event) => toggle(group.id, student.id, event.currentTarget.checked)}
                            />
                          </Table.Td>
                          <Table.Td className={classes.wrap}>{student.displayName}</Table.Td>
                          {perStudent && (
                            <Table.Td>
                              {index !== undefined && row && (
                                <Select
                                  size="xs"
                                  w={280}
                                  aria-label={`Сценарий: ${student.displayName}`}
                                  data={scenarioOptions}
                                  value={row.scenarioId}
                                  placeholder="Выберите сценарий"
                                  searchable
                                  error={errors[`rows.${index}.scenarioId`]}
                                  data-path={`rows.${index}.scenarioId`}
                                  onChange={(value) => updateRow(index, { scenarioId: value, manual: false })}
                                />
                              )}
                            </Table.Td>
                          )}
                          <Table.Td>
                            {index !== undefined && row && (
                              <RoleCell
                                row={row}
                                index={index}
                                roles={scenarioId === null ? undefined : rolesById.get(scenarioId)}
                                services={services}
                                error={errors[`rows.${index}.position`]}
                                onChange={(position) => updateRow(index, { position, manual: true })}
                              />
                            )}
                          </Table.Td>
                          <Table.Td className={classes.wrap}>
                            {note && (
                              <Text size="xs" c="povDark2.6" data-path={`rows.${index}.studentId`} tabIndex={-1}>
                                {note}
                              </Text>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              )}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}
