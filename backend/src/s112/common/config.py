from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="S112_", case_sensitive=False)

    service_name: str = "s112"
    database_url: str = "postgresql+asyncpg://s112:s112@localhost:5432/s112"
    read_database_url: str | None = None
    kafka_bootstrap_servers: str = "localhost:29092,localhost:39092,localhost:49092"
    kafka_topic: str = "card.events"
    audio_stt_request_topic: str = "audio.stt.requested.v1"
    audio_stt_result_topic: str = "audio.stt.completed.v1"
    audio_tts_request_topic: str = "audio.tts.requested.v1"
    audio_tts_result_topic: str = "audio.tts.completed.v1"
    dialogue_request_topic: str = "dialogue.requested.v1"
    audio_failed_topic: str = "audio.processing.failed.v1"
    speech_request_consumer_group: str = "speech-request-worker-v1"
    speech_result_consumer_group: str = "speech-result-worker-v1"
    speech_api_url: str = "http://localhost:8083"
    speech_api_timeout_seconds: float = Field(default=240.0, ge=1.0)
    speech_worker_retry_limit: int = Field(default=5, ge=1, le=100)
    speech_worker_retry_base_seconds: float = Field(default=1.0, ge=0.05, le=60.0)
    speech_worker_max_poll_interval_seconds: int = Field(
        default=1800, ge=300, le=86_400
    )
    semantic_evaluation_request_topic: str = "training.semantic-evaluation.requested.v1"
    semantic_evaluation_result_topic: str = "training.semantic-evaluation.completed.v1"
    semantic_request_consumer_group: str = "semantic-evaluation-request-worker-v1"
    semantic_result_consumer_group: str = "semantic-evaluation-result-worker-v1"
    semantic_evaluation_api_url: str = "http://host.docker.internal:4555"
    semantic_evaluation_model: str = "gpt-oss-20b"
    semantic_evaluation_timeout_seconds: float = Field(default=120.0, ge=1.0)
    semantic_evaluation_retry_limit: int = Field(default=5, ge=1, le=100)
    semantic_evaluation_retry_base_seconds: float = Field(
        default=1.0, ge=0.05, le=60.0
    )
    semantic_evaluation_max_poll_interval_seconds: int = Field(
        default=1800, ge=300, le=86_400
    )
    seaweed_filer_urls: str = "http://localhost:8888,http://localhost:8889"
    seaweed_audio_prefix: str = "/audio"
    seaweed_timeout_seconds: float = Field(default=60.0, ge=1.0)
    audio_max_upload_bytes: int = Field(default=25 * 1024 * 1024, ge=1024)
    tts_max_text_chars: int = Field(default=8_000, ge=1, le=100_000)
    audio_reconcile_interval_seconds: float = Field(default=300.0, ge=10.0)
    audio_orphan_grace_seconds: int = Field(default=3600, ge=60)
    realtime_instance_id: str = "realtime-local"
    outbox_poll_interval_seconds: float = Field(default=0.05, ge=0.05)
    call_vad_silence_ms: int = Field(default=600, ge=200, le=5000)
    dialogue_llm_base_url: str = "http://host.docker.internal:4555/v1"
    dialogue_llm_model: str = "gpt-oss-20b"
    dialogue_llm_api_key: str = ""
    dialogue_llm_timeout_seconds: float = Field(default=120.0, ge=1.0)
    dialogue_llm_history_messages: int = Field(default=12, ge=1, le=100)
    outbox_batch_size: int = Field(default=100, ge=1, le=1000)
    outbox_lock_seconds: int = Field(default=30, ge=5)
    scenario_worker_poll_interval_seconds: float = Field(default=0.5, ge=0.05)
    scenario_worker_batch_size: int = Field(default=100, ge=1, le=1000)
    scenario_worker_retry_limit: int = Field(default=5, ge=1, le=100)
    presence_timeout_seconds: int = Field(default=30, ge=10, le=3600)
    presence_sweep_interval_seconds: float = Field(default=5.0, ge=1.0)
    sse_heartbeat_seconds: float = Field(default=15.0, ge=1.0)
    sse_client_queue_size: int = Field(default=200, ge=10)

    preload_models: bool = False
    stt_model_path: str = "/models/GigaAM-v3-e2e-rnnt"
    stt_device: str = "auto"
    stt_fp16: bool = True
    tts_worker_binary: str = "/opt/speech/bin/qwen-tts-worker"
    tts_startup_timeout_seconds: float = Field(default=180.0, ge=1.0)
    tts_model_path: str = "/models/Qwen3-TTS-12Hz-0.6B-Base-Q8_0.gguf"
    tts_mmproj_path: str = "/models/mmproj-Qwen3-TTS-12Hz-0.6B-Base-F16.gguf"
    tts_references_dir: str = "/models/refs"
    tts_default_voice_id: str = "reference.mp3"
    tts_language: str = "ru"
    tts_timeout_seconds: float = Field(default=180.0, ge=1.0)
    tts_gpu_layers: int = 99
    tts_context_size: int = Field(default=4096, ge=1)
    tts_batch_size: int = Field(default=512, ge=1)
    tts_ubatch_size: int = Field(default=512, ge=1)
    tts_max_frames: int = Field(default=160, ge=1)
    tts_top_k: int = Field(default=40, ge=1)
    tts_top_p: float = Field(default=0.9, gt=0.0, le=1.0)
    tts_temperature: float = Field(default=0.8, gt=0.0)
    tts_seed: int = -1

    @property
    def kafka_servers(self) -> list[str]:
        return [item.strip() for item in self.kafka_bootstrap_servers.split(",") if item.strip()]

    @property
    def seaweed_filers(self) -> list[str]:
        return [item.strip().rstrip("/") for item in self.seaweed_filer_urls.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
