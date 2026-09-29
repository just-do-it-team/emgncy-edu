import { Anchor, Paper, Table, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import { templateReviewProgress, templateState, templateStateLabels, templateVariantLabels } from "@/entities/scenario";
import type { ScenarioTemplate } from "@/shared/api";

export function GeneratedTemplates({ templates }: { templates: ScenarioTemplate[] }) {
  return (
    <Paper withBorder>
      <Table verticalSpacing="sm" layout="fixed">
        <colgroup>
          <col />
          <col width={150} />
          <col width={130} />
          <col width={210} />
        </colgroup>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Шаблон</Table.Th>
            <Table.Th>Вид</Table.Th>
            <Table.Th>Проверено</Table.Th>
            <Table.Th>Статус</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {templates.map((template) => {
            const progress = templateReviewProgress(template);

            return (
              <Table.Tr key={template.id}>
                <Table.Td>
                  <Anchor
                    component={Link}
                    to={`/teacher/scenarios/templates/${template.kind}/${template.id}`}
                    size="sm"
                    c="povDark2.6"
                    underline="always"
                  >
                    {template.name}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{templateVariantLabels[template.variant]}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {progress.done} из {progress.total}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{templateStateLabels[templateState(template)]}</Text>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}
