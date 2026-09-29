import { isAxiosError, isCancel } from "axios";
import { isRequestError } from "./request-error";

export function errorStatus(error: unknown): number | undefined {
  if (isRequestError(error)) return error.status;

  return isAxiosError(error) ? error.response?.status : undefined;
}

export function errorDetail(error: unknown): unknown {
  if (isRequestError(error)) return error.message;

  return isAxiosError<{ detail?: unknown }>(error) ? error.response?.data?.detail : undefined;
}

const SERVER_ERROR = 500;

/**
 * Запись могла дойти до сервера: он ответил 5xx или ответ не дошёл до страницы. Card-api отдаёт 500
 * без CORS-заголовков, поэтому при API на другом origin браузер прячет статус и axios видит
 * сетевую ошибку без ответа, хотя правка уже сохранена.
 */
export function mayHaveBeenApplied(error: unknown): boolean {
  if (isRequestError(error) || isCancel(error)) return false;
  if (!isAxiosError(error)) return false;

  const status = error.response?.status;

  return status === undefined || status >= SERVER_ERROR;
}
