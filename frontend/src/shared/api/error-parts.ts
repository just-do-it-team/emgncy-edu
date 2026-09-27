import { isAxiosError } from "axios";
import { isRequestError } from "./request-error";

export function errorStatus(error: unknown): number | undefined {
  if (isRequestError(error)) return error.status;

  return isAxiosError(error) ? error.response?.status : undefined;
}

export function errorDetail(error: unknown): unknown {
  if (isRequestError(error)) return error.message;

  return isAxiosError<{ detail?: unknown }>(error) ? error.response?.data?.detail : undefined;
}
