from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from s112.common.enums import UserRole
from s112.domain.models import UserAccount


@dataclass(frozen=True, slots=True)
class Principal:
    user_id: uuid.UUID
    username: str
    display_name: str
    email: str | None
    role: UserRole
    token_id: uuid.UUID
    token_expires_at: datetime

    @classmethod
    def from_user(
        cls,
        user: UserAccount,
        *,
        token_id: uuid.UUID,
        token_expires_at: datetime,
    ) -> "Principal":
        return cls(
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            email=user.email,
            role=UserRole(user.role),
            token_id=token_id,
            token_expires_at=token_expires_at,
        )
