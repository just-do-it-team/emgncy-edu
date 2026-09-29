import { useState } from "react";
import {
  Alert,
  Anchor,
  Checkbox,
  Group,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { Search, X } from "lucide-react";
import { classifierRecords } from "@/entities/incident";
import {
  difficultyLabel,
  groupTemplates,
  isTemplateUsable,
  templateAuthorLabel,
  templateSourceLabel,
  templateVariantHints,
  templateVariantLabels,
  templateVariantOrder,
  useFreshTemplates,
} from "@/entities/scenario";
import { useSessionStore } from "@/entities/session";
import type { ScenarioTemplate, TemplateVariant } from "@/shared/api";
import { formatShortDateTime } from "@/shared/lib";
import { ActionIcon, Button, FilteredEmpty } from "@/shared/ui";
import { ExpectedResultView, InitialCallView, serviceName } from "@/widgets/expected-result-view";
import classes from "./scenario-editor.module.scss";

const ALL_VARIANTS = "all";
const TABLE_MIN_WIDTH = 980;

const recordNames = new Map(classifierRecords.map((record) => [record.id, record.name]));

const variantOptions = [
  { value: ALL_VARIANTS, label: "Все виды" },
  ...templateVariantOrder.map((variant) => ({ value: variant, label: templateVariantLabels[variant] })),
];

function isVariant(value: string): value is TemplateVariant {
  return templateVariantOrder.some((variant) => variant === value);
}

interface TemplatePickerProps {
  serviceNames: Map<string, string>;
  onClose: () => void;
  onPick: (templates: ScenarioTemplate[]) => void;
}

function typeName(template: ScenarioTemplate): string | null {
  return template.recordId === null ? null : (recordNames.get(template.recordId) ?? null);
}

function TemplatePreview({
  template,
  serviceNames,
  onClose,
}: {
  template: ScenarioTemplate;
  serviceNames: Map<string, string>;
  onClose: () => void;
}) {
  const isCall = template.kind === "call";

  return (
    <Paper withBorder p="sm" radius={2}>
      <ScrollArea.Autosize mah={320} type="auto" offsetScrollbars>
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
            <Stack gap={2}>
              <Title order={4} size="h6" fw={600}>
                {template.name}
              </Title>
              <Text size="xs" c="povDark2.6">
                {templateVariantLabels[template.variant]}: {templateVariantHints[template.variant]}
              </Text>
            </Stack>
            <ActionIcon color="povDark2.6" aria-label="Закрыть просмотр" onClick={onClose}>
              <X size={16} />
            </ActionIcon>
          </Group>
          {isCall && template.initialCall && <InitialCallView call={template.initialCall} />}
          <ExpectedResultView
            itemType={isCall ? "INCOMING_CALL" : "INCIDENT_CARD"}
            sourceType="TEMPLATE"
            expectedResult={template.expectedResult}
            fallbackCard={null}
            problem={null}
            serviceNames={serviceNames}
          />
        </Stack>
      </ScrollArea.Autosize>
    </Paper>
  );
}

export function TemplatePicker({ serviceNames, onClose, onPick }: TemplatePickerProps) {
  const teacherId = useSessionStore((state) => state.profile?.userId ?? "");
  const templates = useFreshTemplates();
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [variant, setVariant] = useState<TemplateVariant | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [service, setService] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const available = groupTemplates(templates.data ?? []).flatMap((entry) => entry.versions.find(isTemplateUsable) ?? []);
  const serviceFilterOn = variant === "cardDds";
  const needle = query.trim().toLocaleLowerCase("ru");
  const rows = available
    .filter(
      (template) =>
        (variant === null || template.variant === variant) &&
        (type === null || String(template.recordId) === type) &&
        (!serviceFilterOn || service === null || template.services.includes(service)) &&
        (needle === "" ||
          template.name.toLocaleLowerCase("ru").includes(needle) ||
          (typeName(template)?.toLocaleLowerCase("ru").includes(needle) ?? false)),
    )
    .sort((first, second) => first.name.localeCompare(second.name, "ru"));
  const preview = available.find((template) => template.id === previewId);
  const typeOptions = [
    ...new Map(
      available.flatMap((template) => {
        const name = typeName(template);

        return name === null ? [] : [[String(template.recordId), name] as const];
      }),
    ),
  ]
    .map(([value, label]) => ({ value, label }))
    .sort((first, second) => first.label.localeCompare(second.label, "ru"));
  const serviceOptions = [
    ...new Set(available.filter((template) => template.variant === "cardDds").flatMap((template) => template.services)),
  ]
    .map((code) => ({ value: code, label: serviceName(code, serviceNames) }))
    .sort((first, second) => first.label.localeCompare(second.label, "ru"));

  const toggle = (templateId: string, checked: boolean) =>
    setSelected((current) => (checked ? [...current, templateId] : current.filter((id) => id !== templateId)));

  const pick = () => onPick(selected.flatMap((id) => available.filter((template) => template.id === id)));

  const resetFilters = () => {
    setQuery("");
    setVariant(null);
    setType(null);
    setService(null);
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title="Добавить из библиотеки шаблонов"
      size={1200}
      centered
      radius={2}
      transitionProps={{ duration: 0 }}
    >
      <Stack gap="sm">
        <Stack gap={6}>
          <SegmentedControl
            size="xs"
            radius={2}
            color="povDark2.6"
            w="fit-content"
            maw="100%"
            data={variantOptions}
            value={variant ?? ALL_VARIANTS}
            onChange={(value) => {
              setVariant(isVariant(value) ? value : null);
              if (value !== "cardDds") setService(null);
            }}
            aria-label="Вид шаблона"
          />
          <Stack gap={0}>
            {(variant === null ? templateVariantOrder : [variant]).map((shown) => (
              <Text key={shown} size="xs" c="povDark2.6">
                {templateVariantLabels[shown]} — {templateVariantHints[shown]}
              </Text>
            ))}
          </Stack>
        </Stack>

        <Group gap="xs" wrap="wrap" align="flex-end">
          <TextInput
            size="xs"
            w={240}
            label="Поиск"
            placeholder="Название или тип"
            leftSection={<Search size={14} />}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <Select
            size="xs"
            w={260}
            label="Тип происшествия"
            data={typeOptions}
            value={type}
            onChange={setType}
            searchable
            clearable
          />
          <Select
            size="xs"
            w={220}
            label="Служба"
            description={serviceFilterOn ? undefined : "Только для вида «Карточка ДДС»"}
            data={serviceOptions}
            value={serviceFilterOn ? service : null}
            onChange={setService}
            disabled={!serviceFilterOn}
            searchable
            clearable
          />
        </Group>

        {templates.isFetching ? (
          <Skeleton height={240} radius={2} />
        ) : templates.isError ? (
          <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить шаблоны">
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => templates.refetch()}>
              Повторить
            </Button>
          </Alert>
        ) : available.length === 0 ? (
          <Text size="sm">
            В библиотеке нет опубликованных шаблонов. Создайте шаблон в разделе «Шаблоны» или добавьте встроенную
            карточку.
          </Text>
        ) : rows.length === 0 ? (
          <FilteredEmpty onReset={resetFilters} />
        ) : (
          <Stack gap="sm">
            <ScrollArea.Autosize mah={preview ? 240 : 460} type="auto">
              <Table.ScrollContainer minWidth={TABLE_MIN_WIDTH} type="native">
                <Table highlightOnHover verticalSpacing={6} fz="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={36} />
                      <Table.Th>Название</Table.Th>
                      <Table.Th>Вид</Table.Th>
                      <Table.Th>Службы</Table.Th>
                      <Table.Th>Тип происшествия</Table.Th>
                      <Table.Th>Сложность</Table.Th>
                      <Table.Th>Автор</Table.Th>
                      <Table.Th>Источник</Table.Th>
                      <Table.Th>Версия</Table.Th>
                      <Table.Th>Дата</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rows.map((template) => (
                      <Table.Tr key={template.id}>
                        <Table.Td>
                          <Checkbox
                            size="xs"
                            color="povDark2.6"
                            checked={selected.includes(template.id)}
                            aria-label={`Выбрать «${template.name}»`}
                            onChange={(event) => toggle(template.id, event.currentTarget.checked)}
                          />
                        </Table.Td>
                        <Table.Td className={classes.wrap}>
                          <Anchor
                            component="button"
                            type="button"
                            size="sm"
                            ta="left"
                            c="povDark2.6"
                            fw={template.id === previewId ? 600 : undefined}
                            underline="hover"
                            aria-pressed={template.id === previewId}
                            onClick={() => setPreviewId(template.id === previewId ? null : template.id)}
                          >
                            {template.name}
                          </Anchor>
                        </Table.Td>
                        <Table.Td>{templateVariantLabels[template.variant]}</Table.Td>
                        <Table.Td className={classes.wrap}>
                          {template.services.length === 0
                            ? "—"
                            : template.services.map((code) => serviceName(code, serviceNames)).join(", ")}
                        </Table.Td>
                        <Table.Td className={classes.wrap}>{typeName(template) ?? "—"}</Table.Td>
                        <Table.Td>{difficultyLabel(template.difficulty)}</Table.Td>
                        <Table.Td className={classes.wrap}>{templateAuthorLabel(template, teacherId)}</Table.Td>
                        <Table.Td>{templateSourceLabel(template)}</Table.Td>
                        <Table.Td className={classes.numeric}>{template.version}</Table.Td>
                        <Table.Td className={classes.numeric}>{formatShortDateTime(template.createdAt)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </ScrollArea.Autosize>
            {preview && <TemplatePreview template={preview} serviceNames={serviceNames} onClose={() => setPreviewId(null)} />}
          </Stack>
        )}

        <Group justify="space-between" gap="xs" wrap="wrap">
          <Text size="xs" c="povDark2.6">
            Нажмите на название, чтобы посмотреть эталон. В список попадает старшая опубликованная версия каждого
            шаблона.
          </Text>
          <Group gap="xs">
            <Button size="sm" variant="outline" color="povDark2.6" onClick={onClose}>
              Отмена
            </Button>
            <Button size="sm" disabled={selected.length === 0} onClick={pick}>
              {selected.length === 0 ? "Добавить" : `Добавить: ${selected.length}`}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
