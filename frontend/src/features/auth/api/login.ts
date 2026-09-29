import { isAxiosError } from "axios";
import { api } from "@/shared/api";
import type { SessionProfile, SignInParams, UserRole } from "@/entities/session";
import Endpoints from "./endpoints";

interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthUserDto {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  role: string;
  is_blocked: boolean;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: string;
  user: AuthUserDto;
}

export class LoginError extends Error {}

const INVALID_CREDENTIALS = "Неверный логин или пароль";
const BLOCKED_ACCOUNT = "Учётная запись заблокирована";

const apiRoles: Record<string, UserRole> = {
  ADMINISTRATOR: "admin",
  TEACHER: "teacher",
  STUDENT: "student",
};

export function roleFromApi(role: string): UserRole | null {
  return apiRoles[role] ?? null;
}

export function profileFromApi(user: AuthUserDto): SessionProfile | null {
  const role = roleFromApi(user.role);

  return role === null ? null : { userId: user.id, username: user.username, displayName: user.display_name, role };
}

function expiresAtFrom({ expires_at, expires_in }: LoginResponse): number {
  const parsed = Date.parse(expires_at);

  return Number.isFinite(parsed) ? parsed : Date.now() + expires_in * 1000;
}

export async function login(request: LoginRequest): Promise<SignInParams> {
  let response: LoginResponse;

  try {
    response = (await api.post<LoginResponse>(Endpoints.AUTH.LOGIN, request)).data;
  } catch (error) {
    throw new LoginError(loginErrorMessage(error));
  }

  const { user } = response;

  if (user.is_blocked) throw new LoginError(BLOCKED_ACCOUNT);

  const profile = profileFromApi(user);

  if (profile === null) {
    throw new LoginError("Роль учётной записи не поддерживается тренажёром");
  }

  return {
    profile,
    token: response.access_token,
    expiresAt: expiresAtFrom(response),
  };
}

function loginErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) return "Не удалось войти. Повторите попытку.";

  switch (error.response?.status) {
    case undefined:
      return "Сервис авторизации не отвечает. Проверьте соединение.";
    case 401:
    case 422:
      return INVALID_CREDENTIALS;
    case 403:
      return BLOCKED_ACCOUNT;
    case 429:
      return "Слишком много попыток входа. Повторите позже.";
    case 503:
      return "Сервис авторизации не настроен. Обратитесь к администратору.";
    default:
      return "Не удалось войти. Повторите попытку.";
  }
}
