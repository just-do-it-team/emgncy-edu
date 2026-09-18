import axios, { AxiosError } from "axios";
import { SERVER_URL } from "@/app/config";
import Endpoints from "@/shared/api/endpoints.ts";
import { useAuthStore } from "@/shared/model/auth";

export const api = axios.create({
  baseURL: SERVER_URL,
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (
      error.response?.status === 401 &&
      useAuthStore.getState().role &&
      error.config?.url !== Endpoints.AUTH.LOGOUT
    ) {
      useAuthStore.getState().logout();
    }

    throw error;
  },
);
