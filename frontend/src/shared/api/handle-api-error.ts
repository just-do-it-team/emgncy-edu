import { isAxiosError } from "axios";
import { notifications } from "@mantine/notifications";

type ApiErrorDetail = string | { message?: unknown } | unknown[];

function readDetail(detail: ApiErrorDetail | undefined): string | undefined {
  if (typeof detail === "string" && detail.trim()) return detail;

  if (detail && !Array.isArray(detail) && typeof detail === "object") {
    const { message } = detail;
    if (typeof message === "string" && message.trim()) return message;
  }

  return undefined;
}

export function handleApiError(
  e: unknown,
  fallbackMessage: string,
  showNotification = true,
): string {
  const detail = isAxiosError<{ detail?: ApiErrorDetail }>(e)
    ? readDetail(e.response?.data?.detail)
    : undefined;
  const message =
    detail ?? (e instanceof Error && e.message ? e.message : fallbackMessage);

  if (showNotification) {
    notifications.show({
      title: "Ошибка",
      message,
      color: "red",
    });
  }

  return message;
}
