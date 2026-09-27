import { useState } from "react";
import { Checkbox, Group, Modal, ScrollArea, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { Search } from "lucide-react";
import { classifierRecords } from "@/entities/incident";
import { difficultyLabel, templateVariantLabels, type TemplateEntry } from "@/entities/scenario";
import type { ScenarioTemplate } from "@/shared/api";
import { Button, FilteredEmpty } from "@/shared/ui";
import { serviceName } from "@/widgets/expected-result-view";
import classes from "./scenario-editor.module.scss";

const recordNames = new Map(classifierRecords.map((record) => [record.id, record.name]));

const variantOptions = Object.entries(templateVariantLabels).map(([value, label]) => ({ value, label }));

interface TemplatePickerProps {
  entries: TemplateEntry[];
  serviceNames: Map<string, string>;
  onClose: () => void;
  onPick: (templates: ScenarioTemplate[]) => void;
}

function typeName(template: ScenarioTemplate): string | null {
  return template.recordId === null ? null : (recordNames.get(template.recordId) ?? null);
}

export function TemplatePicker({ entries, serviceNames, onClose, onPick }: TemplatePickerProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [variant, setVariant] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [service, setService] = useState<string | null>(null);

  const available = entries.map((entry) => entry.latest).filter((template) => template.isActive);
  const needle = query.trim().toLocaleLowerCase("ru");
  const rows = available
    .filter(
      (template) =>
        (variant === null || template.variant === variant) &&
        (type === null || String(template.recordId) === type) &&
        (service === null || template.services.includes(service)) &&
        (needle === "" ||
          template.name.toLocaleLowerCase("ru").includes(needle) ||
          (typeName(template)?.toLocaleLowerCase("ru").includes(needle) ?? false)),
    )
    .sort((first, second) => first.name.localeCompare(second.name, "ru"));
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
  const serviceOptions = [...new Set(available.flatMap((template) => template.services))]
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
      size="xl"
      centered
      radius={2}
      transitionProps={{ duration: 0 }}
    >
      <Stack gap="sm">
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
          <Select size="xs" w={170} label="Вид" data={variantOptions} value={variant} onChange={setVariant} clearable />
          <Select
            size="xs"
            w={240}
            label="Тип происшествия"
            data={typeOptions}
            value={type}
            onChange={setType}
            searchable
            clearable
          />
          <Select
            size="xs"
            w={200}
            label="Служба"
            data={serviceOptions}
            value={service}
            onChange={setService}
            searchable
            clearable
          />
        </Group>

        {available.length === 0 ? (
          <Text size="sm">
            В библиотеке нет активных шаблонов. Создайте шаблон в разделе «Шаблоны» или добавьте встроенную карточку.
          </Text>
        ) : rows.length === 0 ? (
          <FilteredEmpty onReset={resetFilters} />
        ) : (
          <ScrollArea.Autosize mah={420} type="auto">
            <Table striped={false} highlightOnHover verticalSpacing={6} fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={36} />
                  <Table.Th>Название</Table.Th>
                  <Table.Th>Версия</Table.Th>
                  <Table.Th>Вид</Table.Th>
                  <Table.Th>Тип происшествия</Table.Th>
                  <Table.Th>Службы</Table.Th>
                  <Table.Th>Сложность</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((template) => {
                  const checked = selected.includes(template.id);

                  return (
                    <Table.Tr key={template.id}>
                      <Table.Td>
                        <Checkbox
                          size="xs"
                          color="povDark2.6"
                          checked={checked}
                          aria-label={`Выбрать «${template.name}»`}
                          onChange={(event) => toggle(template.id, event.currentTarget.checked)}
                        />
                      </Table.Td>
                      <Table.Td className={classes.wrap}>{template.name}</Table.Td>
                      <Table.Td className={classes.numeric}>{template.version}</Table.Td>
                      <Table.Td>{templateVariantLabels[template.variant]}</Table.Td>
                      <Table.Td className={classes.wrap}>{typeName(template) ?? "—"}</Table.Td>
                      <Table.Td className={classes.wrap}>
                        {template.services.length === 0
                          ? "—"
                          : template.services.map((code) => serviceName(code, serviceNames)).join(", ")}
                      </Table.Td>
                      <Table.Td>{difficultyLabel(template.difficulty)}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}

        <Group justify="flex-end" gap="xs">
          <Button size="sm" variant="outline" color="povDark2.6" onClick={onClose}>
            Отмена
          </Button>
          <Button size="sm" disabled={selected.length === 0} onClick={pick}>
            {selected.length === 0 ? "Добавить" : `Добавить: ${selected.length}`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
