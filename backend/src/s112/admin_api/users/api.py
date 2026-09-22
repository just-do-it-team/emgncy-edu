from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from s112.admin_api.audit import actor_id_from_request, add_audit_event
from s112.admin_api.dependencies import get_admin_write_session
from s112.auth.passwords import hash_password
from s112.common.enums import UserRole
from s112.domain.models import SecurityPolicy, UserAccount


router = APIRouter(prefix="/users", tags=["users"])

USERNAME_PATTERN = r"^[A-Za-z0-9._-]+$"


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=USERNAME_PATTERN)
    display_name: str = Field(min_length=1, max_length=255)
    email: str | None = Field(default=None, max_length=320)
    password: str = Field(min_length=8, max_length=256)
    role: UserRole = UserRole.STUDENT

    @field_validator("username", "display_name")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Value must not be blank")
        return stripped

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        value = value.strip() if value else None
        if value is not None and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Invalid email address")
        return value


class RoleChange(BaseModel):
    role: UserRole


class BlockChange(BaseModel):
    blocked: bool
    reason: str | None = Field(default=None, max_length=500)


class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    display_name: str
    email: str | None
    role: UserRole
    is_blocked: bool
    blocked_at: datetime | None
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime


class UserPage(BaseModel):
    items: list[UserResponse]
    total: int
    limit: int
    offset: int


def _user_response(user: UserAccount) -> UserResponse:
    return UserResponse(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        email=user.email,
        role=UserRole(user.role),
        is_blocked=user.is_blocked,
        blocked_at=user.blocked_at,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


def _password_errors(password: str, policy: SecurityPolicy) -> list[str]:
    errors: list[str] = []
    if len(password) < policy.password_min_length:
        errors.append(f"minimum length is {policy.password_min_length}")
    if policy.require_uppercase and not any(char.isupper() for char in password):
        errors.append("uppercase letter is required")
    if policy.require_lowercase and not any(char.islower() for char in password):
        errors.append("lowercase letter is required")
    if policy.require_digit and not any(char.isdigit() for char in password):
        errors.append("digit is required")
    if policy.require_special and not any(not char.isalnum() for char in password):
        errors.append("special character is required")
    return errors


async def _get_user_or_audit_not_found(
    session: AsyncSession, request: Request, user_id: uuid.UUID, action: str
) -> UserAccount:
    user = await session.get(UserAccount, user_id)
    if user is not None:
        return user
    add_audit_event(
        session,
        request,
        action=action,
        target_type="user_account",
        target_id=str(user_id),
        result="FAILURE",
        details={"reason": "not_found"},
    )
    await session.commit()
    raise HTTPException(status_code=404, detail="User not found")


@router.get("", response_model=UserPage)
async def list_users(
    search: str | None = Query(default=None, min_length=1, max_length=100),
    role: UserRole | None = None,
    is_blocked: bool | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_admin_write_session),
) -> UserPage:
    filters = []
    if search:
        pattern = f"%{search.strip().lower()}%"
        filters.append(
            or_(
                UserAccount.normalized_username.like(pattern),
                func.lower(UserAccount.display_name).like(pattern),
                UserAccount.normalized_email.like(pattern),
            )
        )
    if role is not None:
        filters.append(UserAccount.role == role.value)
    if is_blocked is not None:
        filters.append(UserAccount.is_blocked.is_(is_blocked))

    total = await session.scalar(
        select(func.count()).select_from(UserAccount).where(*filters)
    )
    users = (
        await session.scalars(
            select(UserAccount)
            .where(*filters)
            .order_by(UserAccount.created_at.desc(), UserAccount.username)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return UserPage(
        items=[_user_response(user) for user in users],
        total=int(total or 0),
        limit=limit,
        offset=offset,
    )


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_admin_write_session),
) -> UserResponse:
    user = await session.get(UserAccount, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_response(user)


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    request: Request,
    session: AsyncSession = Depends(get_admin_write_session),
) -> UserResponse:
    actor_id = actor_id_from_request(request)
    normalized_username = payload.username.lower()
    normalized_email = payload.email.lower() if payload.email else None
    try:
        async with session.begin():
            policy = await session.get(SecurityPolicy, 1)
            if policy is None:
                policy = SecurityPolicy(
                    id=1,
                    password_min_length=12,
                    require_uppercase=True,
                    require_lowercase=True,
                    require_digit=True,
                    require_special=True,
                )
                session.add(policy)
            errors = _password_errors(payload.password, policy)
            if errors:
                add_audit_event(
                    session,
                    request,
                    action="USER_CREATE",
                    target_type="user_account",
                    result="FAILURE",
                    details={"reason": "password_policy", "violations": errors},
                )
                failure = "; ".join(errors)
                user = None
            else:
                user = UserAccount(
                    username=payload.username,
                    normalized_username=normalized_username,
                    display_name=payload.display_name,
                    email=payload.email,
                    normalized_email=normalized_email,
                    password_hash=hash_password(payload.password),
                    role=payload.role.value,
                    created_by=actor_id,
                    updated_by=actor_id,
                )
                session.add(user)
                await session.flush()
                add_audit_event(
                    session,
                    request,
                    action="USER_CREATE",
                    target_type="user_account",
                    target_id=str(user.id),
                    details={"username": user.username, "role": user.role},
                )
                failure = None
    except IntegrityError as exc:
        await session.rollback()
        async with session.begin():
            add_audit_event(
                session,
                request,
                action="USER_CREATE",
                target_type="user_account",
                result="FAILURE",
                details={"reason": "duplicate_username_or_email"},
            )
        raise HTTPException(
            status_code=409, detail="Username or email already exists"
        ) from exc
    if failure:
        raise HTTPException(status_code=422, detail=f"Password policy: {failure}")
    assert user is not None
    return _user_response(user)


@router.patch("/{user_id}/role", response_model=UserResponse)
async def change_user_role(
    user_id: uuid.UUID,
    payload: RoleChange,
    request: Request,
    session: AsyncSession = Depends(get_admin_write_session),
) -> UserResponse:
    user = await _get_user_or_audit_not_found(session, request, user_id, "USER_ROLE_CHANGE")
    previous_role = user.role
    user.role = payload.role.value
    user.updated_by = actor_id_from_request(request)
    add_audit_event(
        session,
        request,
        action="USER_ROLE_CHANGE",
        target_type="user_account",
        target_id=str(user.id),
        details={"old_role": previous_role, "new_role": user.role},
    )
    await session.commit()
    await session.refresh(user)
    return _user_response(user)


@router.patch("/{user_id}/block", response_model=UserResponse)
async def change_user_block_status(
    user_id: uuid.UUID,
    payload: BlockChange,
    request: Request,
    session: AsyncSession = Depends(get_admin_write_session),
) -> UserResponse:
    user = await _get_user_or_audit_not_found(session, request, user_id, "USER_BLOCK_CHANGE")
    previous_status = user.is_blocked
    user.is_blocked = payload.blocked
    user.blocked_at = datetime.now(timezone.utc) if payload.blocked else None
    user.updated_by = actor_id_from_request(request)
    add_audit_event(
        session,
        request,
        action="USER_BLOCK" if payload.blocked else "USER_UNBLOCK",
        target_type="user_account",
        target_id=str(user.id),
        details={
            "old_blocked": previous_status,
            "new_blocked": payload.blocked,
            "reason": payload.reason,
        },
    )
    await session.commit()
    await session.refresh(user)
    return _user_response(user)
