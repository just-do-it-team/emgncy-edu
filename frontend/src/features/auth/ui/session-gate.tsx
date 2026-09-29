import { useEffect, type ReactNode } from "react";
import { Alert, Center, Group, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useSessionStore } from "@/entities/session";
import { Button, Spinner } from "@/shared/ui";
import { restoreSession } from "../api/session-api";

export const SESSION_EXPIRED_MESSAGE = "Сессия истекла или завершена на сервере. Войдите снова.";

let restoring: Promise<void> | null = null;

// Один запрос на загрузку страницы: StrictMode монтирует обёртку дважды.
function restoreOnce(): Promise<void> {
  restoring ??= restoreSession()
    .then((outcome) => {
      if (outcome === "expired") {
        notifications.show({ id: "session-expired", title: "Нужно войти снова", message: SESSION_EXPIRED_MESSAGE, color: "red" });
      }
    })
    .finally(() => {
      restoring = null;
    });

  return restoring;
}

/**
 * Держит маршруты, пока сохранённый во вкладке токен проверяется сервером: без этого проверка роли
 * увидела бы пустую сессию и увела на вход при каждой перезагрузке страницы.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const status = useSessionStore((state) => state.status);
  const logout = useSessionStore((state) => state.logout);

  useEffect(() => {
    if (useSessionStore.getState().status === "restoring") void restoreOnce();
  }, []);

  if (status === "restoring") return <Spinner size="large" fullScreen />;

  if (status === "offline") {
    return (
      <Center mih="100vh" p="md">
        <Alert variant="outline" color="povDark2.6" title="Сервис авторизации не отвечает" maw={480}>
          <Stack gap="sm">
            <Text size="sm">Сессия сохранена. Проверьте соединение и повторите, либо войдите заново.</Text>
            <Group gap="xs">
              <Button size="xs" onClick={() => void restoreOnce()}>
                Повторить
              </Button>
              <Button size="xs" variant="outline" color="povDark2.6" onClick={logout}>
                Войти заново
              </Button>
            </Group>
          </Stack>
        </Alert>
      </Center>
    );
  }

  return children;
}
