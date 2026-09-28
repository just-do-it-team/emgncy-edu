export type ComparisonMethod = "strict" | "normalized" | "not_scored";

export interface ExpectedCardField {
  field: string;
  label: string;
  comparison: ComparisonMethod;
}

export const expectedCardFields: ExpectedCardField[] = [
  { field: "classification", label: "Тип происшествия", comparison: "strict" },
  { field: "description", label: "Описание со слов заявителя", comparison: "not_scored" },
  { field: "questionnaire", label: "Опросная карта", comparison: "strict" },
  { field: "applicant_full_name", label: "ФИО заявителя", comparison: "normalized" },
  { field: "automatic_phone_number", label: "АОН", comparison: "strict" },
  { field: "provided_phone_number", label: "Предоставленный телефон", comparison: "strict" },
  { field: "location_phone_number", label: "Телефон на месте", comparison: "strict" },
  { field: "reported_address", label: "Адрес со слов заявителя", comparison: "normalized" },
  { field: "incident_address", label: "Адрес происшествия", comparison: "normalized" },
  { field: "victims_count", label: "Пострадавших", comparison: "strict" },
  { field: "current_status", label: "Статус карточки", comparison: "strict" },
  { field: "services", label: "Службы", comparison: "strict" },
  { field: "service_statuses", label: "Статусы служб", comparison: "strict" },
];

export const comparisonLabels: Record<ComparisonMethod, string> = {
  strict: "сравнивается строго",
  normalized: "сравнивается без учёта регистра и пунктуации",
  not_scored: "не оценивается автоматически",
};

export const comparisonHints: Record<ComparisonMethod, string> = {
  strict: "Значение обучаемого должно совпасть с эталоном в точности.",
  normalized:
    "Без учёта регистра, знаков препинания, лишних пробелов и разницы «ё/е»; в адресе «улица/ул.», «дом/д.» и «корпус/корп.» приводятся к одному виду. Другие сокращения и порядок частей адреса должны совпадать.",
  not_scored: "Сервер не включает поле в автоматический балл; значение сохраняется для экспертной оценки преподавателем.",
};

export const statusCommentComparison = "не оценивается, хранится для экспертной оценки";

export function comparisonOf(field: string): ComparisonMethod {
  return expectedCardFields.find((candidate) => candidate.field === field)?.comparison ?? "strict";
}
