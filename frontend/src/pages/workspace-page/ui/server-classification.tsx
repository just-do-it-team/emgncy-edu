import {
  Alert,
  Checkbox,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import {
  apiError,
  trainingApi,
  type CardFeatures,
  type EventKind,
  type FeatureSchema,
} from "@/entities/training";

export function ServerClassification({
  features,
  onChange,
  kinds,
  schema,
  schemaError,
  schemaPending,
}: {
  features: CardFeatures;
  onChange: (features: CardFeatures) => void;
  kinds: EventKind[];
  schema: FeatureSchema | null | undefined;
  schemaError: unknown;
  schemaPending: boolean;
}) {
  const fields = [
    "first_order_feature_id",
    "second_order_feature_id",
    "third_order_feature_id",
  ] as const;
  return (
    <Stack p="sm" gap="sm">
      <Select
        searchable
        clearable
        label="Тип происшествия"
        placeholder="Начните вводить название"
        nothingFoundMessage="Тип не найден"
        data={kinds.map((k) => ({ value: String(k.id), label: k.name }))}
        value={features.event_kind_id ? String(features.event_kind_id) : null}
        onChange={(id) =>
          onChange({
            event_kind_id: Number(id) || 0,
            first_order_feature_id: null,
            second_order_feature_id: null,
            third_order_feature_id: null,
            feature_schema_id: null,
            additional_features: {},
          })
        }
      />
      {fields.map((field, level) => {
        const parentId =
          level === 0 ? features.event_kind_id : features[fields[level - 1]];
        if (!parentId) return null;
        return (
          <FeatureLevel
            key={`${level}:${parentId}`}
            level={level}
            parentId={parentId}
            value={features[field]}
            onChange={(id) => {
              const next = {
                ...features,
                feature_schema_id: null,
                additional_features: {},
              };
              fields.forEach((key, index) => {
                if (index >= level) next[key] = index === level ? id : null;
              });
              onChange(next);
            }}
          />
        );
      })}
      {schemaError ? (
        <Alert color="red">{apiError(schemaError)}</Alert>
      ) : schemaPending ? (
        <Text size="xs">Проверка комбинации признаков…</Text>
      ) : schema ? (
        <>
          <Text size="sm">
            Классификация: {schema.incident_type_name ?? "Определена"}
          </Text>
          <AdditionalFeatures
            schema={schema.additional_features_schema}
            values={features.additional_features}
            onChange={(additional_features) =>
              onChange({ ...features, additional_features })
            }
          />
        </>
      ) : features.event_kind_id > 0 ? (
        <Alert color="yellow">
          Для этой комбинации в API нет схемы. Можно сохранить выбранные
          признаки; автоматические службы определит сервер.
        </Alert>
      ) : null}
      <Text size="xs" c="dimmed">
        Службы рассчитывает сервер после сохранения признаков. Внизу показаны
        службы сохранённой карточки. Категория карточки задана сценарием и не
        изменяется через API.
      </Text>
    </Stack>
  );
}
function FeatureLevel({
  level,
  parentId,
  value,
  onChange,
}: {
  level: number;
  parentId: number;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const query = useQuery({
    queryKey: ["student-api", "reference", "features", level, parentId],
    queryFn: ({ signal }) =>
      trainingApi.featureOptions(level, parentId, signal),
    staleTime: 300000,
    meta: { showGlobalError: false },
  });
  if (query.isError)
    return (
      <Alert color="red">
        {apiError(query.error)}{" "}
        <button type="button" onClick={() => void query.refetch()}>
          Повторить
        </button>
      </Alert>
    );
  if (query.data?.length === 0) return null;
  const options =
    query.data?.map((v) => ({ value: String(v.id), label: v.name })) ?? [];
  if (value && !options.some((o) => o.value === String(value)))
    options.push({
      value: String(value),
      label: "Сохранённый признак (нет в справочнике)",
    });
  return (
    <Select
      searchable
      clearable
      label={`Определяющий признак ${level + 1}`}
      placeholder={query.isPending ? "Загрузка…" : "Выберите признак"}
      disabled={query.isPending}
      data={options}
      value={value === null ? null : String(value)}
      onChange={(id) => onChange(id ? Number(id) : null)}
    />
  );
}
function AdditionalFeatures({
  schema,
  values,
  onChange,
}: {
  schema: Record<string, unknown>;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}) {
  const properties =
    schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Record<string, Record<string, unknown>>)
      : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  return (
    <>
      {Object.entries(properties).map(([key, rule]) => {
        const label = typeof rule.title === "string" ? rule.title : key;
        const change = (value: unknown) =>
          onChange({ ...values, [key]: value });
        if (rule.type === "boolean")
          return (
            <Checkbox
              key={key}
              label={label}
              checked={values[key] === true}
              onChange={(e) => change(e.currentTarget.checked)}
            />
          );
        if (Array.isArray(rule.enum))
          return (
            <Select
              key={key}
              label={label}
              required={required.includes(key)}
              clearable
              data={rule.enum.map((v) => ({
                value: String(v),
                label: String(v),
              }))}
              value={values[key] === undefined ? null : String(values[key])}
              onChange={(v) =>
                change(
                  rule.enum instanceof Array
                    ? (rule.enum.find((item) => String(item) === v) ?? null)
                    : v,
                )
              }
            />
          );
        if (rule.type === "number" || rule.type === "integer")
          return (
            <NumberInput
              key={key}
              label={label}
              required={required.includes(key)}
              allowDecimal={rule.type !== "integer"}
              min={typeof rule.minimum === "number" ? rule.minimum : undefined}
              max={typeof rule.maximum === "number" ? rule.maximum : undefined}
              value={
                typeof values[key] === "number" ? (values[key] as number) : ""
              }
              onChange={change}
            />
          );
        if (rule.type === "string")
          return (
            <TextInput
              key={key}
              label={label}
              required={required.includes(key)}
              value={
                typeof values[key] === "string" ? (values[key] as string) : ""
              }
              onChange={(e) => change(e.currentTarget.value)}
            />
          );
        return (
          <Text key={key} size="xs" c="dimmed">
            {label}: редактирование этого признака пока не поддерживается.
          </Text>
        );
      })}
    </>
  );
}
