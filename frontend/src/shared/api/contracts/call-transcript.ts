export type CallSpeaker = "OPERATOR" | "CALLER" | "RESPONSE_LEAD";

export type CallInputMode = "VOICE" | "GENERATED";

export interface CallUtteranceDto {
  id: string;
  speaker: CallSpeaker;
  input_mode: CallInputMode;
  sequence_no: number;
  created_at: string;
  duration_ms: number | null;
  text: string;
  audio_urls: string[];
}

export interface CallTranscriptDto {
  call_id: string;
  training_session_id: string;
  answered_at: string | null;
  completed_at: string | null;
  utterances: CallUtteranceDto[];
}

export interface CallUtterance {
  id: string;
  speaker: CallSpeaker;
  inputMode: CallInputMode;
  sequenceNo: number;
  createdAt: string;
  durationMs: number | null;
  text: string;
  audioUrls: string[];
  callOffsetMs: number | null;
}

export interface RecordingPosition {
  utteranceId: string;
  recordingOffsetMs: number;
  durationMs: number;
}

export type RecordingAxis =
  | { status: "available"; totalMs: number; positions: RecordingPosition[] }
  | { status: "unavailable"; reason: "missing_duration" }
  | {
      status: "unavailable";
      reason: "duration_mismatch";
      utterancesTotalMs: number;
      recordingMs: number;
    };

export interface CallTranscript {
  callId: string;
  trainingSessionId: string;
  answeredAt: string | null;
  completedAt: string | null;
  utterances: CallUtterance[];
  recordingAxis: RecordingAxis;
}

export const RECORDING_SYNC_TOLERANCE_MS = 250;

function callOffsetMs(answeredAt: string | null, createdAt: string): number | null {
  if (answeredAt === null) return null;

  const offset = Date.parse(createdAt) - Date.parse(answeredAt);

  return Number.isFinite(offset) ? offset : null;
}

function recordingAxis(utterances: CallUtterance[]): RecordingAxis {
  const positions: RecordingPosition[] = [];
  let recordingOffsetMs = 0;

  for (const utterance of utterances) {
    if (utterance.durationMs === null) return { status: "unavailable", reason: "missing_duration" };

    positions.push({ utteranceId: utterance.id, recordingOffsetMs, durationMs: utterance.durationMs });
    recordingOffsetMs += utterance.durationMs;
  }

  return { status: "available", totalMs: recordingOffsetMs, positions };
}

export function toCallTranscript(dto: CallTranscriptDto): CallTranscript {
  const utterances = dto.utterances
    .map((utterance) => ({
      id: utterance.id,
      speaker: utterance.speaker,
      inputMode: utterance.input_mode,
      sequenceNo: utterance.sequence_no,
      createdAt: utterance.created_at,
      durationMs: utterance.duration_ms,
      text: utterance.text,
      audioUrls: utterance.audio_urls,
      callOffsetMs: callOffsetMs(dto.answered_at, utterance.created_at),
    }))
    .sort((first, second) => first.sequenceNo - second.sequenceNo);

  return {
    callId: dto.call_id,
    trainingSessionId: dto.training_session_id,
    answeredAt: dto.answered_at,
    completedAt: dto.completed_at,
    utterances,
    recordingAxis: recordingAxis(utterances),
  };
}

export function alignRecordingAxis(axis: RecordingAxis, recordingMs: number): RecordingAxis {
  if (axis.status !== "available") return axis;
  if (Math.abs(axis.totalMs - recordingMs) <= RECORDING_SYNC_TOLERANCE_MS) return axis;

  return {
    status: "unavailable",
    reason: "duration_mismatch",
    utterancesTotalMs: axis.totalMs,
    recordingMs,
  };
}
