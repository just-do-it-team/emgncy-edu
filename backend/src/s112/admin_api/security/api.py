from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from s112.admin_api.audit import actor_id_from_request, add_audit_event
from s112.admin_api.clients import UpstreamError
from s112.admin_api.dependencies import get_admin_write_session
from s112.domain.models import SecurityPolicy


router = APIRouter(prefix="/security", tags=["security"])


class PolicyResponse(BaseModel):
    password_min_length: int
    require_uppercase: bool
    require_lowercase: bool
    require_digit: bool
    require_special: bool
    updated_at: datetime
    updated_by: str | None


class PolicyUpdate(BaseModel):
    password_min_length: int | None = Field(default=None, ge=8, le=128)
    require_uppercase: bool | None = None
    require_lowercase: bool | None = None
    require_digit: bool | None = None
    require_special: bool | None = None

    @model_validator(mode="after")
    def require_changes(self) -> "PolicyUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one policy field is required")
        return self


class SecurityControl(BaseModel):
    key: str
    title: str
    status: Literal["enabled", "warning", "not_configured"]
    description: str


class SecurityOverview(BaseModel):
    status: Literal["warning"] = "warning"
    controls: list[SecurityControl]


class IntegrityCheck(BaseModel):
    key: str
    status: Literal["healthy", "degraded", "unavailable"]
    details: str


class IntegrityReport(BaseModel):
    generated_at: datetime
    status: Literal["healthy", "degraded", "unavailable"]
    checks: list[IntegrityCheck]


def _policy_response(policy: SecurityPolicy) -> PolicyResponse:
    return PolicyResponse(
        password_min_length=policy.password_min_length,
        require_uppercase=policy.require_uppercase,
        require_lowercase=policy.require_lowercase,
        require_digit=policy.require_digit,
        require_special=policy.require_special,
        updated_at=policy.updated_at,
        updated_by=str(policy.updated_by) if policy.updated_by else None,
    )


async def _policy(session: AsyncSession) -> SecurityPolicy:
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
        await session.commit()
        await session.refresh(policy)
    return policy


@router.get("/overview", response_model=SecurityOverview)
async def security_overview() -> SecurityOverview:
    return SecurityOverview(
        controls=[
            SecurityControl(
                key="password-policy",
                title="Парольная политика",
                status="enabled",
                description="Применяется при создании локальной учётной записи.",
            ),
            SecurityControl(
                key="audit",
                title="Аудит административных действий",
                status="enabled",
                description="Изменения и отклонённые опасные операции сохраняются в БД.",
            ),
            SecurityControl(
                key="authentication",
                title="Аутентификация Admin API",
                status="not_configured",
                description="Должна быть обеспечена административным шлюзом до публикации API.",
            ),
            SecurityControl(
                key="internal-transport",
                title="Шифрование внутреннего трафика",
                status="warning",
                description="Kafka демонстрационного стенда использует plaintext без TLS/SASL.",
            ),
            SecurityControl(
                key="dangerous-operations",
                title="Защита демонстрационного стенда",
                status="enabled",
                description="Управление сервисами, копиями и обновлениями отключено.",
            ),
        ]
    )


@router.get("/policy", response_model=PolicyResponse)
async def get_security_policy(
    session: AsyncSession = Depends(get_admin_write_session),
) -> PolicyResponse:
    return _policy_response(await _policy(session))


@router.patch("/policy", response_model=PolicyResponse)
async def update_security_policy(
    payload: PolicyUpdate,
    request: Request,
    session: AsyncSession = Depends(get_admin_write_session),
) -> PolicyResponse:
    policy = await _policy(session)
    changes = payload.model_dump(exclude_unset=True)
    old_values = {key: getattr(policy, key) for key in changes}
    for key, value in changes.items():
        setattr(policy, key, value)
    policy.updated_by = actor_id_from_request(request)
    add_audit_event(
        session,
        request,
        action="SECURITY_POLICY_UPDATE",
        target_type="security_policy",
        target_id="1",
        details={"old": old_values, "new": changes},
    )
    await session.commit()
    await session.refresh(policy)
    return _policy_response(policy)


@router.get("/integrity", response_model=IntegrityReport)
async def integrity_report(
    request: Request,
    session: AsyncSession = Depends(get_admin_write_session),
) -> IntegrityReport:
    checks: list[IntegrityCheck] = []
    try:
        await session.execute(text("SELECT 1"))
        checks.append(
            IntegrityCheck(
                key="database", status="healthy", details="Основная БД отвечает."
            )
        )
    except Exception:
        checks.append(
            IntegrityCheck(
                key="database", status="unavailable", details="Основная БД недоступна."
            )
        )

    try:
        payload = await request.app.state.observability.prometheus_targets()
        targets = payload.get("data", {}).get("activeTargets", [])
        required = [
            item
            for item in targets
            if str(item.get("labels", {}).get("optional", "false")).lower() != "true"
        ]
        down = [item for item in required if item.get("health") != "up"]
        checks.append(
            IntegrityCheck(
                key="components",
                status="healthy" if required and not down else "degraded",
                details=f"Доступно {len(required) - len(down)} из {len(required)} обязательных целей.",
            )
        )
    except UpstreamError:
        checks.append(
            IntegrityCheck(
                key="components",
                status="unavailable",
                details="Prometheus недоступен, состояние компонентов неизвестно.",
            )
        )

    if any(item.status == "unavailable" for item in checks):
        overall: Literal["healthy", "degraded", "unavailable"] = "unavailable"
    elif any(item.status == "degraded" for item in checks):
        overall = "degraded"
    else:
        overall = "healthy"
    return IntegrityReport(
        generated_at=datetime.now(timezone.utc), status=overall, checks=checks
    )
