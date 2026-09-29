import axios from "axios";
import { storedToken, useSessionStore, type SignInParams } from "@/entities/session";
import Endpoints from "./endpoints";
import { profileFromApi, type AuthUserDto, type LoginResponse } from "./login";

const TIMEOUT_MS = 15_000;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;

export type RestoreOutcome = "restored" | "expired" | "offline";

function bearer(token: string) {
  return { headers: { Authorization: `Bearer ${token}` }, timeout: TIMEOUT_MS };
}

function isRejected(error: unknown): boolean {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;

  return status === UNAUTHORIZED || status === FORBIDDEN;
}

function sessionFrom(user: AuthUserDto, token: string, expiresAt: number): SignInParams | null {
  const profile = profileFromApi(user);

  return profile === null ? null : { profile, token, expiresAt };
}

async function fetchProfile(token: string): Promise<AuthUserDto | "rejected" | "offline"> {
  try {
    return (await axios.get<AuthUserDto>(Endpoints.AUTH.PROFILE, bearer(token))).data;
  } catch (error) {
    return isRejected(error) ? "rejected" : "offline";
  }
}

async function refresh(token: string): Promise<SignInParams | null> {
  try {
    const { data } = await axios.post<LoginResponse>(Endpoints.AUTH.REFRESH, null, bearer(token));
    const parsed = Date.parse(data.expires_at);

    return data.user.is_blocked
      ? null
      : sessionFrom(data.user, data.access_token, Number.isFinite(parsed) ? parsed : Date.now() + data.expires_in * 1000);
  } catch {
    return null;
  }
}

/**
 * Восстановление сессии после перезагрузки: профиль и роль запрашиваются у сервера по сохранённому
 * токену, а не берутся из хранилища. Отказ сервера (401) — одна попытка продлить токен; не вышло —
 * сессия закончилась. Недоступность сервиса выходом не считается: токен остаётся до повторной проверки.
 */
export async function restoreSession(): Promise<RestoreOutcome> {
  const stored = storedToken();
  const store = useSessionStore.getState();

  if (stored === null) {
    store.logout();
    return "expired";
  }

  store.setStatus("restoring");

  const user = await fetchProfile(stored.token);

  if (user === "offline") {
    store.setStatus("offline");
    return "offline";
  }

  const session = user === "rejected" ? await refresh(stored.token) : user.is_blocked ? null : sessionFrom(user, stored.token, stored.expiresAt);

  if (session === null) {
    store.logout();
    return "expired";
  }

  store.signIn(session);
  return "restored";
}

/** Отзыв токена на сервере. Ошибка сети выход не блокирует: локальную сессию очищает вызывающий. */
export async function revokeSession(token: string | null): Promise<void> {
  if (token === null) return;

  await axios.post(Endpoints.AUTH.LOGOUT, null, bearer(token)).catch(() => undefined);
}
