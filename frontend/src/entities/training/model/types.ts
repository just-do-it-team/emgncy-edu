export type ArmMode = "ARM112" | "DDS";
export interface Assignment {
  id: string;
  scenario_id: string;
  status: string;
  launch_policy: string;
  available_from: string | null;
  due_at: string | null;
  max_attempts: number;
  participants: {
    user_id: string;
    position_code: string | null;
    status: string;
  }[];
}
export interface ScenarioInfo {
  id: string;
  name: string;
  description: string | null;
  difficulty: number;
  estimated_duration_seconds: number;
  cards_count: number;
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
  score: string | null;
  passed: boolean | null;
}
export interface CompletionReadiness {
  status: string;
  can_complete: boolean;
  completion_policy: string;
  cards_total: number;
  cards_pending: number;
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
export interface FeatureSchema {
  feature_schema_id: string;
  incident_type_name: string | null;
  additional_features_schema: Record<string, unknown>;
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
export interface ApiCard {
  id: string;
  workspace_id: string;
  card_number: string;
  event_type_id: number;
  description: string;
  questionnaire: Record<string, unknown> | null;
  reported_address: string | null;
  incident_address: string | null;
  victims_count: number | null;
  current_status: string;
  registered_at: string;
  version: number;
  features: CardFeatures | null;
  services: CardService[];
}
export interface CardListItem {
  card_id: string;
  card_number: string;
  workspace_id: string;
  event_type_id: number;
  event_kind_id: number | null;
  incident_address: string | null;
  victims_count: number | null;
  current_status: string;
  registered_at: string;
  version: number;
  features_summary: Record<string, unknown>;
  services_summary: Record<string, unknown>[];
}
export interface CardPatch {
  description: string;
  questionnaire: Record<string, unknown>;
  incident_address: string;
}
export interface AudioMessage {
  id: string;
  kind: string;
  direction: string;
  status: string;
  created_at: string;
  source_text: string | null;
  transcript: string | null;
  content_type: string | null;
  content_url: string | null;
}
export interface CardStatusHistory {
  id: string;
  status_code: string;
  set_at: string;
  reason: string | null;
}
