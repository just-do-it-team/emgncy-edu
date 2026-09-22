from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="S112_AUTH_",
        case_sensitive=False,
    )

    enabled: bool = False
    jwt_secret: SecretStr = SecretStr("")
    jwt_issuer: str = "s112-auth"
    jwt_audience: str = "s112-api"
    access_token_ttl_seconds: int = Field(default=3600, ge=60, le=86_400)
    clock_skew_seconds: int = Field(default=30, ge=0, le=300)

    def signing_secret(self) -> bytes:
        secret = self.jwt_secret.get_secret_value().encode("utf-8")
        if len(secret) < 32:
            raise ValueError("S112_AUTH_JWT_SECRET must contain at least 32 bytes")
        return secret


@lru_cache
def get_auth_settings() -> AuthSettings:
    return AuthSettings()
