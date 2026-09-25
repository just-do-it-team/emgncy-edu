export type ArmMode = "ARM112" | "DDS";
export interface Assignment {
  id: string;
  scenario: ScenarioInfo;
  assigned_by: string;
  status: string;
  launch_policy: string;
  available_from: string | null;
  due_at: string | null;
  max_attempts: number;
  created_at: string;
  participant: {
    user_id: string;
    position_code: string | null;
    status: string;
    ready_at: string | null;
    completed_at: string | null;
  };
  active_session: {
    session_id: string;
    workspace_id: string;
    attempt_number: number;
    status: string;
    started_at: string;
  } | null;
}
export interface ScenarioInfo {
  id: string;
  revision: number;
  name: string;
  description: string | null;
  difficulty: number;
  estimated_duration_seconds: number;
  cards_count: number;
  workspace_mode: string;
  completion_policy: string;
}
export interface LaunchContext {
  userId: string;
  sessionId: string;
  workspaceId: string;
  assignmentId: string;
  mode: ArmMode;
  positionCode: string | null;
  title: string;
}
export interface StartedSession {
  session_id: string;
  workspace_id: string;
  assignment_id: string;
  status: string;
}
export interface TrainingSession {
  id: string;
  assignment_id: string;
  status: string;
  completion_policy: string;
  score: string | number | null;
  passed: boolean | null;
}
export interface CompletionReadiness {
  revision: number;
  status: string;
  can_complete: boolean;
  completion_policy: string;
  cards_total: number;
  cards_pending: number;
  calls_total: number;
  calls_completed: number;
  decisions_required: number;
  decisions_completed: number;
  blockers: { code: string; message: string }[];
}
export interface HistoryItem {
  session_id: string;
  scenario_name: string;
  attempt_number: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  final_score: string | null;
  final_passed: boolean | null;
  expert_comment: string | null;
}
export interface HistoryPage {
  items: HistoryItem[];
  total: number;
  limit: number;
  offset: number;
}
export interface ReferenceOption {
  id: number;
  code: string;
  name: string;
}
export interface EventKind extends ReferenceOption {
  event_type_id: number;
}
export interface EmergencyService {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}
export interface CardFeatures {
  event_kind_id: number;
  first_order_feature_id: number | null;
  second_order_feature_id: number | null;
  third_order_feature_id: number | null;
  feature_schema_id: string | null;
  additional_features: Record<string, unknown>;
}
export interface OperatorClassification {
  record_id: number;
  group_code: number;
  feature_1_code: number;
  feature_2_code: number;
  feature_3_code: number;
  final_incident_type: string;
  routing_flags: Record<string, boolean>;
  excluded_service_codes: string[];
}
export interface FeatureSchema {
  feature_schema_id: string;
  incident_type_name: string | null;
  additional_features_schema: AdditionalFeaturesSchema;
}
export interface AdditionalFeaturesSchema {
  properties: Record<
    string,
    {
      type: "string" | "boolean" | "number" | "integer";
      title?: string | null;
      description?: string | null;
      enum?: (string | number | boolean)[] | null;
    }
  >;
  required: string[];
  additionalProperties: boolean;
}
export interface IncomingCall {
  id: string;
  status: string;
  caller_number?: string | null;
  incident_card_id: string | null;
  scheduled_at: string | null;
  ringing_at: string | null;
  answered_at: string | null;
}
export interface CardCreate extends CardPatch {
  classification: OperatorClassification;
}
export interface CardService {
  id: string;
  service_id: string;
  current_status: string;
  is_active: boolean;
  is_visible: boolean;
  added_reason: string;
  added_at: string;
}
export interface ServiceHistory {
  id: string;
  status_code: string;
  occurred_at: string;
  comment: string | null;
}
export interface CardQuestionnaire {
  questions: string;
  answers: string;
}
export interface ApiCard {
  id: string;
  workspace_id: string;
  operator_id: string | null;
  card_number: string;
  event_type_id: number | null;
  description: string;
  questionnaire: CardQuestionnaire | null;
  applicant_full_name: string | null;
  automatic_phone_number: string | null;
  provided_phone_number: string | null;
  location_phone_number: string | null;
  reported_address: string | null;
  incident_address: string | null;
  victims_count: number | null;
  current_status: string;
  registered_at: string;
  version: number;
  features: CardFeatures | null;
  classification: OperatorClassification | null;
  services: CardService[];
}
export interface CardListItem {
  card_id: string;
  card_number: string;
  workspace_id: string;
  event_type_id: number | null;
  classification: OperatorClassification | null;
  event_kind_id: number | null;
  incident_address: string | null;
  victims_count: number | null;
  current_status: string;
  registered_at: string;
  version: number;
  features_summary: Record<string, unknown>;
  services_summary: Record<string, unknown>[];
}
export interface CardListPage {
  items: CardListItem[];
  next_cursor: string | null;
}
export interface CardPatch {
  description: string;
  questionnaire: CardQuestionnaire | null;
  incident_address: string;
  applicant_full_name: string | null;
  automatic_phone_number: string | null;
  provided_phone_number: string | null;
  location_phone_number: string | null;
  classification?: OperatorClassification;
}
export interface AudioMessage {
  id: string;
  kind: string;
  direction: string;
  status: string;
  reply_to_message_id?: string | null;
  generation_status?: string | null;
  final_segment_count?: number | null;
  last_error?: string | null;
  created_at: string;
  source_text: string | null;
  transcript: string | null;
  content_type: string | null;
  content_url: string | null;
}
export interface TtsSegment {
  id: string;
  audio_message_id: string;
  segment_no: number;
  status: string;
  content_url: string | null;
  last_error: string | null;
}
export interface CardStatusHistory {
  id: string;
  status_code: string;
  set_at: string;
  reason: string | null;
}
