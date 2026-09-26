import {
  applicantStatusLabels,
  responseStatusLabels,
  serviceAddedReasonLabels,
  severityOrder,
  type Attempt,
  type AttemptError,
  type CardService,
  type ErrorSeverity,
  type IncidentAddress,
  type IncidentCard,
  type ResponseStatusEntry,
  type SelectedFeature,
} from "@/entities/attempt";
import { charSpans, type CharSpan } from "@/shared/lib";

export interface DiffRow {
  field: string;
  label: string;
  submitted: string;
  reference: string;
  changed: boolean;
  spans: CharSpan[];
}

export interface DiffBlock {
  key: string;
  title: string;
  rows: DiffRow[];
  changedCount: number;
}

const EMPTY = "—";

function text(value: string | number | null): string {
  if (value === null || value === "") return EMPTY;

  return String(value);
}

function formatFeatures(features: SelectedFeature[]): string {
  if (features.length === 0) return EMPTY;

  return features.map((feature) => `${feature.level}. ${feature.name}`).join("\n");
}

function formatServices(services: CardService[]): string {
  if (services.length === 0) return EMPTY;

  return services
    .map((service) => {
      const marks = [service.is_main ? "главная" : null, serviceAddedReasonLabels[service.added_reason]]
        .filter(Boolean)
        .join(", ");

      return `${service.name} (${marks})`;
    })
    .join("\n");
}

function formatStatuses(statuses: ResponseStatusEntry[], services: CardService[]): string {
  if (statuses.length === 0) return EMPTY;

  return statuses
    .map((entry) => {
      const service = services.find((item) => item.service_id === entry.service_id);
      const comment = entry.comment ? `: ${entry.comment}` : "";

      return `${service?.name ?? entry.service_id} — ${responseStatusLabels[entry.status]}${comment}`;
    })
    .join("\n");
}

function formatCoordinates(address: IncidentAddress): string {
  if (!address.coordinates) return EMPTY;

  return `${address.coordinates.latitude.toFixed(5)}, ${address.coordinates.longitude.toFixed(5)}`;
}

function row(field: string, label: string, submitted: string, reference: string): DiffRow {
  return {
    field,
    label,
    submitted,
    reference,
    changed: submitted !== reference,
    spans: charSpans(submitted, reference),
  };
}

function block(key: string, title: string, rows: DiffRow[]): DiffBlock {
  return { key, title, rows, changedCount: rows.filter((item) => item.changed).length };
}

function phonesBlock(submitted: IncidentCard, reference: IncidentCard): DiffBlock {
  return block("phones", "Телефоны", [
    row("phones.aon", "АОН", text(submitted.phones.aon), text(reference.phones.aon)),
    row("phones.provided", "Предоставленный", text(submitted.phones.provided), text(reference.phones.provided)),
    row("phones.at_location", "Телефон на месте", text(submitted.phones.at_location), text(reference.phones.at_location)),
    row(
      "phones.is_foreign",
      "Зарубежный номер",
      submitted.phones.is_foreign ? "да" : "нет",
      reference.phones.is_foreign ? "да" : "нет",
    ),
  ]);
}

function applicantBlock(submitted: IncidentCard, reference: IncidentCard): DiffBlock {
  const status = (card: IncidentCard) =>
    card.applicant.status === null ? EMPTY : applicantStatusLabels[card.applicant.status];

  return block("applicant", "Заявитель", [
    row("applicant.full_name", "ФИО", text(submitted.applicant.full_name), text(reference.applicant.full_name)),
    row("applicant.status", "Статус заявителя", status(submitted), status(reference)),
  ]);
}

