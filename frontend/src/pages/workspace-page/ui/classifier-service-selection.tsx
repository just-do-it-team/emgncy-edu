import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { Plus, X } from "lucide-react";
import {
  classifierGroups,
  getClassificationMatches,
  getFeatureOptions,
  resolveClassification,
  routingFlags,
  type RoutedService,
  type RoutingFlags,
} from "@/entities/incident";
import type { EmergencyService } from "@/entities/training";
import classes from "./create-server-card.module.scss";

export interface ClassifierServiceDraft {
  group: string;
  features: [string | null, string | null, string | null];
  recordId: number | null;
  flags: RoutingFlags;
  manualServiceIds: string[];
}

export function ClassifierServiceSelection({
  value,
  onChange,
  routed,
  directory,
  disabled,
}: {
  value: ClassifierServiceDraft;
  onChange: (value: ClassifierServiceDraft) => void;
  routed: RoutedService[];
  directory: EmergencyService[];
  disabled: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [draftManualIds, setDraftManualIds] = useState<string[]>([]);
  const record = resolveClassification(
    value.group,
    value.features,
    value.recordId,
  );
  const matches = getClassificationMatches(value.group, value.features);
  const activeDirectory = directory.filter((service) => service.is_active);
  const byCode = new Map(
    activeDirectory.map((service) => [service.code, service]),
  );
  const byId = new Map(activeDirectory.map((service) => [service.id, service]));
  const automaticIds = new Set(
    routed
      .map((service) => byCode.get(service.code)?.id)
      .filter((id): id is string => !!id),
  );
  const missing = routed.filter((service) => !byCode.has(service.code));
  const manual = value.manualServiceIds
    .filter((id) => !automaticIds.has(id))
    .map((id) => byId.get(id))
    .filter((service): service is EmergencyService => !!service);

  return (
    <Stack gap="md">
      <Text fw={700}>Классификатор оповещения</Text>
      <Select
        label="Группа происшествия"
        placeholder="Выберите группу"
        searchable
        clearable
        data={classifierGroups}
        value={value.group || null}
        onChange={(group) =>
          onChange({
            ...value,
            group: group ?? "",
            features: [null, null, null],
            recordId: null,
            flags: {},
          })
        }
        disabled={disabled}
      />
      {value.group &&
        [0, 1, 2].map((level) => {
          const options = getFeatureOptions(value.group, value.features, level);
          if (!options.length) return null;
          return (
            <Select
              key={level}
              label={`Определяющий признак ${level + 1}`}
              placeholder="Выберите признак"
              searchable
              data={options.map((option) => ({
                value: option ?? "__none__",
                label: option ?? "Не требуется",
              }))}
              value={
                value.features[level] ??
                (options.includes(null) ? "__none__" : null)
              }
              onChange={(selected) => {
                const features = [
                  ...value.features,
                ] as ClassifierServiceDraft["features"];
                for (let index = level; index < 3; index += 1)
                  features[index] =
                    index === level && selected !== "__none__"
                      ? selected
                      : null;
                onChange({ ...value, features, recordId: null });
              }}
              disabled={disabled}
            />
          );
        })}
      {matches.length > 1 && (
        <Select
          label="Уточните итоговый тип"
          data={matches.map((item) => ({
            value: String(item.id),
            label: item.name,
          }))}
          value={value.recordId ? String(value.recordId) : null}
          onChange={(id) =>
            onChange({ ...value, recordId: id ? Number(id) : null })
          }
          disabled={disabled}
        />
      )}
      {record && (
        <Text size="sm">
          Классификация: <strong>{record.name}</strong>
        </Text>
      )}
      {value.group && (
        <details>
          <summary>Дополнительные признаки для оповещения</summary>
          <div className={classes.routingFlags}>
            {routingFlags.map(([key, label]) => (
              <Checkbox
                key={key}
                label={label}
                checked={!!value.flags[key]}
                onChange={(event) =>
                  onChange({
                    ...value,
                    flags: {
                      ...value.flags,
                      [key]: event.currentTarget.checked,
                    },
                  })
                }
                disabled={disabled}
              />
            ))}
          </div>
        </details>
      )}
      {missing.length > 0 && (
        <Alert color="red">
          В справочнике API нет служб:{" "}
          {missing.map((service) => service.name).join(", ")}. Их нельзя
          добавить к карточке.
        </Alert>
      )}
      <div className={classes.servicesBar} aria-live="polite">
        <strong>Службы:</strong>
        <div className={classes.servicePills}>
          {routed.map((service) => (
            <Tooltip
              key={service.code}
              label={service.reasons.join("; ")}
              multiline
              maw={320}
            >
              <span className={classes.servicePill}>
                {byCode.get(service.code)?.name ?? service.name}
              </span>
            </Tooltip>
          ))}
          {manual.map((service) => (
            <span key={service.id} className={classes.servicePill}>
              {service.name}
              <button
                type="button"
                aria-label={`Убрать службу ${service.name}`}
                onClick={() =>
                  onChange({
                    ...value,
                    manualServiceIds: value.manualServiceIds.filter(
                      (id) => id !== service.id,
                    ),
                  })
                }
                disabled={disabled}
              >
                <X size={14} />
              </button>
            </span>
          ))}
          {!routed.length && !manual.length && (
            <Text size="sm">Появятся после выбора типа и признаков</Text>
          )}
        </div>
        <Button
          variant="outline"
          color="white"
          aria-label="Добавить службу"
          onClick={() => {
            setDraftManualIds(
              value.manualServiceIds.filter((id) => !automaticIds.has(id)),
            );
            setOpened(true);
          }}
          disabled={disabled}
        >
          <Plus size={20} />
        </Button>
      </div>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Добавьте службы"
        centered
        size="lg"
      >
        <Stack>
          <MultiSelect
            label="Поиск служб"
            placeholder="Введите название службы"
            searchable
            clearable
            data={activeDirectory
              .filter((service) => !automaticIds.has(service.id))
              .map((service) => ({ value: service.id, label: service.name }))}
            value={draftManualIds}
            onChange={setDraftManualIds}
            nothingFoundMessage="Службы не найдены"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Отмена
            </Button>
            <Button
              onClick={() => {
                onChange({ ...value, manualServiceIds: draftManualIds });
                setOpened(false);
              }}
            >
              Сохранить и закрыть
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
