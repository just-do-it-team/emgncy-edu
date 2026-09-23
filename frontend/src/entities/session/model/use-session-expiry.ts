import { useEffect } from "react";
import { useSessionStore } from "./session";

export function useSessionExpiry(): void {
  const expiresAt = useSessionStore((state) => state.expiresAt);
  const logout = useSessionStore((state) => state.logout);

  useEffect(() => {
    if (expiresAt === null) return;

    const timer = window.setTimeout(logout, Math.max(0, expiresAt - Date.now()));

    return () => window.clearTimeout(timer);
  }, [expiresAt, logout]);
}
