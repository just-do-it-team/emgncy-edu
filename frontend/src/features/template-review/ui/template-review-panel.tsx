import { Group, Paper, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Link } from "react-router-dom";
import {
  failureOf,
  publishBlock,
  reviewSectionLabels,
  reviewSectionsOf,
  sectionState,
  sectionStateLabels,
  templateReviewProgress,
  useUpdateTemplate,
  type ReviewSection,
} from "@/entities/scenario";
import {
  errorDetail,
  errorStatus,
  type ScenarioTemplate,
  type TemplateReviewDecision,
  type TemplateUpdateRequest,
} from "@/shared/api";
import { Button, tooltipEvents } from "@/shared/ui";

function failureText(error: unknown): string {
  const failure = failureOf(errorStatus(error), errorDetail(error), () => "");

  return failure.kind === "validation" ? failure.issues.map((issue) => issue.message).join(" ") : failure.message;
}

function request(template: ScenarioTemplate, body: TemplateUpdateRequest["body"]): TemplateUpdateRequest {
  return template.kind === "call"
    ? { kind: "call", templateId: template.id, body }
    : { kind: "card", templateId: template.id, body };
}

interface TemplateReviewPanelProps {
  template: ScenarioTemplate;
  userId: string;
  returnTo: string | null;
  onPublished: (template: ScenarioTemplate) => void;
}

export function TemplateReviewPanel({ template, userId, returnTo, onPublished }: TemplateReviewPanelProps) {
  const update = useUpdateTemplate();
  const progress = templateReviewProgress(template);
  const block = publishBlock(template);
  const editPath = (section: ReviewSection) =>
    `/teacher/scenarios/templates/${template.kind}/${template.id}/edit?${new URLSearchParams({
      sections: section,
      ...(returnTo === null ? {} : { returnTo }),
    }).toString()}`;

  const decide = (section: ReviewSection, decision: TemplateReviewDecision) =>
    update.mutate(request(template, { updated_by: userId, review_decisions: { [section]: decision }, status: null }), {
      onError: (error) =>
        notifications.show({ title: "Решение не сохранено", message: failureText(error), color: "red" }),
    });

  const publish = () =>
    update.mutate(request(template, { updated_by: userId, review_decisions: {}, status: "PUBLISHED" }), {
      onSuccess: (published) => {
        notifications.show({ title: "Шаблон опубликован", message: published.name, color: "gray" });
        onPublished(published);
      },
      onError: (error) =>
        notifications.show({ title: "Шаблон не опубликован", message: failureText(error), color: "red" }),
    });

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <Stack gap={2}>
            <Title order={3} size="h5" fw={600}>
              Проверка черновика ИИ
            </Title>
            <Text size="sm">
              Проверено {progress.done} из {progress.total}. Опубликовать можно, когда каждая секция подтверждена или
              исправлена; до публикации шаблон нельзя поставить в сценарий.
            </Text>
          </Stack>
          <Tooltip label={block} disabled={block === null} events={tooltipEvents} multiline w={320} color="povDark.6" radius={0}>
            <Button
              size="sm"
              loading={update.isPending}
              data-disabled={block !== null || undefined}
              aria-disabled={block !== null}
              onClick={(event) => {
                if (block !== null) event.preventDefault();
                else publish();
              }}
            >
              Опубликовать
            </Button>
          </Tooltip>
        </Group>

        <Table verticalSpacing="xs" layout="fixed">
          <colgroup>
            <col />
            <col width={200} />
            <col width={330} />
          </colgroup>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Секция</Table.Th>
              <Table.Th>Решение</Table.Th>
              <Table.Th>Действия</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {reviewSectionsOf(template).map((section) => {
              const state = sectionState(template, section);

              return (
                <Table.Tr key={section}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {reviewSectionLabels[section]}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={state === "REJECTED" ? 600 : undefined} c={state === "AI_PROPOSED" ? "povDark2.6" : undefined}>
                      {sectionStateLabels[state]}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Button
                        size="compact-xs"
                        variant="outline"
                        color="povDark2.6"
                        disabled={update.isPending || state === "CONFIRMED"}
                        aria-label={`${reviewSectionLabels[section]}: подтвердить`}
                        onClick={() => decide(section, "CONFIRMED")}
                      >
                        Подтвердить
                      </Button>
                      <Button
                        size="compact-xs"
                        variant="outline"
                        color="povDark2.6"
                        component={Link}
                        to={editPath(section)}
                        aria-label={`${reviewSectionLabels[section]}: исправить в редакторе`}
                      >
                        Исправить
                      </Button>
                      <Button
                        size="compact-xs"
                        variant="outline"
                        color="povDark2.6"
                        disabled={update.isPending || state === "REJECTED"}
                        aria-label={`${reviewSectionLabels[section]}: отклонить`}
                        onClick={() => decide(section, "REJECTED")}
                      >
                        Отклонить
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
        <Text size="xs" c="povDark2.6">
          «Исправить» открывает редактор черновика: после сохранения секция отмечается как исправленная. Отклонённую
          секцию тоже нужно исправить — иначе шаблон не опубликовать.
        </Text>
      </Stack>
    </Paper>
  );
}