const addressFields: { field: keyof IncidentAddress; label: string }[] = [
  { field: "full", label: "Адрес одной строкой" },
  { field: "country", label: "Страна" },
  { field: "subject", label: "Субъект" },
  { field: "settlement", label: "Населенный пункт" },
  { field: "object", label: "Объект" },
  { field: "okrug", label: "Округ" },
  { field: "district", label: "Район" },
  { field: "street", label: "Улица" },
  { field: "house", label: "Дом" },
  { field: "building", label: "Корпус" },
  { field: "structure", label: "Строение" },
  { field: "apartment", label: "Квартира" },
  { field: "entrance", label: "Подъезд" },
  { field: "floor", label: "Этаж" },
  { field: "intercom_code", label: "Код домофона" },
  { field: "descriptive", label: "Описательный адрес" },
];

function addressBlock(submitted: IncidentCard, reference: IncidentCard): DiffBlock {
  const rows = addressFields.map(({ field, label }) =>
    row(
      `address.${field}`,
      label,
      text(submitted.address[field] as string | null),
      text(reference.address[field] as string | null),
    ),
  );

  rows.push(
    row(
      "address.coordinates",
      "Координаты",
      formatCoordinates(submitted.address),
      formatCoordinates(reference.address),
    ),
  );

  return block("address", "Адрес", rows);
}

function classificationBlock(submitted: IncidentCard, reference: IncidentCard): DiffBlock {
  return block("classification", "Что случилось", [
    row(
      "event_type",
      "Тип происшествия",
      text(submitted.event_type?.name ?? null),
      text(reference.event_type?.name ?? null),
    ),
    row(
      "event_kind",
      "Вид происшествия",
      text(submitted.event_kind?.name ?? null),
      text(reference.event_kind?.name ?? null),
    ),
    row("features", "Формализованные признаки", formatFeatures(submitted.features), formatFeatures(reference.features)),
    row(
      "final_incident_type",
      "Итоговый тип по ЕКП",
      text(submitted.final_incident_type?.name ?? null),
      text(reference.final_incident_type?.name ?? null),
    ),
  ]);
}

export function buildCardDiff(attempt: Attempt): DiffBlock[] {
  const submitted = attempt.submitted_card;
  const reference = attempt.reference_card;

  const blocks = [
    phonesBlock(submitted, reference),
    applicantBlock(submitted, reference),
    addressBlock(submitted, reference),
    classificationBlock(submitted, reference),
    block("description", "Описание со слов заявителя", [
      row("description", "Описание", submitted.description, reference.description),
    ]),
    block("victims", "Пострадавшие", [
      row("victims_count", "Количество", text(submitted.victims_count), text(reference.victims_count)),
    ]),
    block("services", "Службы", [
      row("services", "Список оповещения", formatServices(submitted.services), formatServices(reference.services)),
    ]),
  ];

  if (attempt.mode === "DDS") {
    blocks.push(
      block("response_statuses", "Статусы реагирования", [
        row(
          "response_statuses",
          "Выставленные статусы",
          formatStatuses(attempt.submitted_card.response_statuses, attempt.submitted_card.services),
          formatStatuses(attempt.reference_card.response_statuses, attempt.reference_card.services),
        ),
      ]),
    );
  }

  return blocks;
}

export function groupErrorsByField(errors: AttemptError[]): Map<string, AttemptError[]> {
  const grouped = new Map<string, AttemptError[]>();

  for (const error of errors) {
    const scope = error.field.split(".").slice(0, 2).join(".");
    const existing = grouped.get(scope);

    if (existing) existing.push(error);
    else grouped.set(scope, [error]);
  }

  return grouped;
}

export function strongestSeverity(errors: AttemptError[]): ErrorSeverity | null {
  if (errors.length === 0) return null;

  return errors.reduce((strongest, error) =>
    severityOrder[error.severity] < severityOrder[strongest.severity] ? error : strongest,
  ).severity;
}

export function rowSeverity(
  field: string,
  errorsByField: Map<string, AttemptError[]>,
): ErrorSeverity | null {
  const scope = field.split(".").slice(0, 2).join(".");

  return strongestSeverity(errorsByField.get(scope) ?? []);
}

export function indexDiffRows(blocks: DiffBlock[]): Map<string, DiffRow> {
  return new Map(blocks.flatMap((block) => block.rows.map((row) => [row.field, row])));
}
