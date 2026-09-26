from __future__ import annotations

import io
import logging
import math
import os
import queue
import re
import subprocess
import tempfile
import threading
import textwrap
import wave
from array import array
from collections import deque
from pathlib import Path
from typing import Any

from s112.common.config import Settings


logger = logging.getLogger(__name__)
VOICE_ID_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]*\.(?:wav|mp3)\Z")


class SpeechServiceError(RuntimeError):
    pass


def compose_call_audio(paths: list[Path]) -> tuple[bytes, int]:
    """Concatenate call clips in order, without reconstructing playback pauses."""
    with tempfile.TemporaryDirectory(prefix="s112-call-recording-") as directory:
        root = Path(directory)
        merged_path = root / "merged.wav"
        frame_count = 0
        with wave.open(str(merged_path), "wb") as merged:
            merged.setnchannels(1)
            merged.setsampwidth(2)
            merged.setframerate(16000)
            for index, path in enumerate(paths):
                normalized = root / f"clip-{index}.wav"
                result = subprocess.run(
                    [
                        "ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(path),
                        "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
                        str(normalized),
                    ],
                    capture_output=True,
                    text=True,
                    timeout=120,
                    check=False,
                )
                if result.returncode != 0:
                    raise SpeechServiceError(f"Could not decode call clip {index}: {result.stderr[-500:]}")
                with wave.open(str(normalized), "rb") as clip:
                    frame_count += clip.getnframes()
                    while frames := clip.readframes(16000):
                        merged.writeframes(frames)
                normalized.unlink()
        if frame_count == 0:
            raise SpeechServiceError("Call recording has no audio frames")
        output_path = root / "recording.mp3"
        result = subprocess.run(
            [
                "ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(merged_path),
                "-c:a", "libmp3lame", "-b:a", "64k", str(output_path),
            ],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if result.returncode != 0:
            raise SpeechServiceError(f"Could not encode call recording: {result.stderr[-500:]}")
        return output_path.read_bytes(), round(frame_count * 1000 / 16000)


def probe_audio_duration_ms(path: Path) -> int | None:
    """Read media duration without decoding it in the card API."""
    base = ["ffprobe", "-v", "error", "-select_streams", "a:0"]
    commands = [
        [*base, "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        [*base, "-show_entries", "packet=duration_time", "-of", "csv=p=0", str(path)],
    ]
    for index, command in enumerate(commands):
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=10, check=False)
            if result.returncode != 0:
                continue
            values = [float(line) for line in result.stdout.splitlines() if line and line != "N/A"]
            seconds = sum(values) if index else values[0] if values else 0
            if math.isfinite(seconds) and seconds > 0:
                return round(seconds * 1000)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            continue
    return None


def _force_stt_preprocessor_fp32(
    _module: Any, inputs: tuple[Any, ...]
) -> tuple[Any, ...]:
    audio, *remaining = inputs
    return (audio.float(), *remaining)


def _force_stt_encoder_output_fp32(
    _module: Any, _inputs: tuple[Any, ...], output: tuple[Any, ...]
) -> tuple[Any, ...]:
    encoded, *remaining = output
    return (encoded.float(), *remaining)


class SpeechService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._stt_model: Any | None = None
        self._stt_lock = threading.RLock()
        self._tts_lock = threading.RLock()
        self._tts_process: subprocess.Popen[bytes] | None = None
        self._tts_responses: queue.Queue[tuple[str, Any]] | None = None
        self._tts_reader: threading.Thread | None = None
        self._tts_stderr_reader: threading.Thread | None = None
        self._tts_stderr_lines: deque[str] = deque(maxlen=80)

    @property
    def stt_loaded(self) -> bool:
        return self._stt_model is not None

    @property
    def tts_loaded(self) -> bool:
        process = self._tts_process
        return process is not None and process.poll() is None

    def preload(self) -> None:
        self._start_tts_worker()
        self._get_stt_model()

    def close(self) -> None:
        with self._tts_lock:
            self._stop_tts_worker()

    def _get_stt_model(self) -> Any:
        if self._stt_model is not None:
            return self._stt_model

        with self._stt_lock:
            if self._stt_model is not None:
                return self._stt_model
            try:
                import torch
                from transformers import AutoConfig
                from transformers.dynamic_module_utils import (
                    get_class_from_dynamic_module,
                )

                device = (
                    "cuda"
                    if self.settings.stt_device == "auto"
                    and torch.cuda.is_available()
                    else "cpu"
                    if self.settings.stt_device == "auto"
                    else self.settings.stt_device
                )
                load_kwargs: dict[str, Any] = {
                    "local_files_only": True,
                    "trust_remote_code": True,
                    "dtype": torch.float32,
                }
                use_fp16 = self.settings.stt_fp16 and device.startswith("cuda")
                if device.startswith("cuda"):
                    torch.cuda.init()

                config = AutoConfig.from_pretrained(
                    self.settings.stt_model_path,
                    **load_kwargs,
                )
                model_class = get_class_from_dynamic_module(
                    config.auto_map["AutoModel"],
                    self.settings.stt_model_path,
                    local_files_only=True,
                )

                class GigaAMCPUInit(model_class):
                    def __init__(self, config: Any) -> None:
                        with torch.device("cpu"):
                            super().__init__(config)
                        if not hasattr(self, "all_tied_weights_keys"):
                            self.post_init()

                model = GigaAMCPUInit.from_pretrained(
                    self.settings.stt_model_path,
                    config=config,
                    **load_kwargs,
                ).eval()
                model.model.preprocessor.float()
                model.model.preprocessor.register_forward_pre_hook(
                    _force_stt_preprocessor_fp32
                )
                if use_fp16:
                    model.model.encoder.half()
                model.model.encoder.register_forward_hook(
                    _force_stt_encoder_output_fp32
                )
                self._stt_model = model.to(device)
            except Exception as exc:
                raise SpeechServiceError(
                    f"Не удалось загрузить GigaAM: {exc}"
                ) from exc
            return self._stt_model

    def transcribe(self, audio_path: str) -> str:
        with self._stt_lock:
            model = self._get_stt_model()
            chunks = _split_long_wav_for_stt(audio_path)
            try:
                if chunks:
                    texts = [
                        _transcript_text(model.transcribe(str(chunk)))
                        for chunk in chunks
                    ]
                    text = " ".join(value for value in texts if value).strip()
                else:
                    text = _transcript_text(model.transcribe(audio_path))
            except ValueError as exc:
                if "Too long" in str(exc):
                    raise SpeechServiceError(
                        "Запись слишком длинная для короткого режима GigaAM. "
                        "Поддерживается автоматическое деление только WAV-аудио."
                    ) from exc
                raise SpeechServiceError(
                    f"Ошибка распознавания GigaAM: {exc}"
                ) from exc
            except Exception as exc:
                raise SpeechServiceError(
                    f"Ошибка распознавания GigaAM: {exc}"
                ) from exc
            finally:
                for chunk in chunks:
                    chunk.unlink(missing_ok=True)

        if not text:
            raise SpeechServiceError("Речь не распознана")
        return text

    def synthesize(self, text: str, voice_id: str | None = None) -> tuple[bytes, int]:
        with self._tts_lock:
            selected_voice_id = self._resolve_voice_id(voice_id)
            segments = _split_tts_text(text)
            clips: list[bytes] = []
            sample_rate: int | None = None
            for index, segment in enumerate(segments, start=1):
                logger.info(
                    "TTS segment %d/%d: %d characters",
                    index,
                    len(segments),
                    len(segment),
                )
                audio, current_rate = self._synthesize_segment(segment, selected_voice_id)
                audio, has_speech, before, after = _trim_wav_tail(audio)
                if before - after >= 0.25:
                    logger.info(
                        "TTS tail silence trimmed from %.2f to %.2f seconds",
                        before,
                        after,
                    )
                if not has_speech:
                    audio, current_rate = self._synthesize_segment(segment, selected_voice_id)
                    audio, has_speech, _, _ = _trim_wav_tail(audio)
                    if not has_speech:
                        raise SpeechServiceError(
                            "Qwen3-TTS returned silent audio twice for segment "
                            f"{index}/{len(segments)}"
                        )
                if sample_rate is not None and current_rate != sample_rate:
                    raise SpeechServiceError(
                        "TTS worker changed sample rate between segments"
                    )
                sample_rate = current_rate
                clips.append(audio)

            if sample_rate is None:
                raise SpeechServiceError("Нет текста для синтеза")
            if len(clips) == 1:
                return clips[0], sample_rate
            return _join_wav_clips(clips, pause_ms=120), sample_rate

    def _resolve_voice_id(self, voice_id: str | None) -> str:
        selected = self.settings.tts_default_voice_id if voice_id is None else voice_id
        if not VOICE_ID_PATTERN.fullmatch(selected):
            raise SpeechServiceError("voice_id must be a .wav or .mp3 filename in refs")
        reference = Path(self.settings.tts_references_dir) / selected
        if reference.is_symlink() or not reference.is_file():
            raise SpeechServiceError(f"Unknown voice_id: {selected}")
        return selected

    def _synthesize_segment(self, text: str, voice_id: str) -> tuple[bytes, int]:
        self._start_tts_worker()
        process = self._tts_process
        responses = self._tts_responses
        if process is None or process.stdin is None or responses is None:
            raise SpeechServiceError("TTS worker не был запущен")

        prompt = text.encode("utf-8")
        try:
            process.stdin.write(f"SYNTH {voice_id} {len(prompt)}\n".encode("ascii"))
            process.stdin.write(prompt)
            process.stdin.flush()
        except (BrokenPipeError, OSError) as exc:
            details = self._tts_failure_details(
                "TTS worker завершился до начала синтеза"
            )
            self._stop_tts_worker()
            raise SpeechServiceError(details) from exc

        try:
            response_type, payload = responses.get(
                timeout=self.settings.tts_timeout_seconds
            )
        except queue.Empty as exc:
            self._stop_tts_worker()
            raise SpeechServiceError(
                "TTS worker не завершил синтез за "
                f"{self.settings.tts_timeout_seconds:g} секунд"
            ) from exc

        if response_type == "error":
            raise SpeechServiceError(
                self._tts_failure_details(
                    f"Ошибка синтеза Qwen3-TTS: {payload}",
                    include_exit_code=False,
                )
            )
        if response_type == "eof":
            details = self._tts_failure_details(str(payload))
            self._stop_tts_worker()
            raise SpeechServiceError(details)
        if response_type != "ok":
            self._stop_tts_worker()
            raise SpeechServiceError("TTS worker вернул неизвестный ответ")

        audio, sample_rate, timing = payload
        logger.info(
            "Qwen3-TTS timings: prompt %.2fs, generation %.2fs, "
            "vocoder %.2fs, total %.2fs, frames %d",
            timing[0],
            timing[1],
            timing[2],
            timing[3],
            timing[4],
        )
        return audio, sample_rate

    def _start_tts_worker(self) -> None:
        with self._tts_lock:
            if self.tts_loaded:
                return
            self._resolve_voice_id(None)
            self._stop_tts_worker()
            self._tts_stderr_lines.clear()
            try:
                process = subprocess.Popen(
                    self._build_tts_worker_command(),
                    env={**os.environ, "S112_TTS_REFERENCES_DIR": self.settings.tts_references_dir},
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    bufsize=0,
                )
            except FileNotFoundError as exc:
                raise SpeechServiceError(
                    "Не найден qwen-tts-worker"
                ) from exc
            except OSError as exc:
                raise SpeechServiceError(
                    f"Не удалось запустить qwen-tts-worker: {exc}"
                ) from exc

            responses: queue.Queue[tuple[str, Any]] = queue.Queue()
            reader = threading.Thread(
                target=self._read_tts_responses,
                args=(process, responses),
                name="qwen-tts-worker-reader",
                daemon=True,
            )
            stderr_reader = threading.Thread(
                target=self._read_tts_stderr,
                args=(process,),
                name="qwen-tts-worker-stderr",
                daemon=True,
            )
            self._tts_process = process
            self._tts_responses = responses
            self._tts_reader = reader
            self._tts_stderr_reader = stderr_reader
            reader.start()
            stderr_reader.start()
            try:
                response_type, payload = responses.get(
                    timeout=self.settings.tts_startup_timeout_seconds
                )
            except queue.Empty as exc:
                self._stop_tts_worker()
                raise SpeechServiceError(
                    "qwen-tts-worker не загрузил модель за "
                    f"{self.settings.tts_startup_timeout_seconds:g} секунд"
                ) from exc
            if response_type != "ready":
                details = self._tts_failure_details(str(payload))
                self._stop_tts_worker()
                raise SpeechServiceError(details)

    def _stop_tts_worker(self) -> None:
        process = self._tts_process
        self._tts_process = None
        self._tts_responses = None
        self._tts_reader = None
        stderr_reader = self._tts_stderr_reader
        self._tts_stderr_reader = None
        if process is None:
            return
        if process.poll() is None:
            try:
                if process.stdin is not None:
                    process.stdin.write(b"QUIT\n")
                    process.stdin.flush()
                process.wait(timeout=5.0)
            except (BrokenPipeError, OSError, subprocess.TimeoutExpired):
                process.terminate()
                try:
                    process.wait(timeout=5.0)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5.0)
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream is not None:
                stream.close()
        if stderr_reader is not None and stderr_reader is not threading.current_thread():
            stderr_reader.join(timeout=1.0)

    def _tts_failure_details(
        self, message: str, *, include_exit_code: bool = True
    ) -> str:
        process = self._tts_process
        return_code = process.poll() if process is not None else None
        if include_exit_code and process is not None and return_code is None:
            try:
                return_code = process.wait(timeout=0.5)
            except subprocess.TimeoutExpired:
                pass
        stderr_reader = self._tts_stderr_reader
        if return_code is not None and stderr_reader is not None:
            stderr_reader.join(timeout=0.5)
        details = message
        if include_exit_code and return_code is not None:
            details += f" (код {return_code})"
        if self._tts_stderr_lines:
            details += ". Последние сообщения worker: " + " | ".join(
                line[-1000:] for line in list(self._tts_stderr_lines)[-20:]
            )
        return details

    def _read_tts_stderr(self, process: subprocess.Popen[bytes]) -> None:
        stream = process.stderr
        if stream is None:
            return
        try:
            while raw_line := stream.readline():
                line = raw_line.decode("utf-8", errors="replace").strip()
                if line:
                    self._tts_stderr_lines.append(line)
        except OSError:
            return

    @staticmethod
    def _read_tts_responses(
        process: subprocess.Popen[bytes],
        responses: queue.Queue[tuple[str, Any]],
    ) -> None:
        stream = process.stdout
        if stream is None:
            responses.put(("eof", "TTS worker запущен без stdout"))
            return
        try:
            while True:
                raw_header = stream.readline()
                if not raw_header:
                    responses.put(("eof", "TTS worker неожиданно завершился"))
                    return
                header = raw_header.decode("ascii", errors="replace").strip()
                if header == "READY":
                    responses.put(("ready", ""))
                    continue
                parts = header.split()
                if len(parts) == 2 and parts[0] == "ERR":
                    message = _read_exact(stream, int(parts[1])).decode(
                        "utf-8", errors="replace"
                    )
                    responses.put(("error", message))
                    continue
                if len(parts) == 8 and parts[0] == "OK":
                    sample_rate = int(parts[1])
                    audio_size = int(parts[2])
                    frames = int(parts[3])
                    timing = (
                        float(parts[4]),
                        float(parts[5]),
                        float(parts[6]),
                        float(parts[7]),
                        frames,
                    )
                    responses.put(
                        (
                            "ok",
                            (_read_exact(stream, audio_size), sample_rate, timing),
                        )
                    )
                    continue
                raise ValueError(f"некорректный заголовок: {header!r}")
        except (OSError, ValueError) as exc:
            responses.put(("eof", f"Ошибка протокола TTS worker: {exc}"))

    def _build_tts_worker_command(self) -> list[str]:
        return [
            self.settings.tts_worker_binary,
            "-m",
            self.settings.tts_model_path,
            "--mmproj",
            self.settings.tts_mmproj_path,
            "--tts-lang",
            self.settings.tts_language,
            "-ngl",
            str(self.settings.tts_gpu_layers),
            "-c",
            str(self.settings.tts_context_size),
            "-b",
            str(self.settings.tts_batch_size),
            "-ub",
            str(self.settings.tts_ubatch_size),
            "-n",
            str(self.settings.tts_max_frames),
            "--top-k",
            str(self.settings.tts_top_k),
            "--top-p",
            str(self.settings.tts_top_p),
            "--temp",
            str(self.settings.tts_temperature),
            "--seed",
            str(self.settings.tts_seed),
        ]


