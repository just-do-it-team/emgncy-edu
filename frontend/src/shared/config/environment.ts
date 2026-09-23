export const SERVER_URL = '';

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

export const AUTH_API_URL = (import.meta.env.VITE_AUTH_API_URL || "/auth-api").replace(
  /\/$/,
  "",
);
