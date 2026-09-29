const STORAGE_KEY = "s112-access-token:v1";

interface StoredToken {
  token: string;
  expiresAt: number;
}

let accessToken: string | null = null;

/**
 * Токен доступа держится в памяти и дублируется в sessionStorage вкладки, чтобы перезагрузка страницы
 * не выкидывала на вход: сервер не выдаёт refresh-cookie, другого способа пережить F5 нет. В хранилище
 * только токен и срок действия — профиль с ФИО заново запрашивается у сервера. Закрытие вкладки
 * стирает сессию.
 */
export function setToken(token: string, expiresAt: number): void {
  accessToken = token;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt } satisfies StoredToken));
  } catch {
    return;
  }
}

export function getToken(): string | null {
  return accessToken;
}

export function storedToken(): StoredToken | null {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null");

    if (typeof parsed !== "object" || parsed === null) return null;

    const { token, expiresAt } = parsed as Partial<StoredToken>;

    return typeof token === "string" && typeof expiresAt === "number" && expiresAt > Date.now()
      ? { token, expiresAt }
      : null;
  } catch {
    return null;
  }
}

export function clearToken(): void {
  accessToken = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}
