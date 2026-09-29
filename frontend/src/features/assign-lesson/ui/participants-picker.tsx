import { useState } from "react";
import { Checkbox, Group, Paper, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { Search } from "lucide-react";
import type { ScenarioListItem } from "@/shared/api";
import { Button } from "@/shared/ui";
import {
  positionLabel,
  rowKey,
  rowScenarioId,
  type AssignmentDraft,
  type AssignmentRow,
  type ScenarioRoles,
} from "../model/assignment-plan";
import classes from "./assign-lesson.module.scss";

const OPERATOR = "operator";

export interface PickerStudent {
  id: string;
  displayName: string;
  hint: string | null;
}

export interface PickerSection {
  groupId: string | null;
  title: string | null;
  students: PickerStudent[];
}

interface ParticipantsPickerProps {
  form: UseFormReturnType<AssignmentDraft>;
  resolved: AssignmentDraft;
  sections: PickerSection[];
  emptyText: string;
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
  const name = (code: string) => services.find((service) => service.code === code)?.name ?? `служба ${code}`;
  const required = roles.workspaceMode === "INDIVIDUAL" ? (roles.requiredPositions?.[0] ?? undefined) : undefined;

  if (roles.workspaceMode === "INDIVIDUAL" && (hasCalls || required !== undefined)) {
    return (
      <Stack gap={0} data-path={`rows.${index}.position`} tabIndex={-1}>
        <Text size="sm">{positionLabel(required === undefined ? null : required, name)}</Text>
        {required !== undefined && (
          <Text size="xs" c="povDark2.6">
            задано в сценарии
          </Text>
        )}
        {error && (
          <Text size="xs" c="var(--mantine-color-error)">
            {error}
          </Text>
        )}
      </Stack>
    );
  }

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
  const { form, resolved, sections, emptyText, scenarios, rolesById, active, services, errors } = props;
  const [query, setQuery] = useState("");
  const [bulkScenario, setBulkScenario] = useState<string | null>(null);
  const draft = form.values;
  const perStudent = draft.mode === "perStudent";
  const needle = query.trim().toLocaleLowerCase("ru");
  const indexByKey = new Map(draft.rows.map((row, index) => [rowKey(row), index]));
  const scenarioOptions = scenarios.map((scenario) => ({ value: scenario.id, label: scenario.name }));

  const setRows = (rows: AssignmentRow[]) => form.setFieldValue("rows", rows);
  const newRow = (groupId: string | null, studentId: string): AssignmentRow => ({
    groupId,
    studentId,
    scenarioId: null,
    position: null,
    manual: false,
  });
  const toggle = (groupId: string | null, studentId: string, checked: boolean) =>
    setRows(
      checked
        ? [...draft.rows, newRow(groupId, studentId)]
        : draft.rows.filter((row) => rowKey(row) !== rowKey({ groupId, studentId })),
    );
  const toggleSection = (section: PickerSection, checked: boolean) =>
    setRows(
      checked
        ? [
            ...draft.rows,
            ...section.students
              .filter((student) => !indexByKey.has(rowKey({ groupId: section.groupId, studentId: student.id })))
              .map((student) => newRow(section.groupId, student.id)),
          ]
        : draft.rows.filter((row) => row.groupId !== section.groupId),
    );
  const updateRow = (index: number, patch: Partial<AssignmentRow>) =>
    setRows(draft.rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));

  if (sections.length === 0) return <Text size="sm">{emptyText}</Text>;

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

      {sections.map((section) => {
        const selected = section.students.filter((student) =>
          indexByKey.has(rowKey({ groupId: section.groupId, studentId: student.id })),
        ).length;
        const visible = section.students.filter(
          (student) => needle === "" || student.displayName.toLocaleLowerCase("ru").includes(needle),
        );

        return (
          <Paper key={section.groupId ?? "students"} withBorder p="sm" radius={2}>
            <Stack gap="xs">
              <Group justify="space-between" wrap="wrap" gap="sm">
                <Checkbox
                  size="xs"
                  color="povDark2.6"
                  label={section.title ?? "Все обучаемые"}
                  checked={section.students.length > 0 && selected === section.students.length}
                  indeterminate={selected > 0 && selected < section.students.length}
                  disabled={section.students.length === 0}
                  onChange={(event) => toggleSection(section, event.currentTarget.checked)}
                />
                <Text size="xs" c="povDark2.6">
                  выбрано {selected} из {section.students.length}
                </Text>
              </Group>
              {section.students.length === 0 ? (
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
                      const index = indexByKey.get(rowKey({ groupId: section.groupId, studentId: student.id }));
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
                              onChange={(event) => toggle(section.groupId, student.id, event.currentTarget.checked)}
                            />
                          </Table.Td>
                          <Table.Td className={classes.wrap}>
                            {student.displayName}
                            {student.hint && (
                              <Text size="xs" c="povDark2.6">
                                {student.hint}
                              </Text>
                            )}
                          </Table.Td>
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
