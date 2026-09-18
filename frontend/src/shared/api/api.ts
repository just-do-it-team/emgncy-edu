import axios, { AxiosError } from "axios";
import { SERVER_URL } from "@/app/config";
import Endpoints from "@/shared/api/endpoints.ts";

export const api = axios.create({
  baseURL: SERVER_URL,
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (
      error.response?.status === 401 &&
      localStorage.getItem("auth_status") &&
      error.config?.url !== Endpoints.AUTH.LOGOUT
    ) {
      localStorage.removeItem("auth_status");
      localStorage.removeItem("role");

      window.location.reload();
    }

    throw error;
  },
);
