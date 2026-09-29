import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { notifications } from "@mantine/notifications";
import { getToken, useSessionStore } from "@/entities/session";
import { authEndpoints, SESSION_EXPIRED_MESSAGE } from "@/features/auth";
import { api, RequestError } from "@/shared/api";
import { AUTH_API_URL } from "@/shared/config";

const SESSION_EXPIRED = "Сессия истекла";
const REFRESH_URL = `${AUTH_API_URL}/api/v1/auth/refresh`;
const REFRESH_AHEAD_MS = 30_000;
let refreshPromise: Promise<string> | null = null;

type RetryConfig = InternalAxiosRequestConfig & { _authRetried?: boolean };

function expireSession() {
  if (!useSessionStore.getState().profile) return;
  useSessionStore.getState().logout();
  notifications.show({
    id: "session-expired",
    title: "Нужно войти снова",
    message: SESSION_EXPIRED_MESSAGE,
    color: "red",
  });
}

function isTemporaryRefreshError(error: unknown) {
  return (
    axios.isAxiosError(error) &&
    (!error.response ||
      error.response.status >= 500 ||
      error.response.status === 429)
  );
}

function refreshToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  const { profile } = useSessionStore.getState();
  const token = getToken();
  if (!profile || !token)
    return Promise.reject(new RequestError(401, SESSION_EXPIRED));

  refreshPromise = axios
    .post<{
      access_token: string;
      expires_at: string;
      expires_in: number;
      user: { id: string };
    }>(REFRESH_URL, null, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20000,
    })
    .then(({ data }) => {
      if (
        useSessionStore.getState().profile?.userId !== profile.userId ||
        getToken() !== token ||
        data.user.id !== profile.userId
      )
        throw new RequestError(401, SESSION_EXPIRED);
      const parsedExpiry = Date.parse(data.expires_at);
      useSessionStore.getState().signIn({
        profile,
        token: data.access_token,
        expiresAt: Number.isFinite(parsedExpiry)
          ? parsedExpiry
          : Date.now() + data.expires_in * 1000,
      });
      return data.access_token;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

const request = api.interceptors.request.use(async (config) => {
  const { profile, expiresAt } = useSessionStore.getState();
  const expectedUserId = config.headers["X-User-Id"];
  if (expectedUserId && expectedUserId !== profile?.userId) {
    throw new RequestError(
      401,
      "Сессия изменилась. Откройте занятие повторно.",
    );
  }

  if (
    profile &&
    expiresAt !== null &&
    expiresAt - Date.now() <= REFRESH_AHEAD_MS &&
    config.url !== authEndpoints.AUTH.LOGIN
  ) {
    try {
      await refreshToken();
    } catch (error) {
      if (!isTemporaryRefreshError(error)) {
        expireSession();
        throw new RequestError(401, SESSION_EXPIRED);
      }
    }
  }

  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  if (profile) config.headers["X-User-Id"] = profile.userId;

  return config;
});

const response = api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;
    if (error.response?.status === 401 && config?._authRetried) {
      expireSession();
      throw new RequestError(401, SESSION_EXPIRED);
    }
    if (
      error.response?.status !== 401 ||
      !config ||
      config.url === authEndpoints.AUTH.LOGIN ||
      !useSessionStore.getState().profile
    ) {
      throw error;
    }

    let token: string | null;
    try {
      token =
        config.headers.Authorization !== `Bearer ${getToken()}`
          ? getToken()
          : await refreshToken();
      if (!token) throw new RequestError(401, SESSION_EXPIRED);
    } catch (refreshError) {
      if (isTemporaryRefreshError(refreshError)) throw error;
      expireSession();
      throw new RequestError(401, SESSION_EXPIRED);
    }
    config._authRetried = true;
    config.headers.Authorization = `Bearer ${token}`;
    return api(config);
  },
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    api.interceptors.request.eject(request);
    api.interceptors.response.eject(response);
  });
}
