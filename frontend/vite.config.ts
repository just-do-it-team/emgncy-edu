import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

function proxyEntry(
  prefix: string,
  target: string,
): Record<string, ProxyOptions> {
  if (!target) return {};

  return {
    [prefix]: {
      target,
      changeOrigin: true,
      rewrite: (url) => url.replace(new RegExp(`^${prefix}`), ""),
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (
    command === "serve" &&
    (!env.VITE_REALTIME_GATEWAY_URL ||
      env.VITE_REALTIME_GATEWAY_URL.replace(/\/$/, "") ===
        "/realtime-gateway") &&
    !env.VITE_REALTIME_GATEWAY_PROXY_TARGET
  ) {
    throw new Error(
      "Укажите VITE_REALTIME_GATEWAY_URL или VITE_REALTIME_GATEWAY_PROXY_TARGET для SSE.",
    );
  }

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        ...proxyEntry("/student-api", env.VITE_CARD_API_PROXY_TARGET),
        ...proxyEntry("/auth-api", env.VITE_AUTH_API_PROXY_TARGET),
        ...proxyEntry("/admin-api", env.VITE_ADMIN_API_PROXY_TARGET),
        ...proxyEntry(
          "/realtime-gateway",
          env.VITE_REALTIME_GATEWAY_PROXY_TARGET,
        ),
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
