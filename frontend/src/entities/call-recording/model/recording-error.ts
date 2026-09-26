import { isAxiosError } from "axios";

export type RecordingErrorKind = "not_completed" | "not_found" | "forbidden" | "unavailable";

export const recordingErrorMessages: Record<RecordingErrorKind, string> = {
  not_completed: "Звонок ещё не завершён, запись появится после его окончания",
  not_found: "Запись звонка не найдена или нет прав на её просмотр",
  forbidden: "Пользователь запроса не совпадает с пользователем входа, войдите заново",
  unavailable: "Запись звонка сейчас недоступна",
};

export function recordingErrorKind(error: unknown): RecordingErrorKind {
  const status = isAxiosError(error) ? error.response?.status : undefined;

  if (status === 409) return "not_completed";
  if (status === 404) return "not_found";
  if (status === 403) return "forbidden";

  return "unavailable";
}
