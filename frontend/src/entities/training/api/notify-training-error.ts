import { notifications } from "@mantine/notifications";
import { apiError } from "./training-api";

export function notifyTrainingError(error: unknown): string {
  const message = apiError(error);
  notifications.show({
    title: "Ошибка",
    message,
    color: "red",
    autoClose: 10000,
    withCloseButton: true,
  });
  return message;
}
