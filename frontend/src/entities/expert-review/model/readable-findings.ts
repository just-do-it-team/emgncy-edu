import type { Discrepancy, JsonObject, JsonValue, ReviewCard } from "@/shared/api";

export interface ClassifierEntry {
  name: string;
  group: string;
  features: readonly (string | null)[];
}

/** Справочники для перевода кодов в названия; передаются вызывающим слоем. */
export interface ClassifierNames {
  recordOf: (recordId: number) => ClassifierEntry | undefined;
  flagLabel: (key: string) => string | undefined;
}

const CLASSIFICATION = "card.classification.";
const RECORD_PATH = `${CLASSIFICATION}record_id`;
const TYPE_PATH = `${CLASSIFICATION}final_incident_type`;
const FEATURE_FIELDS = ["feature_1_code", "feature_2_code", "feature_3_code"];
export const OUTBOUND_CALL_PATH = "expected_result.outbound_call";

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function recordOf(value: JsonValue | undefined, names: ClassifierNames): ClassifierEntry | undefined {
  return typeof value === "number" ? names.recordOf(value) : undefined;
}

/**
 * Приводит расхождения классификации к названиям классификатора. Сервер присылает запись, группу
 * и признаки кодами, а итоговый тип — строкой, поэтому одна ошибка выбора типа даёт до пяти строк.
 * Запись и итоговый тип сливаются в одну строку «Тип происшествия», признаки и группа получают
 * названия из записей эталона и ответа; остальные расхождения проходят без изменений.
 */
export function readableDiscrepancies(discrepancies: Discrepancy[], names: ClassifierNames): Discrepancy[] {
  const byPath = new Map(discrepancies.map((discrepancy) => [discrepancy.path, discrepancy]));
  const record = byPath.get(RECORD_PATH);
  const typeDiff = byPath.get(TYPE_PATH);
  const expectedRecord = recordOf(record?.expected, names);
  const actualRecord = recordOf(record?.actual, names);
  let typeShown = false;

  return discrepancies.flatMap((discrepancy): Discrepancy[] => {
    if (!discrepancy.path.startsWith(CLASSIFICATION)) return [discrepancy];

    const field = discrepancy.path.slice(CLASSIFICATION.length);

    if (discrepancy.path === RECORD_PATH || discrepancy.path === TYPE_PATH) {
      if (typeShown) return [];
      typeShown = true;

      return [
        {
          path: TYPE_PATH,
          reason: discrepancy.reason,
          expected: expectedRecord?.name ?? text(typeDiff?.expected) ?? "тип не задан",
          actual: actualRecord?.name ?? text(typeDiff?.actual) ?? "тип не выбран",
        },
      ];
    }

    const featureIndex = FEATURE_FIELDS.indexOf(field);

    if (featureIndex >= 0) {
      return [
        {
          ...discrepancy,
          expected: expectedRecord?.features[featureIndex] ?? "не выбран",
          actual: actualRecord?.features[featureIndex] ?? "не выбран",
        },
      ];
    }
    if (field === "group_code") {
      return [
        {
          ...discrepancy,
          expected: expectedRecord?.group ?? "группа не задана",
          actual: actualRecord?.group ?? "группа не выбрана",
        },
      ];
    }
    if (field.startsWith("routing_flags.")) {
      const flag = names.flagLabel(field.slice("routing_flags.".length)) ?? "флаг";
      const mark = (value: JsonValue) => `«${flag}» ${value === true ? "отмечен" : "не отмечен"}`;

      return [{ ...discrepancy, expected: mark(discrepancy.expected), actual: mark(discrepancy.actual) }];
    }

    return [discrepancy];
  });
}

export interface OutboundVerdict {
  similarity: number | null;
  threshold: number | null;
  passed: boolean | null;
  said: string | null;
  expectedText: string | null;
  missing: string[];
  contradictions: string[];
  explanation: string | null;
}

function strings(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : [])) : [];
}

