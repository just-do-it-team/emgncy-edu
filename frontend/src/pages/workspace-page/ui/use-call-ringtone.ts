import { useCallback, useEffect, useRef, useState } from "react";

export function useCallRingtone(src: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const attemptRef = useRef(0);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const audio = new Audio(src);
    audio.loop = true;
    audio.preload = "auto";
    audioRef.current = audio;
    return () => {
      attemptRef.current += 1;
      audio.pause();
      audioRef.current = null;
    };
  }, [src]);

  const start = useCallback(() => {
    const audio = audioRef.current;
    if (!audio?.paused) return;
    const attempt = ++attemptRef.current;
    void audio.play().then(
      () => {
        if (attempt === attemptRef.current) setBlocked(false);
      },
      () => {
        if (attempt === attemptRef.current) setBlocked(true);
      },
    );
  }, []);

  const stop = useCallback(() => {
    attemptRef.current += 1;
    setBlocked(false);
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    if (audio.readyState > 0) audio.currentTime = 0;
  }, []);

  return { start, stop, blocked };
}
