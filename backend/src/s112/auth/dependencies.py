from __future__ import annotations

import uuid
from collections.abc import Callable, Coroutine
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from s112.auth.principal import Principal
from s112.auth.settings import AuthSettings, get_auth_settings
from s112.auth.tokens import TokenError, decode_access_token
from s112.common.enums import UserRole
from s112.domain.models import UserAccount


bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized(detail: str = "Authentication required") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def _load_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None,
) -> Principal:
    cached = getattr(request.state, "principal", None)
    if isinstance(cached, Principal):
        return cached
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()

    settings: AuthSettings = (
        getattr(request.app.state, "auth_settings", None) or get_auth_settings()
    )
    try:
        settings.signing_secret()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    try:
        claims = decode_access_token(credentials.credentials, settings=settings)
        user_id = uuid.UUID(claims["sub"])
        token_id = uuid.UUID(claims["jti"])
        expires_at = datetime.fromtimestamp(claims["exp"], tz=timezone.utc)
    except (TokenError, ValueError) as exc:
        raise _unauthorized("Invalid or expired access token") from exc

    database = getattr(request.app.state, "database", None)
    if database is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication database is unavailable",
        )
    async with database.write_session_factory() as session:
        session: AsyncSession
        user = await session.get(UserAccount, user_id)
    if user is None:
        raise _unauthorized("User account no longer exists")
    if user.is_blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is blocked",
        )

    principal = Principal.from_user(
        user,
        token_id=token_id,
        token_expires_at=expires_at,
    )
    request.state.principal = principal
    return principal


async def get_current_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> Principal:
    return await _load_principal(request, credentials)


async def require_auth_if_enabled(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> Principal | None:
    if request.url.path == "/health":
        return None
    settings: AuthSettings = (
        getattr(request.app.state, "auth_settings", None) or get_auth_settings()
    )
    if not settings.enabled:
        return None
    return await _load_principal(request, credentials)


RoleDependency = Callable[..., Coroutine[Any, Any, Principal]]


def require_roles(*roles: UserRole) -> RoleDependency:
    allowed_roles = frozenset(roles)

    async def dependency(
        principal: Principal = Depends(get_current_principal),
    ) -> Principal:
        if principal.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return principal

    return dependency
