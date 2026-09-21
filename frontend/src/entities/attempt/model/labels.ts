import type { AttemptErrorKind, ErrorSeverity } from "./attempt-error";
import type { AttemptMode } from "./attempt";
import type { ApplicantStatus, ResponseStatusCode, ServiceAddedReason } from "./incident-card";

export const attemptModeLabels: Record<AttemptMode, string> = {
  ARM112: "АРМ-112",
  DDS: "АРМ ДДС",
};

export const severityLabels: Record<ErrorSeverity, string> = {
  CRITICAL: "Критическая",
  SIGNIFICANT: "Значимая",
  MINOR: "Незначительная",
};

export const applicantStatusLabels: Record<ApplicantStatus, string> = {
  WITNESS: "Очевидец",
  VICTIM: "Пострадавший",
  RELATIVE: "Родственник",
  ACQUAINTANCE: "Знакомый",
  CHILD: "Ребёнок",
  PARTICIPANT: "Участник",
};

export const responseStatusLabels: Record<ResponseStatusCode, string> = {
  ADDED: "Добавлена",
  RECEIVED: "Получена службой",
  ACCEPTED: "Принята",
  REJECTED: "Не принята",
  RESPONSE_STARTED: "Начало реагирования",
  ARRIVED: "Прибытие",
  WORK_IN_PROGRESS: "Проведение работ",
  WORK_COMPLETED: "Работы завершены",
  WORK_REFUSED: "Отказ от выполнения работ",
};

export const serviceAddedReasonLabels: Record<ServiceAddedReason, string> = {
  EKP: "ЕКП",
  MANUAL: "вручную",
  VIS_UPDATE: "из ВИС",
};

export const errorKindLabels: Record<AttemptErrorKind, string> = {
  MAIN_SERVICE_MISSED: "Пропуск главной службы",
  SERVICE_MISSED: "Пропуск службы",
  WRONG_INCIDENT_TYPE: "Неверный итоговый тип",
  AMBIGUOUS_TOPONYM: "Неоднозначный топоним",
  TOPONYM_TYPO: "Опечатка в топониме",
  ADDRESS_MISMATCH: "Расхождение адреса",
  STATUS_WITHOUT_COMMENT: "Статус без обязательного комментария",
  STATUS_ORDER_VIOLATION: "Нарушение порядка статусов",
  NORM_EXCEEDED: "Превышение норматива",
  SPELLING: "Орфография",
  REQUIRED_FIELD_EMPTY: "Незаполненное обязательное поле",
};

export const severityOrder: Record<ErrorSeverity, number> = {
  CRITICAL: 0,
  SIGNIFICANT: 1,
  MINOR: 2,
};
