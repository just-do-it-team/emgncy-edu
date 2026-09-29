import { AUTH_API_URL } from "@/shared/config";

const Endpoints = {
  AUTH: {
    LOGIN: `${AUTH_API_URL}/api/v1/auth/login`,
    PROFILE: `${AUTH_API_URL}/api/v1/auth/profile`,
    REFRESH: `${AUTH_API_URL}/api/v1/auth/refresh`,
    LOGOUT: `${AUTH_API_URL}/api/v1/auth/logout`,
  },
};

export default Endpoints;
