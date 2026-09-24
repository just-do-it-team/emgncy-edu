import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  REALTIME_GATEWAY_URL,
  type CompletionReadiness,
  type LaunchContext,
} from "@/entities/training";

type ConnectionState = "connecting" | "connected" | "disconnected";

const cardEvents = [
  "card.created",
  "card.updated",
  "card.features.updated",
  "card.status.changed",
  "card.service.added",
  "card.service.opened",
  "card.service.decision",
  "card.service.status.changed",
  "card.service.open-deadline-missed",
  "card.service.decision-deadline-missed",
];

const audioEvents = [
  "training.audio_transcribed",
  "training.tts_completed",
  "training.audio_processing_failed",
];

export function useWorkspaceEvents(ctx: LaunchContext, ready: boolean) {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<ConnectionState>("connecting");

  useEffect(() => {
    if (!ready) return;
    const baseKey = ["student-api", ctx.userId, ctx.workspaceId];
    const readinessKey = [...baseKey, "readiness", ctx.sessionId];
    const callsKey = [...baseKey, "incoming-calls", ctx.sessionId];
    const source = new EventSource(
      `${REALTIME_GATEWAY_URL}/events?workspace_id=${encodeURIComponent(ctx.workspaceId)}`,
    );
    const resync = () => {
      void queryClient.invalidateQueries({ queryKey: baseKey });
    };
    source.onopen = () => {
      setConnection("connected");
      // Recover changes between the initial REST snapshot and the SSE connection.
      resync();
    };
    source.onerror = () => setConnection("disconnected");
    source.addEventListener("stream.gap", resync);
    source.addEventListener(
      "training.session.completion-readiness-changed",
      (event) => {
        try {
          const snapshot = JSON.parse(event.data).data as CompletionReadiness;
          if (typeof snapshot.revision !== "number") return;
          queryClient.setQueryData<CompletionReadiness>(
            readinessKey,
            (current) =>
              !current || snapshot.revision > current.revision
                ? snapshot
                : current,
          );
          void queryClient.invalidateQueries({ queryKey: callsKey });
        } catch {
          resync();
        }
      },
    );
    for (const eventName of cardEvents) {
      source.addEventListener(eventName, () => {
        void queryClient.invalidateQueries({ queryKey: [...baseKey, "cards"] });
        void queryClient.invalidateQueries({ queryKey: [...baseKey, "card"] });
      });
    }
    for (const eventName of audioEvents) {
      source.addEventListener(eventName, () => {
        void queryClient.invalidateQueries({ queryKey: [...baseKey, "audio"] });
      });
    }
    for (const eventName of [
      "training.session_completed",
      "training.session_aborted",
    ]) {
      source.addEventListener(eventName, () => {
        void queryClient.invalidateQueries({ queryKey: readinessKey });
        void queryClient.invalidateQueries({
          queryKey: ["student-api", ctx.userId, "assignments"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["student-api", ctx.userId, "history"],
        });
      });
    }

    return () => source.close();
  }, [ctx.sessionId, ctx.userId, ctx.workspaceId, queryClient, ready]);

  return connection;
}
