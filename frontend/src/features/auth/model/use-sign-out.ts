import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getToken, useSessionStore } from "@/entities/session";
import { revokeSession } from "../api/session-api";

const LOGIN_PATH = "/login";

/** Выход: токен отзывается на сервере, локальная сессия и кэш данных очищаются сразу, не дожидаясь ответа. */
export function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useSessionStore((state) => state.logout);

  return () => {
    void revokeSession(getToken());
    logout();
    queryClient.clear();
    navigate(LOGIN_PATH, { replace: true });
  };
}
