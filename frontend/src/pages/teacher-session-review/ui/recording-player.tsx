import { useRef, useState } from "react";
import { SegmentedControl, Skeleton } from "@mantine/core";
import type { UseQueryResult } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";
import {
  recordingErrorKind,
  recordingErrorMessages,
  useCallRecordingAudio,
} from "@/entities/call-recording";
import type { CallRecording } from "@/shared/api";
import { ActionIcon } from "@/shared/ui";
import { formatOffset } from "../model/replay";
import classes from "./session-review.module.scss";

const playbackRates = [
  { value: "1", label: "1×" },
  { value: "1.5", label: "1,5×" },
];

interface ReadyPlayerProps {
  callId: string;
  durationMs: number;
  syncNotice: string | null;
  onPlaybackChange: (ms: number | null) => void;
}

function ReadyPlayer({ callId, durationMs, syncNotice, onPlaybackChange }: ReadyPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [rate, setRate] = useState("1");
  const audio = useCallRecordingAudio(callId, true);

  if (audio.isPending || (audio.isSuccess && audio.objectUrl === null)) {
    return <Skeleton height={28} width={320} radius={0} />;
  }

  if (audio.isError) {
    return (
      <span className={classes.playerText}>
        {recordingErrorMessages[recordingErrorKind(audio.error)]}
      </span>
    );
  }

  const toggle = () => {
    const element = audioRef.current;

    if (!element) return;
    if (element.paused) void element.play();
    else element.pause();
  };

  const changeRate = (value: string) => {
    setRate(value);
    if (audioRef.current) audioRef.current.playbackRate = Number(value);
  };

  const report = (ms: number) => {
    setCurrentMs(ms);
    onPlaybackChange(ms);
  };

  return (
    <>
      <audio
        ref={audioRef}
        src={audio.objectUrl ?? undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          onPlaybackChange(null);
        }}
        onTimeUpdate={(event) => report(event.currentTarget.currentTime * 1000)}
        onSeeked={(event) => report(event.currentTarget.currentTime * 1000)}
      />
      <ActionIcon
        size="md"
        variant="filled"
        color="povDark.6"
        aria-label={playing ? "Пауза" : "Воспроизвести запись"}
        onClick={toggle}
      >
        {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </ActionIcon>
      <span className={classes.playerTime}>
        {formatOffset(currentMs)} / {formatOffset(durationMs)}
      </span>
      <SegmentedControl
        size="xs"
        radius={2}
        value={rate}
        onChange={changeRate}
        data={playbackRates}
        aria-label="Скорость воспроизведения"
      />
      {syncNotice && <span className={classes.playerHint}>{syncNotice}</span>}
    </>
  );
}

interface RecordingPlayerProps {
  callId: string;
  recording: UseQueryResult<CallRecording, Error>;
  syncNotice: string | null;
  onPlaybackChange: (ms: number | null) => void;
}

export function RecordingPlayer({ callId, recording, syncNotice, onPlaybackChange }: RecordingPlayerProps) {
  if (recording.isPending) {
    return (
      <div className={classes.player}>
        <Skeleton height={28} width={320} radius={0} />
      </div>
    );
  }

  if (recording.isError) {
    return (
      <div className={classes.player}>
        <span className={classes.playerText}>
          {recordingErrorMessages[recordingErrorKind(recording.error)]}
        </span>
      </div>
    );
  }

  const { data } = recording;

  return (
    <div className={classes.player}>
      {data.status === "READY" && (
        <ReadyPlayer
          callId={callId}
          durationMs={data.durationMs}
          syncNotice={syncNotice}
          onPlaybackChange={onPlaybackChange}
        />
      )}
      {(data.status === "QUEUED" || data.status === "PROCESSING") && (
        <>
          <span className={classes.playerText}>Запись готовится</span>
          <span className={classes.playerHint}>
            Статус проверяется автоматически, плеер появится, когда запись будет собрана.
          </span>
        </>
      )}
      {data.status === "FAILED" && (
        <>
          <span className={classes.playerText}>Запись недоступна</span>
          <span className={classes.playerHint}>
            Сервер не смог собрать запись звонка. Расшифровка и журнал действий доступны.
          </span>
        </>
      )}
    </div>
  );
}
