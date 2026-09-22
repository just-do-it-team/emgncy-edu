from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, SecretStr

from s112.common.enums import UserRole
from s112.domain.models import UserAccount


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: SecretStr = Field(min_length=1, max_length=256)


class AuthenticatedUser(BaseModel):
    id: uuid.UUID
    username: str
    display_name: str
    email: str | None
    role: UserRole
    is_blocked: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_user(cls, user: UserAccount) -> "AuthenticatedUser":
        return cls(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            email=user.email,
            role=UserRole(user.role),
            is_blocked=user.is_blocked,
            last_login_at=user.last_login_at,
            created_at=user.created_at,
            updated_at=user.updated_at,
        )


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    expires_at: datetime
    user: AuthenticatedUser
