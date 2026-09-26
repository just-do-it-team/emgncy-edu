export type CallRecordingStatus = "QUEUED" | "PROCESSING" | "READY" | "FAILED";

export interface CallRecordingDto {
  call_id: string;
  status: CallRecordingStatus;
  content_type: string | null;
  duration_ms: number | null;
  size_bytes: number | null;
  completed_at: string | null;
  content_url: string | null;
  last_error: string | null;
}

export type CallRecording =
  | { callId: string; status: "QUEUED" | "PROCESSING" }
  | {
      callId: string;
      status: "READY";
      contentType: string;
      durationMs: number;
      sizeBytes: number;
      completedAt: string;
    }
  | { callId: string; status: "FAILED"; error: string };

function present<T>(value: T | null, field: string): T {
  if (value === null) {
    throw new Error(`Запись звонка в статусе READY пришла без поля ${field}`);
  }

  return value;
}

export function toCallRecording(dto: CallRecordingDto): CallRecording {
  switch (dto.status) {
    case "QUEUED":
    case "PROCESSING":
      return { callId: dto.call_id, status: dto.status };
    case "READY":
      return {
        callId: dto.call_id,
        status: "READY",
        contentType: present(dto.content_type, "content_type"),
        durationMs: present(dto.duration_ms, "duration_ms"),
        sizeBytes: present(dto.size_bytes, "size_bytes"),
        completedAt: present(dto.completed_at, "completed_at"),
      };
    case "FAILED":
      return {
        callId: dto.call_id,
        status: "FAILED",
        error: dto.last_error ?? "Запись звонка не удалось собрать",
      };
  }
}
