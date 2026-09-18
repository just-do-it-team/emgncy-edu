import type { AxiosError } from "axios";
import { useSessionStore } from "@/entities/session";
import { authEndpoints } from "@/features/auth";
import { api } from "@/shared/api";

const interceptor = api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (
      error.response?.status === 401 &&
      useSessionStore.getState().role &&
      error.config?.url !== authEndpoints.AUTH.LOGOUT
    ) {
      useSessionStore.getState().logout();
    }

    throw error;
  },
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => api.interceptors.response.eject(interceptor));
}
