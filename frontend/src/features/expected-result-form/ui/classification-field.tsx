import { useState } from "react";
import { Checkbox, Group, Select, SimpleGrid, Stack, Text } from "@mantine/core";
import {
  classifierGroups,
  classifierRecords,
  getFeatureOptions,
  resolveClassification,
  routingFlags,
} from "@/entities/incident";
import { classifierRecord, recordChain } from "../model/classification";

const EMPTY_FEATURE = "__none";
const FEATURE_LEVELS = [0, 1, 2] as const;
const SEARCH_LIMIT = 50;

const searchOptions = classifierRecords.map((record) => ({
  value: String(record.id),
  label: `${record.name} — ${recordChain(record)}`,
}));

interface Cascade {
  group: string | null;
  features: (string | null)[];
}

function cascadeOf(recordId: number | null): Cascade {
  const record = classifierRecord(recordId);

  return record ? { group: record.group, features: [...record.features] } : { group: null, features: [] };
}

interface ClassificationFieldProps {
  recordId: number | null;
  flags: Record<string, boolean>;
  error: string | null;
  dataPath: string;
  onRecordChange: (recordId: number | null) => void;
  onFlagsChange: (flags: Record<string, boolean>) => void;
}

export function ClassificationField({
  recordId,
  flags,
  error,
  dataPath,
  onRecordChange,
  onFlagsChange,
}: ClassificationFieldProps) {
  const [cascade, setCascade] = useState<Cascade>(() => cascadeOf(recordId));
  const record = classifierRecord(recordId);

  const selectRecord = (nextId: number | null) => {
    setCascade(cascadeOf(nextId));
    onRecordChange(nextId);
  };

  const chooseGroup = (group: string | null) => {
    setCascade({ group, features: [] });
    onRecordChange(null);
  };

  const chooseFeature = (level: number, value: string | null) => {
    if (cascade.group === null) return;

    const features = [...cascade.features.slice(0, level), value === EMPTY_FEATURE ? null : value];
    const resolved =
      features.length === FEATURE_LEVELS.length ? resolveClassification(cascade.group, features) : undefined;

    setCascade({ group: cascade.group, features });
    onRecordChange(resolved?.id ?? null);
  };

  return (
    <Stack gap="xs">
      <Select
        size="xs"
        label="Тип происшествия"
        description="Поиск по итоговому типу или признакам; выбор только из классификатора"
        placeholder="Начните вводить: «задымление», «запах газа»…"
        data={searchOptions}
        value={recordId === null ? null : String(recordId)}
        onChange={(value) => selectRecord(value === null ? null : Number(value))}
        searchable
        clearable
        limit={SEARCH_LIMIT}
        nothingFoundMessage="В классификаторе нет такого типа"
        error={error}
        data-path={dataPath}
      />
      <SimpleGrid cols={{ base: 1, md: 4 }} spacing="xs">
        <Select
          size="xs"
          label="Группа"
          data={classifierGroups}
          value={cascade.group}
          onChange={chooseGroup}
          searchable
        />
        {FEATURE_LEVELS.map((level) => {
          const enabled = cascade.group !== null && cascade.features.length >= level;
          const options =
            enabled && cascade.group !== null ? getFeatureOptions(cascade.group, cascade.features, level) : [];
          const current = cascade.features[level];

          return (
            <Select
              key={level}
              size="xs"
              label={`Признак ${level + 1} уровня`}
              data={options.map((option) => ({
                value: option ?? EMPTY_FEATURE,
                label: option ?? "не используется",
              }))}
              value={current === undefined ? null : (current ?? EMPTY_FEATURE)}
              onChange={(value) => chooseFeature(level, value)}
              disabled={!enabled || options.length === 0}
              searchable
            />
          );
        })}
      </SimpleGrid>
      {record ? (
        <Stack gap={0}>
          <Text size="sm">
            <Text span size="sm" c="povDark2.6">
              Итоговый тип:{" "}
            </Text>
            <Text span size="sm" fw={600}>
              {record.name}
            </Text>
          </Text>
          <Text size="xs" c="povDark2.6">
            {recordChain(record)}
          </Text>
        </Stack>
      ) : (
        <Text size="xs" c="povDark2.6">
          Итоговый тип определится, когда выбраны все признаки или найден тип поиском.
        </Text>
      )}
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Признаки маршрутизации
        </Text>
        <Group gap="md">
          {routingFlags.map(([flag, label]) => (
            <Checkbox
              key={flag}
              size="xs"
              label={label}
              checked={flags[flag] === true}
              onChange={(event) => onFlagsChange({ ...flags, [flag]: event.currentTarget.checked })}
            />
          ))}
        </Group>
      </Stack>
    </Stack>
  );
}
