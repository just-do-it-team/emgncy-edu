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
    realtime_instance_id: str = "realtime-local"
    outbox_poll_interval_seconds: float = Field(default=0.5, ge=0.05)
    outbox_batch_size: int = Field(default=100, ge=1, le=1000)
    outbox_lock_seconds: int = Field(default=30, ge=5)
    scenario_worker_poll_interval_seconds: float = Field(default=0.5, ge=0.05)
    scenario_worker_batch_size: int = Field(default=100, ge=1, le=1000)
    scenario_worker_retry_limit: int = Field(default=5, ge=1, le=100)
    sse_heartbeat_seconds: float = Field(default=15.0, ge=1.0)
    sse_client_queue_size: int = Field(default=200, ge=10)

    @property
    def kafka_servers(self) -> list[str]:
        return [item.strip() for item in self.kafka_bootstrap_servers.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
