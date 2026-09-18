import { isAxiosError } from "axios";
import { notifications } from "@mantine/notifications";

export function handleApiError(
  e: unknown,
  fallbackMessage: string,
  showNotification = true,
): string {
  const responseMessage = isAxiosError<{ message?: unknown }>(e)
    ? e.response?.data?.message
    : undefined;
  const message =
    typeof responseMessage === "string" && responseMessage.trim()
      ? responseMessage
      : e instanceof Error && e.message
        ? e.message
        : fallbackMessage;

  if (showNotification) {
    notifications.show({
      title: "Ошибка",
      message,
      color: "red",
    });
  }

  return message;
}
