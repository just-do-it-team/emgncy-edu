export interface ExpectedCardField {
  field: string;
  label: string;
  literal: boolean;
}

export const expectedCardFields: ExpectedCardField[] = [
  { field: "classification", label: "Тип происшествия", literal: false },
  { field: "description", label: "Описание со слов заявителя", literal: true },
  { field: "questionnaire", label: "Опросная карта", literal: false },
  { field: "applicant_full_name", label: "ФИО заявителя", literal: true },
  { field: "automatic_phone_number", label: "АОН", literal: false },
  { field: "provided_phone_number", label: "Предоставленный телефон", literal: false },
  { field: "location_phone_number", label: "Телефон на месте", literal: false },
  { field: "reported_address", label: "Адрес со слов заявителя", literal: true },
  { field: "incident_address", label: "Адрес происшествия", literal: true },
  { field: "victims_count", label: "Пострадавших", literal: false },
  { field: "current_status", label: "Статус карточки", literal: false },
  { field: "services", label: "Службы", literal: false },
  { field: "service_statuses", label: "Статусы служб", literal: false },
];

export const literalComparisonWarning = "сравнивается посимвольно — правильная работа может дать расхождение";