function numberOf(value: JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Вывод модели по голосовому докладу из расхождения «expected_result.outbound_call». */
export function outboundVerdict(discrepancy: Discrepancy, expectedText: string | null): OutboundVerdict | null {
  if (discrepancy.path !== OUTBOUND_CALL_PATH) return null;

  const actual = isObject(discrepancy.actual) ? discrepancy.actual : {};
  const expected = isObject(discrepancy.expected) ? discrepancy.expected : {};

  return {
    similarity: numberOf(actual.similarity),
    threshold: numberOf(actual.minimum_similarity) ?? numberOf(expected.minimum_similarity),
    passed: typeof actual.passed === "boolean" ? actual.passed : null,
    said: text(actual.actual_text),
    expectedText: text(actual.expected_text) ?? text(expected.expected_text) ?? expectedText,
    missing: strings(actual.missing_facts),
    contradictions: strings(actual.contradictions),
    explanation: text(actual.explanation),
  };
}

const decimal = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export interface VerdictRow {
  label: string;
  value: string;
}

export function outboundVerdictRows(verdict: OutboundVerdict): VerdictRow[] {
  const outcome = verdict.passed === null ? "" : verdict.passed ? " — зачтено" : " — не зачтено";
  const similarity =
    verdict.similarity === null
      ? "модель не вернула оценку"
      : verdict.threshold === null
        ? `${decimal(verdict.similarity)}${outcome}`
        : `${decimal(verdict.similarity)} при пороге ${decimal(verdict.threshold)}${outcome}`;

  return [
    { label: "Сходство с эталоном", value: similarity },
    { label: "Что сказал обучаемый", value: verdict.said ?? "речь не распознана" },
    { label: "Что должно было прозвучать", value: verdict.expectedText ?? "эталон доклада не задан" },
    { label: "Не хватает", value: verdict.missing.length === 0 ? "ничего" : verdict.missing.join("; ") },
    { label: "Противоречия", value: verdict.contradictions.length === 0 ? "нет" : verdict.contradictions.join("; ") },
    ...(verdict.explanation === null ? [] : [{ label: "Пояснение", value: verdict.explanation }]),
  ];
}

export function outboundVerdictLines(verdict: OutboundVerdict): string[] {
  return outboundVerdictRows(verdict).map((row) => `${row.label}: ${row.value}`);
}

/** Эталонный текст доклада из эталона карточки: нужен, если сервер не вернул его в выводе модели. */
export function expectedReportText(card: Pick<ReviewCard, "expectedResult">): string | null {
  const outbound = card.expectedResult.outbound_call;

  return isObject(outbound) ? text(outbound.expected_text) : null;
}

/** «Карточка 2 — Кража, г. Москва, ул. Примерная, д. 7» для заголовка группы расхождений. */
export function cardTitle(
  card: Pick<ReviewCard, "expectedResult" | "currentState">,
  index: number,
  noun = "Карточка",
): string {
  const expected = isObject(card.expectedResult.card) ? card.expectedResult.card : {};
  const current = card.currentState ?? {};
  const classification = isObject(expected.classification)
    ? expected.classification
    : isObject(current.classification)
      ? current.classification
      : {};
  const details = [
    text(classification.final_incident_type),
    text(expected.reported_address) ?? text(current.reported_address) ?? text(expected.incident_address),
  ].filter((part): part is string => part !== null);

  return details.length === 0 ? `${noun} ${index + 1}` : `${noun} ${index + 1} — ${details.join(", ")}`;
}

export interface FindingGroup {
  key: string;
  title: string;
  discrepancies: Discrepancy[];
  verdict: OutboundVerdict | null;
}

export interface FindingSource {
  key: string;
  expectedResult: JsonObject;
  currentState: JsonObject | null;
  discrepancies: Discrepancy[];
}

/**
 * Расхождения попытки по элементам: у каждой карточки (или звонка) своя группа с заголовком,
 * порядок элементов — как в сценарии. Вывод модели по докладу вынимается из расхождений карточки,
 * по которой звонили, чтобы показать его разобранным, а не строкой сравнения.
 */
export function findingGroups(elements: FindingSource[], names: ClassifierNames, noun = "Карточка"): FindingGroup[] {
  return elements.map((element, index) => {
    const discrepancies = readableDiscrepancies(element.discrepancies, names);
    const outbound = discrepancies.find((discrepancy) => discrepancy.path === OUTBOUND_CALL_PATH);

    return {
      key: element.key,
      title: cardTitle(element, index, noun),
      discrepancies,
      verdict: outbound === undefined ? null : outboundVerdict(outbound, expectedReportText(element)),
    };
  });
}
