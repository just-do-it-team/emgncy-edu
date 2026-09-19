from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AdminSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="S112_ADMIN_", case_sensitive=False)

    service_name: str = "admin-api"
    database_url: str = "postgresql+asyncpg://s112:s112@localhost:5432/s112"
    read_database_url: str | None = None
    prometheus_url: str = "http://prometheus:9090"
    loki_url: str = "http://loki:3100"
    grafana_public_url: str = "http://localhost:3000"
    request_timeout_seconds: float = Field(default=5.0, ge=0.5, le=30.0)
    max_log_export_rows: int = Field(default=5000, ge=100, le=50000)


@lru_cache
def get_admin_settings() -> AdminSettings:
    return AdminSettings()