def _transcript_text(result: Any) -> str:
    return str(getattr(result, "text", result)).strip()


def _split_long_wav_for_stt(
    audio_path: str,
    *,
    max_chunk_seconds: int = 18,
) -> list[Path]:
    """Split a long PCM WAV into GigaAM short-mode compatible chunks."""

    chunks: list[Path] = []
    try:
        with wave.open(audio_path, "rb") as reader:
            params = reader.getparams()
            max_frames = params.framerate * max_chunk_seconds
            if params.nframes <= max_frames:
                return []
            while frames := reader.readframes(max_frames):
                descriptor, filename = tempfile.mkstemp(
                    prefix="s112-stt-chunk-",
                    suffix=".wav",
                )
                os.close(descriptor)
                try:
                    with wave.open(filename, "wb") as writer:
                        writer.setparams(params)
                        writer.writeframes(frames)
                except Exception:
                    Path(filename).unlink(missing_ok=True)
                    raise
                chunks.append(Path(filename))
    except (EOFError, wave.Error):
        for chunk in chunks:
            chunk.unlink(missing_ok=True)
        return []
    except Exception:
        for chunk in chunks:
            chunk.unlink(missing_ok=True)
        raise
    return chunks


def _split_tts_text(text: str, max_chars: int = 120) -> list[str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    segments: list[str] = []
    for sentence in re.split(r"(?<=[.!?;:])\s+", normalized):
        segments.extend(
            part.strip()
            for part in textwrap.wrap(
                sentence,
                width=max_chars,
                break_long_words=False,
                break_on_hyphens=False,
            )
            if part.strip()
        )
    return segments


def _trim_wav_tail(
    audio: bytes,
    *,
    threshold_db: float = -48.0,
    window_ms: int = 20,
    keep_silence_ms: int = 140,
) -> tuple[bytes, bool, float, float]:
    try:
        with wave.open(io.BytesIO(audio), "rb") as reader:
            params = reader.getparams()
            frames = reader.readframes(params.nframes)
    except (EOFError, wave.Error) as exc:
        raise SpeechServiceError("TTS worker вернул некорректный WAV") from exc
    if (
        params.comptype != "NONE"
        or params.sampwidth != 2
        or params.framerate <= 0
        or params.nchannels <= 0
    ):
        raise SpeechServiceError("TTS worker вернул неподдерживаемый WAV")

    samples = array("h")
    samples.frombytes(frames)
    frame_count = len(samples) // params.nchannels
    original_seconds = frame_count / params.framerate
    if frame_count == 0:
        return audio, False, 0.0, 0.0

    threshold = max(1, round(32767 * math.pow(10.0, threshold_db / 20.0)))
    window_frames = max(1, params.framerate * window_ms // 1000)
    last_active_frame = -1
    for end_frame in range(frame_count, 0, -window_frames):
        start_frame = max(0, end_frame - window_frames)
        chunk = samples[
            start_frame * params.nchannels : end_frame * params.nchannels
        ]
        rms = math.sqrt(sum(sample * sample for sample in chunk) / len(chunk))
        if rms >= threshold:
            last_active_frame = end_frame
            break
    if last_active_frame < 0:
        keep_frames = min(
            frame_count, params.framerate * keep_silence_ms // 1000
        )
        has_speech = False
    else:
        keep_frames = min(
            frame_count,
            last_active_frame + params.framerate * keep_silence_ms // 1000,
        )
        has_speech = True

    frame_width = params.nchannels * params.sampwidth
    output = io.BytesIO()
    with wave.open(output, "wb") as writer:
        writer.setparams(params)
        writer.writeframes(frames[: keep_frames * frame_width])
    return (
        output.getvalue(),
        has_speech,
        original_seconds,
        keep_frames / params.framerate,
    )


def _join_wav_clips(clips: list[bytes], pause_ms: int) -> bytes:
    expected: tuple[int, int, int, str] | None = None
    chunks: list[bytes] = []
    params: Any = None
    for clip in clips:
        try:
            with wave.open(io.BytesIO(clip), "rb") as reader:
                current = (
                    reader.getnchannels(),
                    reader.getsampwidth(),
                    reader.getframerate(),
                    reader.getcomptype(),
                )
                if expected is None:
                    expected = current
                    params = reader.getparams()
                elif current != expected:
                    raise SpeechServiceError(
                        "TTS worker вернул несовместимые WAV-сегменты"
                    )
                chunks.append(reader.readframes(reader.getnframes()))
        except (EOFError, wave.Error) as exc:
            raise SpeechServiceError(
                "TTS worker вернул некорректный WAV-сегмент"
            ) from exc
    if expected is None or params is None:
        raise SpeechServiceError("Нет WAV-сегментов для объединения")
    channels, sample_width, sample_rate, _ = expected
    silence = bytes(sample_rate * pause_ms // 1000 * channels * sample_width)
    output = io.BytesIO()
    with wave.open(output, "wb") as writer:
        writer.setparams(params)
        writer.writeframes(silence.join(chunks))
    return output.getvalue()


def _read_exact(stream: Any, size: int) -> bytes:
    data = bytearray()
    while len(data) < size:
        chunk = stream.read(size - len(data))
        if not chunk:
            raise OSError(f"ожидалось {size} байт, получено {len(data)}")
        data.extend(chunk)
    return bytes(data)
