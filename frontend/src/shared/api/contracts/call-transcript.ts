export type CallSpeaker = "CALLER" | "OPERATOR";

export type CallInputMode = "VOICE" | "TEXT";

export interface CallUtteranceDto {
  id: string;
  speaker: CallSpeaker;
  input_mode: CallInputMode;
  offset_ms: number;
  duration_ms: number;
  text: string;
  audio_url: string | null;
  stt_confidence: number | null;
}

export interface CallTranscriptDto {
  call_id: string;
  started_at: string;
  duration_ms: number;
  utterances: CallUtteranceDto[];
}

export interface CallUtterance {
  id: string;
  speaker: CallSpeaker;
  inputMode: CallInputMode;
  offsetMs: number;
  durationMs: number;
  text: string;
  audioUrl: string | null;
  sttConfidence: number | null;
}

export interface CallTranscript {
  callId: string;
  startedAt: string;
  durationMs: number;
  utterances: CallUtterance[];
}

export function toCallTranscript(dto: CallTranscriptDto): CallTranscript {
  return {
    callId: dto.call_id,
    startedAt: dto.started_at,
    durationMs: dto.duration_ms,
    utterances: dto.utterances
      .map((utterance) => ({
        id: utterance.id,
        speaker: utterance.speaker,
        inputMode: utterance.input_mode,
        offsetMs: utterance.offset_ms,
        durationMs: utterance.duration_ms,
        text: utterance.text,
        audioUrl: utterance.audio_url,
        sttConfidence: utterance.stt_confidence,
      }))
      .sort((first, second) => first.offsetMs - second.offsetMs),
  };
}
