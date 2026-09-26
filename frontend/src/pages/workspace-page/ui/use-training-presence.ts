import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { trainingApi, type LaunchContext } from "@/entities/training";

type PresenceState = "checking" | "connected" | "interrupted" | "unavailable";

export function useTrainingPresence(
  ctx: LaunchContext,
  active: boolean,
  onUnavailable: (terminal: boolean) => void,
): PresenceState {
  const [state, setState] = useState<PresenceState>("checking");
  const inFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!active) return;

    let stopped = false;
    let controller: AbortController | null = null;

    function send(immediate = false) {
      if (stopped) return;
      if (inFlight.current) {
        if (immediate) {
          void inFlight.current.then(() => {
            if (!stopped) send();
          });
        }
        return;
      }

      controller = new AbortController();
      const signal = controller.signal;
      let request: Promise<void> | null = null;
      request = (async () => {
        try {
          await trainingApi.presence(ctx, signal);
          if (!stopped) setState("connected");
        } catch (error) {
          if (stopped || signal.aborted) return;
          const status = axios.isAxiosError(error)
            ? error.response?.status
            : undefined;
          if (status === 403 || status === 404 || status === 409) {
            try {
              const session = await trainingApi.session(ctx, signal);
              if (stopped || signal.aborted) return;
              if (
                session.status !== "RUNNING" &&
                session.status !== "CREATED"
              ) {
                onUnavailable(true);
                return;
              }
              setState(status === 404 ? "unavailable" : "interrupted");
            } catch (sessionError) {
              if (stopped || signal.aborted) return;
              const sessionStatus = axios.isAxiosError(sessionError)
                ? sessionError.response?.status
                : undefined;
              if (sessionStatus === 403 || sessionStatus === 404) {
                onUnavailable(false);
                return;
              }
              setState("interrupted");
            }
          } else {
            // The shared API interceptor handles authentication failures.
            setState("interrupted");
          }
        } finally {
          if (inFlight.current === request) inFlight.current = null;
        }
      })();
      inFlight.current = request;
    }

    send(true);
    const interval = window.setInterval(() => send(), 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") send(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      controller?.abort();
    };
  }, [active, ctx, onUnavailable]);

  return state;
}
