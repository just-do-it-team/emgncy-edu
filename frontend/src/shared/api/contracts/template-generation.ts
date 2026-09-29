import type { JsonObject } from "./json";
import type { TemplateReviewDecision } from "./scenario-templates";

export type TemplateGenerationStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export type DispatcherServiceCode = "101" | "102" | "103" | "104";

export interface TemplateGenerationCreateDto {
  dds_service_codes: DispatcherServiceCode[];
  created_by: string;
}

export interface TemplateGenerationDto {
  id: string;
  dds_service_codes: DispatcherServiceCode[];
  status: TemplateGenerationStatus;
  attempts: number;
  last_error: string | null;
  incoming_call_template_id: string | null;
  card_template_ids: string[];
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface TemplateUpdateBase {
  updated_by: string;
  review_decisions: Record<string, TemplateReviewDecision>;
  status: "PUBLISHED" | null;
}

export interface TemplateContentUpdate {
  name: string;
  description: string | null;
  difficulty: number;
  expected_result: JsonObject;
}

export type CardTemplateUpdateDto = TemplateUpdateBase & Partial<TemplateContentUpdate & { initial_card: JsonObject }>;

export type IncomingCallTemplateUpdateDto = TemplateUpdateBase &
  Partial<
    TemplateContentUpdate & { initial_call: { initial_utterance: string; automatic_phone_number: string | null } }
  >;

export type TemplateUpdateRequest =
  | { kind: "card"; templateId: string; body: CardTemplateUpdateDto }
  | { kind: "call"; templateId: string; body: IncomingCallTemplateUpdateDto };
