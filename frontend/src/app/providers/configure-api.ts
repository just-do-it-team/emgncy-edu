import type { AxiosError } from "axios";
import { notifications } from "@mantine/notifications";
import { getToken, useSessionStore } from "@/entities/session";
import { authEndpoints } from "@/features/auth";
import { api, RequestError } from "@/shared/api";

const SESSION_EXPIRED = "Сессия истекла";

const request = api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const { profile } = useSessionStore.getState();
  if (profile) config.headers["X-User-Id"] = profile.userId;

  return config;
});

const response = api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (
      error.response?.status !== 401 ||
      error.config?.url === authEndpoints.AUTH.LOGIN ||
      !useSessionStore.getState().profile
    ) {
      throw error;
    }

    useSessionStore.getState().logout();
    notifications.show({
      id: "session-expired",
      title: "Ошибка",
      message: SESSION_EXPIRED,
      color: "red",
    });

    throw new RequestError(401, SESSION_EXPIRED);
  },
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    api.interceptors.request.eject(request);
    api.interceptors.response.eject(response);
  });
}
