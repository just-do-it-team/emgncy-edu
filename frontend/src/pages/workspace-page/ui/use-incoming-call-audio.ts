import { useEffect, useRef, useState } from "react";
import {
  apiError,
  notifyTrainingError,
  trainingApi,
  type LaunchContext,
  type TtsSegment,
} from "@/entities/training";
import { callAudioEventName, type CallAudioEvent } from "./call-audio-events";

const recordingTypes = ["audio/webm", "audio/ogg", "audio/mp4"];

export function useIncomingCallAudio(
  ctx: LaunchContext,
  callId: string | null,
  active: boolean,
  interlocutor = "заявителя",
  speaker = "заявитель",
  onGreetingStart?: (callId: string) => void,
) {
  const [status, setStatus] = useState("Подключение микрофона…");
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const pendingUpload = useRef<{
    blob: Blob;
    key: string;
    callId: string;
  } | null>(null);
  const terminalSpeech = useRef<string | null>(null);
  const playedGreeting = useRef<string | null>(null);

  useEffect(() => {
    if (!callId || !active) return;
    setError(null);
    setStatus("Подключение микрофона…");
    let disposed = false;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let recorder: MediaRecorder | null = null;
    let monitor: number | null = null;
    let greetingPoll: number | null = null;
    let audio: HTMLAudioElement | null = null;
    let objectUrl: string | null = null;
    let silenceSince: number | null = null;
    let speechSeen = false;
    let silenceMs = 600;
    let waitingId: string | null = null;
    let lastPlayedSpeech: string | null = null;
    let finalCount: number | null = null;
    let nextSegment = 1;
    let lastFailure: string | null = null;
    let playing = false;
    let greetingBusy = false;
    let greetingFailed = false;
    const segments = new Map<number, TtsSegment>();
    const mimeType =
      typeof MediaRecorder === "undefined"
        ? undefined
        : recordingTypes.find((type) => MediaRecorder.isTypeSupported(type));

    function fail(message: string) {
      if (!disposed) {
        if (ctx.mode === "DDS" && playedGreeting.current !== callId)
          greetingFailed = true;
        if (lastFailure !== message) {
          lastFailure = message;
          notifyTrainingError(new Error(message));
        }
        setError(message);
        setStatus("Разговор приостановлен");
      }
    }

    function failReply(message: string) {
      terminalSpeech.current = waitingId;
      fail(message);
    }

    function startRecording() {
      if (
        disposed ||
        !stream ||
        !mimeType ||
        (ctx.mode === "DDS" && playedGreeting.current !== callId) ||
        waitingId ||
        recorder?.state === "recording"
      )
        return;
      speechSeen = false;
      silenceSince = null;
      const chunks: Blob[] = [];
      recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (disposed || !speechSeen) return;
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size) void send(blob, crypto.randomUUID());
      };
      recorder.onerror = () =>
        fail("Не удалось записать речь. Проверьте микрофон.");
      recorder.start();
      setStatus("Микрофон включён · говорите");
    }

    async function send(blob: Blob, key: string) {
      if (!callId || disposed) return;
      pendingUpload.current = { blob, key, callId };
      setStatus("Отправка реплики…");
      try {
        const message = await trainingApi.uploadCallAudio(
          ctx,
          callId,
          blob,
          key,
        );
        if (disposed) return;
        pendingUpload.current = null;
        waitingId = message.id;
        finalCount = null;
        nextSegment = 1;
        segments.clear();
        setError(null);
        lastFailure = null;
        setStatus(`Ожидание ответа ${interlocutor}…`);
        await sync();
      } catch (cause) {
        fail(
          `${apiError(cause)} Повторите реплику после восстановления связи.`,
        );
      }
    }

    async function playAudio(blob: Blob, beforePlay?: () => void) {
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob);
      audio = new Audio(objectUrl);
      setStatus(`Говорит ${speaker}…`);
      try {
        const finished = new Promise<void>((resolve, reject) => {
          if (!audio) return reject(new Error("Аудио недоступно"));
          audio.onended = () => resolve();
          audio.onerror = () =>
            reject(new Error("Не удалось воспроизвести ответ"));
        });
        beforePlay?.();
        await audio.play();
        await finished;
      } finally {
        audio = null;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    }

    async function playSegment(segment: TtsSegment, beforePlay?: () => void) {
      const blob = await trainingApi.ttsSegmentContent(ctx.userId, segment.id);
      await playAudio(blob, beforePlay);
    }

    async function pump() {
      if (playing || disposed || !waitingId) return;
      playing = true;
      let failed = false;
      try {
        while (!disposed && segments.has(nextSegment)) {
          const segment = segments.get(nextSegment)!;
          await playSegment(segment);
          segments.delete(nextSegment);
          nextSegment += 1;
        }
        if (finalCount !== null && nextSegment > finalCount && !disposed) {
          lastPlayedSpeech = waitingId;
          waitingId = null;
          finalCount = null;
          nextSegment = 1;
          segments.clear();
          startRecording();
        }
      } catch (cause) {
        failed = true;
        fail(apiError(cause));
      } finally {
        playing = false;
        if (!failed && !disposed && waitingId && segments.has(nextSegment))
          void pump();
      }
    }

    async function sync() {
      if (!callId || disposed) return;
      if (
        ctx.mode === "DDS" &&
        greetingFailed &&
        playedGreeting.current !== callId
      )
        return;
      try {
        const messages = await trainingApi.callAudioMessages(ctx, callId);
        if (disposed) return;
        if (
          ctx.mode === "DDS" &&
          playedGreeting.current !== callId &&
          !greetingFailed
        ) {
          if (greetingBusy) return;
          greetingBusy = true;
          try {
            const greeting = messages.find(
              (item) => item.kind === "TTS" && !item.reply_to_message_id,
            );
            if (!greeting) {
              setStatus("Ожидание ответа бригады…");
              return;
            }
            if (
              greeting.status === "FAILED" ||
              greeting.generation_status === "FAILED"
            ) {
              fail(greeting.last_error ?? "Не удалось получить ответ бригады.");
              return;
            }
            const count = greeting.final_segment_count ?? 0;
            if (greeting.generation_status === "COMPLETED" && count > 0) {
              const available = await trainingApi.ttsSegments(
                ctx.userId,
                greeting.id,
              );
              if (disposed) return;
              const failedSegment = available.find(
                (segment) => segment.status === "FAILED",
              );
              if (failedSegment) {
                fail(
                  failedSegment.last_error ??
                    "Не удалось озвучить ответ бригады.",
                );
                return;
              }
              const ordered = Array.from({ length: count }, (_, index) =>
                available.find((segment) => segment.segment_no === index + 1),
              );
              if (ordered.some((segment) => segment?.status !== "COMPLETED")) {
                setStatus("Ожидание ответа бригады…");
                return;
              }
              for (const [index, segment] of ordered.entries()) {
                await playSegment(
                  segment!,
                  index === 0 ? () => onGreetingStart?.(callId) : undefined,
                );
                if (disposed) return;
              }
            } else if (
              greeting.status === "COMPLETED" &&
              greeting.content_url
            ) {
              await playAudio(
                await trainingApi.audioContent(ctx.userId, greeting.id),
                () => onGreetingStart?.(callId),
              );
              if (disposed) return;
            } else {
              setStatus("Ожидание ответа бригады…");
              return;
            }
            playedGreeting.current = callId;
            if (greetingPoll !== null) window.clearInterval(greetingPoll);
          } finally {
            greetingBusy = false;
          }
        }
        const lastSpeech = [...messages]
          .reverse()
          .find((item) => item.kind === "STT");
        if (
          !waitingId &&
          lastSpeech &&
          lastSpeech.status !== "FAILED" &&
          lastSpeech.id !== lastPlayedSpeech &&
          lastSpeech.id !== terminalSpeech.current
        )
          waitingId = lastSpeech.id;
        if (!waitingId) {
          startRecording();
          return;
        }
        setStatus(`Ожидание ответа ${interlocutor}…`);
        const response = messages.find(
          (item) => item.reply_to_message_id === waitingId,
        );
        if (lastSpeech?.id === waitingId && lastSpeech.status === "FAILED") {
          failReply(
            lastSpeech.last_error ??
              "Не удалось распознать речь. Повторите реплику.",
          );
          return;
        }
        if (!response) return;
        if (response.generation_status === "FAILED") {
          failReply(
            response.last_error ?? `Не удалось получить ответ ${interlocutor}.`,
          );
          return;
        }
        if (response.generation_status === "COMPLETED")
          finalCount = response.final_segment_count ?? 0;
        const available = await trainingApi.ttsSegments(
          ctx.userId,
          response.id,
        );
        if (disposed) return;
        for (const segment of available) {
          if (segment.status === "COMPLETED")
            segments.set(segment.segment_no, segment);
          if (segment.status === "FAILED") {
            failReply(
              segment.last_error ??
                `Не удалось озвучить ответ ${interlocutor}.`,
            );
            return;
          }
        }
        void pump();
      } catch (cause) {
        fail(apiError(cause));
      }
    }

    function onEvent(event: Event) {
      const { detail } = event as CustomEvent<CallAudioEvent>;
      if (detail.workspaceId !== ctx.workspaceId || disposed) return;
      if (detail.type === "stream.open" || detail.type === "stream.gap") {
        void sync();
        return;
      }
      const data = detail.data;
      if (!data || data.training_call_id !== callId) return;
      if (ctx.mode === "DDS" && playedGreeting.current !== callId) {
        if (
          detail.type === "training.tts_completed" ||
          detail.type === "training.tts_segment_ready" ||
          detail.type === "training.tts_segment_failed" ||
          detail.type === "training.dialogue_finished" ||
          detail.type === "training.dialogue_failed"
        )
          void sync();
        return;
      }
      if (!waitingId) return;
      if (
        detail.type === "training.audio_processing_failed" &&
        data.audio_message_id === waitingId
      ) {
        failReply("Не удалось распознать речь. Повторите реплику.");
        return;
      }
      if (data.reply_to_message_id !== waitingId) return;
      if (
        detail.type === "training.dialogue_failed" ||
        detail.type === "training.tts_segment_failed"
      ) {
        failReply(`Не удалось получить голосовой ответ ${interlocutor}.`);
        return;
      }
      if (detail.type === "training.tts_segment_ready") {
        const number = Number(data.segment_no);
        if (typeof data.segment_id !== "string" || !Number.isInteger(number))
          return;
        segments.set(number, {
          id: data.segment_id,
          audio_message_id: String(data.audio_message_id),
          segment_no: number,
          status: "COMPLETED",
          content_url:
            typeof data.content_url === "string" ? data.content_url : null,
          last_error: null,
        });
        void pump();
      }
      if (detail.type === "training.dialogue_finished") {
        finalCount = Number(data.final_segment_count);
        void pump();
      }
    }

    async function setup() {
      if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
        fail("Этот браузер не поддерживает запись звука для учебного звонка.");
        return;
      }
      try {
        const config = await trainingApi.callAudioConfig();
        if (disposed) return;
        silenceMs = config.vad_silence_ms > 0 ? config.vad_silence_ms : 600;
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        context = new AudioContext();
        await context.resume();
        if (disposed) return;
        const source = context.createMediaStreamSource(stream);
        analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        monitor = window.setInterval(() => {
          if (!analyser || recorder?.state !== "recording" || waitingId) return;
          analyser.getByteTimeDomainData(samples);
          let energy = 0;
          for (const sample of samples) energy += ((sample - 128) / 128) ** 2;
          const speaking = Math.sqrt(energy / samples.length) > 0.025;
          if (speaking) {
            speechSeen = true;
            silenceSince = null;
            setStatus("Запись реплики…");
          } else if (speechSeen) {
            silenceSince ??= Date.now();
            if (Date.now() - silenceSince >= silenceMs) recorder.stop();
          }
        }, 60);
        if (pendingUpload.current?.callId === callId) {
          const { blob, key } = pendingUpload.current;
          await send(blob, key);
        } else {
          pendingUpload.current = null;
          await sync();
        }
        if (ctx.mode === "DDS" && playedGreeting.current !== callId) {
          greetingPoll = window.setInterval(() => {
            if (
              playedGreeting.current !== callId &&
              !greetingBusy &&
              !greetingFailed
            )
              void sync();
          }, 1500);
        }
      } catch (cause) {
        fail(
          cause instanceof DOMException && cause.name === "NotAllowedError"
            ? "Разрешите доступ к микрофону в браузере и повторите подключение."
            : apiError(cause),
        );
      }
    }

    window.addEventListener(callAudioEventName, onEvent);
    void setup();
    return () => {
      disposed = true;
      window.removeEventListener(callAudioEventName, onEvent);
      if (monitor !== null) window.clearInterval(monitor);
      if (greetingPoll !== null) window.clearInterval(greetingPoll);
      if (recorder?.state === "recording") recorder.stop();
      audio?.pause();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
    };
  }, [active, callId, ctx, interlocutor, onGreetingStart, retry, speaker]);

  return {
    status,
    error,
    busy: status === "Запись реплики…" || status === "Отправка реплики…",
    retry: () => {
      setError(null);
      setRetry((value) => value + 1);
    },
  };
}
