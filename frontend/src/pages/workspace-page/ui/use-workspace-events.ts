import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/entities/session";
import {
  REALTIME_GATEWAY_URL,
  notifyTrainingError,
  trainingKeys,
  type CompletionReadiness,
  type LaunchContext,
} from "@/entities/training";
import { publishCallAudioEvent } from "./call-audio-events";
import { readSseStream } from "./read-sse-stream";

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
  "training.tts_segment_ready",
  "training.tts_segment_failed",
  "training.dialogue_finished",
  "training.dialogue_failed",
];

export function useWorkspaceEvents(ctx: LaunchContext, ready: boolean) {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<ConnectionState>("connecting");

  useEffect(() => {
    if (!ready) {
      setConnection("disconnected");
      return;
    }
    let disconnected = false;
    let reconnectTimer: number | undefined;
    const controller = new AbortController();
    const baseKey = trainingKeys.workspace(ctx);
    const readinessKey = trainingKeys.readiness(ctx);
    const callsKey = trainingKeys.incomingCalls(ctx);
    const resync = () => {
      void queryClient.invalidateQueries({ queryKey: baseKey });
    };

    const onEvent = (eventName: string, data: string) => {
      if (eventName === "stream.gap") {
        resync();
        publishCallAudioEvent({
          workspaceId: ctx.workspaceId,
          type: "stream.gap",
        });
      } else if (
        eventName === "training.session.completion-readiness-changed"
      ) {
        try {
          const snapshot = JSON.parse(data).data as CompletionReadiness;
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
      } else if (cardEvents.includes(eventName)) {
        void queryClient.invalidateQueries({
          queryKey: trainingKeys.cards(ctx),
        });
        void queryClient.invalidateQueries({
          queryKey: trainingKeys.cardScope(ctx),
        });
      } else if (audioEvents.includes(eventName)) {
        void queryClient.invalidateQueries({
          queryKey: trainingKeys.audioScope(ctx),
        });
        try {
          const payload = JSON.parse(data) as {
            data?: Record<string, unknown>;
          };
          publishCallAudioEvent({
            workspaceId: ctx.workspaceId,
            type: eventName,
            data: payload.data,
          });
        } catch {
          publishCallAudioEvent({
            workspaceId: ctx.workspaceId,
            type: "stream.gap",
          });
        }
      } else if (
        eventName === "training.session_completed" ||
        eventName === "training.session_aborted"
      ) {
        void queryClient.invalidateQueries({ queryKey: readinessKey });
        void queryClient.invalidateQueries({
          queryKey: trainingKeys.assignments(ctx.userId),
        });
        void queryClient.invalidateQueries({
          queryKey: trainingKeys.history(ctx.userId),
        });
      }
    };

    async function connect() {
      try {
        const token = getToken();
        const response = await fetch(
          `${REALTIME_GATEWAY_URL}/events?workspace_id=${encodeURIComponent(ctx.workspaceId)}`,
          {
            headers: {
              Accept: "text/event-stream",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!response.ok)
          throw new Error(`Сервер событий ответил HTTP ${response.status}.`);
        if (
          !response.body ||
          !response.headers.get("content-type")?.includes("text/event-stream")
        )
          throw new Error("Сервер не вернул поток событий.");

        disconnected = false;
        setConnection("connected");
        publishCallAudioEvent({
          workspaceId: ctx.workspaceId,
          type: "stream.open",
        });
        // Recover changes between the initial REST snapshot and the SSE connection.
        resync();
        await readSseStream(response.body, onEvent);
      } catch (error) {
        if (controller.signal.aborted) return;
        setConnection("disconnected");
        if (!disconnected) {
          disconnected = true;
          notifyTrainingError(
            new Error(
              `Связь с событиями прервана. ${error instanceof Error ? error.message : "Повторяем подключение."}`,
            ),
          );
        }
        publishCallAudioEvent({
          workspaceId: ctx.workspaceId,
          type: "stream.error",
        });
      } finally {
        if (!controller.signal.aborted)
          reconnectTimer = window.setTimeout(() => void connect(), 3000);
      }
    }

    void connect();

    return () => {
      controller.abort();
      window.clearTimeout(reconnectTimer);
    };
  }, [ctx, queryClient, ready]);

  return connection;
}
