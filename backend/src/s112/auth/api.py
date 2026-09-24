from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.auth.dependencies import get_current_principal, get_logout_principal
from s112.auth.passwords import verify_password
from s112.auth.principal import Principal
from s112.auth.schemas import AuthenticatedUser, LoginRequest, LoginResponse
from s112.auth.settings import AuthSettings
from s112.auth.tokens import create_access_token
from s112.common.enums import UserRole
from s112.domain.models import RevokedAccessToken, UserAccount


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

# A valid PBKDF2 hash used only to make unknown-user attempts perform comparable work.
_DUMMY_PASSWORD_HASH = (
    "pbkdf2_sha256$600000$b0spovtkwrxDwUUoNRt1kw=="
    "$RReKRAsfENhoW_SdEYkjJ7Q58wazxypreG9o-50c3rg="
)


async def get_auth_session(request: Request):
    async with request.app.state.database.write_session_factory() as session:
        yield session


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Войти в систему",
    responses={
        401: {"description": "Неверный логин или пароль"},
        403: {"description": "Учётная запись заблокирована"},
        503: {"description": "JWT-секрет не настроен"},
    },
)
async def login(
    payload: LoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_auth_session),
) -> LoginResponse:
    normalized_username = payload.username.strip().lower()
    user = await session.scalar(
        select(UserAccount).where(
            UserAccount.normalized_username == normalized_username
        )
    )
    password = payload.password.get_secret_value()
    password_is_valid = await asyncio.to_thread(
        verify_password,
        password,
        user.password_hash if user is not None else _DUMMY_PASSWORD_HASH,
    )
    if user is None or not password_is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.is_blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is blocked",
        )

    auth_settings: AuthSettings = request.app.state.auth_settings
    try:
        token, expires_at = create_access_token(
            user_id=user.id,
            username=user.username,
            role=UserRole(user.role),
            settings=auth_settings,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    user.last_login_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(user)
    return LoginResponse(
        access_token=token,
        expires_in=auth_settings.access_token_ttl_seconds,
        expires_at=expires_at,
        user=AuthenticatedUser.from_user(user),
    )


@router.get("/profile", response_model=AuthenticatedUser)
async def profile(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_auth_session),
) -> AuthenticatedUser:
    user = await session.get(UserAccount, principal.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User account no longer exists")
    return AuthenticatedUser.from_user(user)


@router.post("/refresh", response_model=LoginResponse)
async def refresh(
    request: Request,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_auth_session),
) -> LoginResponse:
    auth_settings: AuthSettings = request.app.state.auth_settings
    async with session.begin():
        user = await session.scalar(
            select(UserAccount)
            .where(UserAccount.id == principal.user_id)
            .with_for_update()
        )
        if await session.get(RevokedAccessToken, principal.token_id) is not None:
            raise HTTPException(status_code=401, detail="Access token has been revoked")
        token, expires_at = create_access_token(
            user_id=user.id,
            username=user.username,
            role=UserRole(user.role),
            settings=auth_settings,
        )
        session.add(
            RevokedAccessToken(
                token_id=principal.token_id,
                user_id=user.id,
                expires_at=principal.token_expires_at,
            )
        )
    return LoginResponse(
        access_token=token,
        expires_in=auth_settings.access_token_ttl_seconds,
        expires_at=expires_at,
        user=AuthenticatedUser.from_user(user),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    principal: Principal = Depends(get_logout_principal),
    session: AsyncSession = Depends(get_auth_session),
) -> None:
    async with session.begin():
        await session.scalar(
            select(UserAccount)
            .where(UserAccount.id == principal.user_id)
            .with_for_update()
        )
        if await session.get(RevokedAccessToken, principal.token_id) is not None:
            return
        session.add(
            RevokedAccessToken(
                token_id=principal.token_id,
                user_id=principal.user_id,
                expires_at=principal.token_expires_at,
            )
        )
