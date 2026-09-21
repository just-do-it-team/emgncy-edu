import type {
  ChannelRef,
  ClassifierRef,
  IncidentTypeRef,
  SelectedFeature,
  ServiceRef,
} from "./references";

export type CardSourceType =
  | "CALL"
  | "SMS"
  | "VIS"
  | "ERA_GLONASS"
  | "REGIONAL_112"
  | "MANUAL";

export type ApplicantStatus =
  | "WITNESS"
  | "VICTIM"
  | "RELATIVE"
  | "ACQUAINTANCE"
  | "CHILD"
  | "PARTICIPANT";

export type ServiceAddedReason = "EKP" | "MANUAL" | "VIS_UPDATE";

export type ResponseStatusCode =
  | "ADDED"
  | "RECEIVED"
  | "ACCEPTED"
  | "REJECTED"
  | "RESPONSE_STARTED"
  | "ARRIVED"
  | "WORK_IN_PROGRESS"
  | "WORK_COMPLETED"
  | "WORK_REFUSED";

export interface CardPhones {
  aon: string | null;
  provided: string | null;
  at_location: string | null;
  is_foreign: boolean;
}

export interface Applicant {
  full_name: string | null;
  status: ApplicantStatus | null;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface IncidentAddress {
  full: string | null;
  country: string | null;
  subject: string | null;
  settlement: string | null;
  object: string | null;
  okrug: string | null;
  district: string | null;
  street: string | null;
  house: string | null;
  building: string | null;
  structure: string | null;
  apartment: string | null;
  entrance: string | null;
  floor: string | null;
  intercom_code: string | null;
  descriptive: string | null;
  coordinates: Coordinates | null;
}

export interface CardService extends ServiceRef {
  is_main: boolean;
  added_reason: ServiceAddedReason;
}

export interface ResponseStatusEntry {
  service_id: string;
  status: ResponseStatusCode;
  set_at: string;
  comment: string | null;
}

interface IncidentCardBase {
  source_type: CardSourceType;
  external_card_id: string | null;
  channel: ChannelRef | null;
  phones: CardPhones;
  applicant: Applicant;
  address: IncidentAddress;
  event_type: ClassifierRef | null;
  event_kind: ClassifierRef | null;
  features: SelectedFeature[];
  final_incident_type: IncidentTypeRef | null;
  description: string;
  victims_count: number | null;
  services: CardService[];
}

export interface Arm112Card extends IncidentCardBase {
  mode: "ARM112";
}

export interface DdsCard extends IncidentCardBase {
  mode: "DDS";
  response_statuses: ResponseStatusEntry[];
}

export type IncidentCard = Arm112Card | DdsCard;
