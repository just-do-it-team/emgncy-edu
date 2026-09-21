import type { ResponseStatusCode } from "./incident-card";
import type { EkpFeatureConsequence, ServiceRef } from "./references";

export type ErrorSeverity = "CRITICAL" | "SIGNIFICANT" | "MINOR";

interface AttemptErrorBase {
  error_id: string;
  field: string;
  expected: string | null;
  actual: string | null;
  explanation: string;
  action_id: string | null;
}

export interface MainServiceMissedError extends AttemptErrorBase {
  kind: "MAIN_SERVICE_MISSED";
  criterion: "C2";
  severity: "CRITICAL";
  service: ServiceRef;
  ekp_feature: EkpFeatureConsequence;
}

export interface ServiceMissedError extends AttemptErrorBase {
  kind: "SERVICE_MISSED";
  criterion: "C2";
  severity: "SIGNIFICANT";
  service: ServiceRef;
  ekp_feature: EkpFeatureConsequence;
}

export interface WrongIncidentTypeError extends AttemptErrorBase {
  kind: "WRONG_INCIDENT_TYPE";
  criterion: "C1";
  severity: ErrorSeverity;
  ekp_feature: EkpFeatureConsequence;
}

export interface AmbiguousToponymError extends AttemptErrorBase {
  kind: "AMBIGUOUS_TOPONYM";
  criterion: "C4";
  severity: "CRITICAL";
}

export interface ToponymTypoError extends AttemptErrorBase {
  kind: "TOPONYM_TYPO";
  criterion: "C4";
  severity: ErrorSeverity;
}

export interface AddressMismatchError extends AttemptErrorBase {
  kind: "ADDRESS_MISMATCH";
  criterion: "C4";
  severity: ErrorSeverity;
  distance_meters: number | null;
}

export interface StatusWithoutCommentError extends AttemptErrorBase {
  kind: "STATUS_WITHOUT_COMMENT";
  criterion: "C7";
  severity: "CRITICAL";
  service: ServiceRef;
  status: ResponseStatusCode;
}

export interface StatusOrderViolationError extends AttemptErrorBase {
  kind: "STATUS_ORDER_VIOLATION";
  criterion: "C7";
  severity: ErrorSeverity;
  service: ServiceRef;
  status: ResponseStatusCode;
  previous_status: ResponseStatusCode | null;
}

export interface NormExceededError extends AttemptErrorBase {
  kind: "NORM_EXCEEDED";
  criterion: "C5";
  severity: "SIGNIFICANT";
  stage: "ACK" | "FILL";
  norm_seconds: number;
  actual_seconds: number;
}

export interface SpellingError extends AttemptErrorBase {
  kind: "SPELLING";
  criterion: "C6";
  severity: "MINOR";
}

export interface RequiredFieldEmptyError extends AttemptErrorBase {
  kind: "REQUIRED_FIELD_EMPTY";
  criterion: "C3";
  severity: ErrorSeverity;
}

export type AttemptError =
  | MainServiceMissedError
  | ServiceMissedError
  | WrongIncidentTypeError
  | AmbiguousToponymError
  | ToponymTypoError
  | AddressMismatchError
  | StatusWithoutCommentError
  | StatusOrderViolationError
  | NormExceededError
  | SpellingError
  | RequiredFieldEmptyError;

export type AttemptErrorKind = AttemptError["kind"];
