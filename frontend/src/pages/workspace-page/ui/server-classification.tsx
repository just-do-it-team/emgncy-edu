import {
  Alert,
  Button,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import classes from "./server-classification.module.scss";
import {
  apiError,
  trainingApi,
  type CardFeatures,
  type EventKind,
  type FeatureSchema,
  type AdditionalFeaturesSchema,
} from "@/entities/training";

export function ServerClassification({
  features,
  onChange,
  kinds,
  schema,
  schemaError,
  schemaPending,
  showServiceNote = true,
}: {
  features: CardFeatures;
  onChange: (features: CardFeatures) => void;
  kinds: EventKind[];
  schema: FeatureSchema | null | undefined;
  schemaError: unknown;
  schemaPending: boolean;
  showServiceNote?: boolean;
}) {
  const fields = [
    "first_order_feature_id",
    "second_order_feature_id",
    "third_order_feature_id",
  ] as const;
  return (
    <Stack className={classes.root} gap="sm">
      <Select
        searchable
        clearable
        label="Введите тип происшествия"
        placeholder="ЧТО СЛУЧИЛОСЬ?"
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
      {features.event_kind_id > 0 && (
        <div className={classes.selectedKind}>
          {kinds.find((kind) => kind.id === features.event_kind_id)?.name ??
            "Тип происшествия"}
        </div>
      )}
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
          признаки.
        </Alert>
      ) : null}
      {showServiceNote && (
        <Text size="xs" c="dimmed">
          Службы рассчитывает сервер после сохранения признаков. Внизу показаны
          службы сохранённой карточки. После создания категорию карточки нельзя
          изменить.
        </Text>
      )}
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
  if (query.data?.length === 0 && !value) return null;
  const options = query.data ?? [];
  return (
    <div className={classes.featureRow}>
      <span>Определяющий признак {level + 1}</span>
      <div className={classes.options}>
        {query.isPending ? (
          <Text size="xs">Загрузка…</Text>
        ) : (
          options.map((option) => (
            <Button
              key={option.id}
              size="xs"
              variant={value === option.id ? "filled" : "default"}
              color="povBlue"
              aria-pressed={value === option.id}
              onClick={() => onChange(value === option.id ? null : option.id)}
            >
              {option.name}
            </Button>
          ))
        )}
        {value && !options.some((option) => option.id === value) && (
          <Button
            size="xs"
            variant="filled"
            color="povBlue"
            onClick={() => onChange(null)}
          >
            Сохранённый признак (нет в справочнике)
          </Button>
        )}
      </div>
    </div>
  );
}
function AdditionalFeatures({
  schema,
  values,
  onChange,
}: {
  schema: AdditionalFeaturesSchema;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}) {
  const properties = schema.properties ?? {};
  const required = schema.required ?? [];
  const remove = (key: string) => {
    const next = { ...values };
    delete next[key];
    onChange(next);
  };
  return (
    <>
      {Object.entries(properties).map(([key, rule]) => {
        const label = typeof rule.title === "string" ? rule.title : key;
        const change = (value: unknown) => {
          if (value === undefined) remove(key);
          else onChange({ ...values, [key]: value });
        };
        const options =
          rule.enum ?? (rule.type === "boolean" ? [true, false] : null);
        if (options)
          return (
            <div className={classes.featureRow} key={key}>
              <span>
                {label}
                {required.includes(key) ? " *" : ""}
              </span>
              <div className={classes.options}>
                {options.map((option, index) => (
                  <Button
                    key={index}
                    size="xs"
                    variant={values[key] === option ? "filled" : "default"}
                    color="povBlue"
                    aria-pressed={values[key] === option}
                    onClick={() =>
                      change(values[key] === option ? undefined : option)
                    }
                  >
                    {typeof option === "boolean"
                      ? option
                        ? "Да"
                        : "Нет"
                      : String(option)}
                  </Button>
                ))}
              </div>
            </div>
          );
        if (rule.type === "number" || rule.type === "integer")
          return (
            <NumberInput
              key={key}
              label={label}
              required={required.includes(key)}
              allowDecimal={rule.type !== "integer"}
              value={
                typeof values[key] === "number" ||
                typeof values[key] === "string"
                  ? (values[key] as number | string)
                  : ""
              }
              onChange={(value) => change(value === "" ? undefined : value)}
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
              onChange={(e) =>
                change(
                  e.currentTarget.value === "" && !required.includes(key)
                    ? undefined
                    : e.currentTarget.value,
                )
              }
            />
          );
        return (
          <Text key={key} size="xs" c="dimmed">
            {label}: редактирование этого признака пока не поддерживается.
          </Text>
        );
      })}
      {Object.keys(values)
        .filter((key) => !Object.prototype.hasOwnProperty.call(properties, key))
        .map((key) => (
          <Alert key={key} color="yellow">
            Признак «{key}» отсутствует в текущей схеме.
            <Button size="xs" variant="subtle" onClick={() => remove(key)}>
              Удалить признак
            </Button>
          </Alert>
        ))}
    </>
  );
}
