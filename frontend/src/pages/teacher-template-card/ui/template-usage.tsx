import { Anchor, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
import { scenarioStatusLabels, type TemplateEntry, type TemplateUsage } from "@/entities/scenario";
import type { ScenarioTemplate } from "@/shared/api";
import { formatDateTime } from "@/shared/lib";
import { LinkRow } from "@/shared/ui";
import classes from "./template-card.module.scss";

interface TemplateVersionsProps {
  entry: TemplateEntry;
  currentId: string;
  teacherId: string;
}

export function TemplateVersions({ entry, currentId, teacherId }: TemplateVersionsProps) {
  return (
    <Stack gap="sm">
      <Title order={3} size="h5" fw={600}>
        Версии
      </Title>
      <Paper withBorder>
        <Table verticalSpacing="sm" highlightOnHover layout="fixed">
          <colgroup>
            <col width={120} />
            <col />
            <col width={170} />
            <col width={120} />
            <col width={180} />
          </colgroup>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Версия</Table.Th>
              <Table.Th>Название</Table.Th>
              <Table.Th>Создана</Table.Th>
              <Table.Th>Активна</Table.Th>
              <Table.Th>Автор</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {entry.versions.map((version: ScenarioTemplate) => (
              <LinkRow key={version.id}>
                <Table.Td>
                  <Anchor
                    component={Link}
                    to={`/teacher/scenarios/templates/${version.kind}/${version.id}`}
                    size="sm"
                    c="povDark2.6"
                    underline="never"
                    data-row-link
                    fw={version.id === currentId ? 600 : undefined}
                    aria-current={version.id === currentId ? "page" : undefined}
                  >
                    {version.id === currentId ? `${version.version}, открыта` : version.version}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" lineClamp={1}>
                    {version.name}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" className={classes.numeric}>
                    {formatDateTime(version.createdAt)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c={version.isActive ? undefined : "povDark2.6"}>
                    {version.isActive ? "да" : "нет"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c={version.createdBy === teacherId ? undefined : "povDark2.6"}>
                    {version.createdBy === teacherId ? "Вы" : "Другой преподаватель"}
                  </Text>
                </Table.Td>
              </LinkRow>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}

interface TemplateUsageTableProps {
  usages: TemplateUsage[] | null;
  latestVersion: number;
}

export function TemplateUsageTable({ usages, latestVersion }: TemplateUsageTableProps) {
  return (
    <Stack gap="sm">
      <Title order={3} size="h5" fw={600}>
        Используется в сценариях
      </Title>
      {usages === null ? (
        <Paper withBorder p="md">
          <Text size="sm" c="povDark2.6">
            Список сценариев не загрузился, использование шаблона неизвестно.
          </Text>
        </Paper>
      ) : usages.length === 0 ? (
        <Paper withBorder p="md">
          <Text size="sm" c="povDark2.6">
            Ни один сценарий не ссылается на этот шаблон.
          </Text>
        </Paper>
      ) : (
        <Paper withBorder>
          <Table verticalSpacing="sm" highlightOnHover layout="fixed">
            <colgroup>
              <col />
              <col width={130} />
              <col width={260} />
            </colgroup>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Сценарий</Table.Th>
                <Table.Th>Статус</Table.Th>
                <Table.Th>Версия шаблона в сценарии</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {usages.map((usage) => (
                <LinkRow key={`${usage.scenarioId}:${usage.templateId}`}>
                  <Table.Td>
                    <Anchor
                      component={Link}
                      to={`/teacher/scenarios/${usage.scenarioId}`}
                      size="sm"
                      c="povDark2.6"
                      underline="never"
                      data-row-link
                      className={classes.truncatedLink}
                    >
                      {usage.scenarioName}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{scenarioStatusLabels[usage.scenarioStatus]}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c={usage.outdated ? "povDark2.6" : undefined}>
                      {usage.outdated
                        ? `версия ${usage.version}, устаревшая: последняя ${latestVersion}`
                        : `версия ${usage.version}, последняя`}
                    </Text>
                  </Table.Td>
                </LinkRow>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
