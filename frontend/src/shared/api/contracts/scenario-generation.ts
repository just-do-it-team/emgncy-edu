import type {
  ParticipantPosition,
  ScenarioCompletionPolicy,
  ScenarioDefinitionDto,
  ScenarioWorkspaceMode,
} from "./training-scenarios";

export interface ScenarioGenerationRequestDto {
  teacher_id: string;
  classification_group: string;
  record_id: number | null;
  difficulty: number | null;
  workspace_mode: ScenarioWorkspaceMode;
  required_participant_positions: ParticipantPosition[];
  item_count: number;
  notes: string | null;
  request_id: string;
}

export interface GeneratedScenarioDto {
  name: string;
  description: string | null;
  difficulty: number;
  estimated_duration_seconds: number;
  passing_score: number;
  workspace_mode: ScenarioWorkspaceMode;
  completion_policy: ScenarioCompletionPolicy;
  min_participants: number;
  max_participants: number;
  required_participant_positions: ParticipantPosition[] | null;
  definition: ScenarioDefinitionDto;
}

export interface ScenarioGenerationDto {
  scenario: GeneratedScenarioDto;
  generation: {
    model: string;
    generated_at: string;
    difficulty_suggested: boolean;
  };
}
