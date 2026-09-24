from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from s112.api.schemas import (
    CardCreate,
    CardFeatureInput,
    CardFeatureUpdate,
    CardServiceCreate,
    CardStatusCreate,
    CardUpdate,
    ServiceStatusCreate,
)
from s112.common.enums import (
    CardStatus,
    NotificationMethod,
    ServiceAddedReason,
    ServiceResponseStatus,
    TrainingActionResult,
    WorkspaceMemberRole,
    WorkspaceStatus,
)
from s112.domain.models import (
    CardFeature,
    CardFeatureHistory,
    CardEventTypeHistory,
    CardListProjection,
    CardService,
    CardServiceDispatch,
    CardStatusHistory,
    EmergencyService,
    EventKind,
    EventType,
    FirstOrderFeature,
    IncidentCard,
    OutboxEvent,
    SecondOrderFeature,
    ServiceRoutingRule,
    ServiceStatusHistory,
    SimulationWorkspace,
    ThirdOrderFeature,
    TrainingAction,
    UserAccount,
    WorkspaceMember,
)
from s112.domain.rules import (
    validate_service_status_comment,
    validate_service_status_transition,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


CARD_OPEN_DEADLINE_SECONDS = 30
CARD_DECISION_DEADLINE_SECONDS = 180


class DomainError(Exception):
    pass


class NotFoundError(DomainError):
    pass


class ConflictError(DomainError):
    pass


class ValidationError(DomainError):
    pass


class CardApplicationService:
    def __init__(self, topic: str) -> None:
        self.topic = topic

    async def create_card(
        self,
        session: AsyncSession,
        request: CardCreate,
        *,
        allow_system_actor: bool = False,
        action_type: str = "CARD_CREATED",
    ) -> IncidentCard:
        await self._assert_workspace_access(
            session,
            request.workspace_id,
            request.operator_id,
            allow_system_actor=allow_system_actor,
            allowed_roles={
                WorkspaceMemberRole.INSTRUCTOR.value,
                WorkspaceMemberRole.PARTICIPANT.value,
            },
        )
        event_type = await session.get(EventType, request.event_type_id)
        if event_type is None or not event_type.is_active:
            raise ValidationError("Unknown or inactive event_type_id")

        if request.features is not None:
            await self._validate_features(session, request.event_type_id, request.features)

        if request.parent_card_id is not None:
            parent = await session.get(IncidentCard, request.parent_card_id)
            if parent is None or parent.workspace_id != request.workspace_id:
                raise ValidationError("Parent card must belong to the same workspace")

        card = IncidentCard(
            workspace_id=request.workspace_id,
            card_number=request.card_number or self._new_card_number(),
            source_type=request.source_type.value,
            source_system_id=request.source_system_id,
            external_card_id=request.external_card_id,
            parent_card_id=request.parent_card_id,
            event_type_id=request.event_type_id,
            description=request.description,
            questionnaire=(
                request.questionnaire.model_dump()
                if request.questionnaire is not None
                else None
            ),
            reported_address=request.reported_address,
            incident_address=request.incident_address,
            latitude=request.latitude,
            longitude=request.longitude,
            victims_count=request.victims_count,
            operator_id=request.operator_id,
            current_status=CardStatus.REGISTERED.value,
            version=1,
        )
        session.add(card)
        await session.flush()

        session.add(
            CardStatusHistory(
                card_id=card.id,
                status_code=CardStatus.REGISTERED.value,
                set_by=request.operator_id,
            )
        )
        session.add(
            CardEventTypeHistory(
                card_id=card.id,
                event_type_id=card.event_type_id,
                changed_by=request.operator_id,
                reason="Initial classification",
            )
        )

        feature_model: CardFeature | None = None
        if request.features is not None:
            feature_model = self._make_feature(
                card,
                request.features,
                request.operator_id,
            )
            session.add(feature_model)
            session.add(self._feature_history(feature_model, request.operator_id))
            await session.flush()
            await self._sync_automatic_services(
                session,
                card,
                feature_model,
            )

        projection = CardListProjection(
            card_id=card.id,
            workspace_id=card.workspace_id,
            card_number=card.card_number,
            event_type_id=card.event_type_id,
            event_kind_id=feature_model.event_kind_id if feature_model else None,
            incident_address=card.incident_address,
            victims_count=card.victims_count,
            current_status=card.current_status,
            services_summary=[],
            features_summary=self._features_summary(feature_model),
            registered_at=card.registered_at,
            last_updated_at=utcnow(),
            version=card.version,
        )
        session.add(projection)
        await session.flush()
        await self._refresh_projection(session, card, feature=feature_model)
        self._add_outbox(
            session,
            card,
            "card.created",
            {
                "card_number": card.card_number,
                "event_type_id": card.event_type_id,
                "current_status": card.current_status,
            },
        )
        await self._record_training_action(
            session,
            card,
            actor_id=request.operator_id,
            action_type=action_type,
            request_id=request.request_id,
            after_state=self._card_core_state(card),
        )
        await session.flush()
        return card

    async def update_card(
        self, session: AsyncSession, card_id: uuid.UUID, request: CardUpdate
    ) -> IncidentCard:
        card = await self._lock_card(session, card_id, request.expected_version)
        await self._assert_workspace_access(
            session, card.workspace_id, request.actor_id, card_id=card.id
        )
        before_state = self._card_core_state(card)
        values = request.model_dump(
            exclude={"expected_version", "actor_id", "request_id"}, exclude_unset=True
        )
        for field, value in values.items():
            setattr(card, field, value)
        card.version += 1
        await self._refresh_projection(session, card)
        self._add_outbox(session, card, "card.updated", {"changed_fields": sorted(values)})
        await self._record_training_action(
            session,
            card,
            actor_id=request.actor_id,
            action_type="CARD_UPDATED",
            request_id=request.request_id,
            before_state=before_state,
            after_state=self._card_core_state(card),
            details={"changed_fields": sorted(values)},
        )
        await session.flush()
        return card

    async def update_features(
        self, session: AsyncSession, card_id: uuid.UUID, request: CardFeatureUpdate
    ) -> CardFeature:
        card = await self._lock_card(session, card_id, request.expected_card_version)
        await self._assert_workspace_access(
            session, card.workspace_id, request.actor_id, card_id=card.id
        )
        existing_feature = await session.get(CardFeature, card.id)
        before_state = self._features_summary(existing_feature)
        await self._validate_features(session, card.event_type_id, request)

        feature = existing_feature
        if feature is None:
            feature = self._make_feature(card, request, request.actor_id)
            session.add(feature)
        else:
            feature.event_kind_id = request.event_kind_id
            feature.first_order_feature_id = request.first_order_feature_id
            feature.second_order_feature_id = request.second_order_feature_id
            feature.third_order_feature_id = request.third_order_feature_id
            feature.additional_features = request.additional_features
            feature.updated_by = request.actor_id
            feature.updated_at = utcnow()
            feature.revision += 1

        card.version += 1
        await session.flush()
        session.add(self._feature_history(feature, request.actor_id))
        await self._sync_automatic_services(session, card, feature)
        await self._refresh_projection(session, card, feature=feature)
        self._add_outbox(
            session,
            card,
            "card.features.updated",
            {
                "event_kind_id": feature.event_kind_id,
                "first_order_feature_id": feature.first_order_feature_id,
                "second_order_feature_id": feature.second_order_feature_id,
                "third_order_feature_id": feature.third_order_feature_id,
                "incident_type_id": (
                    str(feature.incident_type_id) if feature.incident_type_id else None
                ),
                "feature_revision": feature.revision,
            },
        )
        await self._record_training_action(
            session,
            card,
            actor_id=request.actor_id,
            action_type="CARD_FEATURES_UPDATED",
            request_id=request.request_id,
            before_state=before_state,
            after_state=self._features_summary(feature),
        )
        await session.flush()
        return feature

    async def set_card_status(
        self, session: AsyncSession, card_id: uuid.UUID, request: CardStatusCreate
    ) -> IncidentCard:
        card = await self._lock_card(session, card_id, request.expected_card_version)
        await self._assert_workspace_access(
            session, card.workspace_id, request.actor_id, card_id=card.id
        )
        previous_status = card.current_status
        now = utcnow()
        await session.execute(
            update(CardStatusHistory)
            .where(
                CardStatusHistory.card_id == card.id,
                CardStatusHistory.cleared_at.is_(None),
            )
            .values(cleared_at=now)
        )
        card.current_status = request.status.value
        card.version += 1
        if request.status is CardStatus.PROCESSED:
            card.processed_at = now
        elif request.status is CardStatus.CHECKED:
            card.checked_at = now
        elif request.status is CardStatus.COMPLETED:
            card.closed_at = now

        session.add(
            CardStatusHistory(
                card_id=card.id,
                status_code=request.status.value,
                reason=request.reason,
                set_by=request.actor_id,
                set_at=now,
            )
        )
        await self._refresh_projection(session, card)
        self._add_outbox(
            session,
            card,
            "card.status.changed",
            {"status": request.status.value, "reason": request.reason},
        )
        await self._record_training_action(
            session,
            card,
            actor_id=request.actor_id,
            action_type="CARD_STATUS_CHANGED",
            request_id=request.request_id,
            before_state={"current_status": previous_status},
            after_state={"current_status": card.current_status},
            details={"reason": request.reason},
        )
        await session.flush()
        return card

    async def add_service(
        self, session: AsyncSession, card_id: uuid.UUID, request: CardServiceCreate
    ) -> CardService:
        card = await self._lock_card(session, card_id, request.expected_card_version)
        await self._assert_workspace_access(
            session, card.workspace_id, request.actor_id, card_id=card.id
        )
        service = await session.get(EmergencyService, request.service_id)
        if service is None or not service.is_active:
            raise ValidationError("Unknown or inactive service_id")

        existing = await session.scalar(
            select(CardService).where(
                CardService.card_id == card.id,
                CardService.service_id == request.service_id,
            )
        )
        if existing is not None and existing.is_active:
            raise ConflictError("Service is already added to this card")

        sent_at = utcnow()
        added_at = utcnow()
        if existing is None:
            card_service = CardService(card_id=card.id, service_id=request.service_id)
            session.add(card_service)
        else:
            card_service = existing
        card_service.added_reason = ServiceAddedReason.MANUAL.value
        card_service.notification_method = service.notification_method
        card_service.is_visible = True
        card_service.is_active = True
        card_service.current_status = ServiceResponseStatus.ADDED.value
        card_service.added_at = added_at
        card_service.sent_at = sent_at
        card_service.acceptance_deadline_at = sent_at + timedelta(
            seconds=CARD_OPEN_DEADLINE_SECONDS
        )
        card_service.received_at = None
        card_service.decision_deadline_at = None
        card_service.decided_at = None
        card_service.open_deadline_missed_at = None
        card_service.decision_deadline_missed_at = None
        card_service.closed_at = None
        card_service.removed_at = None
        card.version += 1
        await session.flush()
        session.add(
            ServiceStatusHistory(
                card_service_id=card_service.id,
                status_code=ServiceResponseStatus.ADDED.value,
                occurred_at=added_at,
            )
        )
        await self._refresh_projection(session, card)
        self._add_outbox(
            session,
            card,
            "card.service.added",
            {
                "card_service_id": str(card_service.id),
                "service_id": str(card_service.service_id),
                "acceptance_deadline_at": card_service.acceptance_deadline_at.isoformat(),
            },
        )
        await self._record_training_action(
            session,
            card,
            actor_id=request.actor_id,
            action_type="CARD_SERVICE_ADDED",
            request_id=request.request_id,
            after_state={
                "card_service_id": str(card_service.id),
                "service_id": str(card_service.service_id),
                "status": card_service.current_status,
            },
        )
        await session.flush()
        return card_service

    async def add_service_status(
        self,
        session: AsyncSession,
        card_service_id: uuid.UUID,
        request: ServiceStatusCreate,
    ) -> ServiceStatusHistory:
        card_service = await session.scalar(
            select(CardService)
            .where(CardService.id == card_service_id)
            .with_for_update()
        )
        if card_service is None:
            raise NotFoundError("Card service not found")

        card = await self._lock_card(
            session, card_service.card_id, request.expected_card_version
        )
        workspace = await self._assert_workspace_access(
            session, card.workspace_id, request.author_id, card_id=card.id
        )
        previous_status = card_service.current_status
        try:
            validate_service_status_transition(card_service.current_status, request.status)
            validate_service_status_comment(request.status, request.comment)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

        service = await session.get(EmergencyService, card_service.service_id)
        if workspace.training_session_id is not None:
            member = await session.get(
                WorkspaceMember, (workspace.id, request.author_id)
            )
            if (
                member is not None
                and member.member_role == WorkspaceMemberRole.PARTICIPANT.value
                and member.position_code is not None
                and (service is None or service.code != member.position_code)
            ):
                raise ValidationError(
                    "DDS participants may update response statuses only for their own service"
                )
        if service and service.code == "103" and request.status in {
            ServiceResponseStatus.REJECTED,
            ServiceResponseStatus.WORK_REFUSED,
        }:
            raise ValidationError(
                "Service 103 uses WORK_COMPLETED with the no-brigade result instead"
            )

        if request.external_event_id and request.source_system_id:
            duplicate = await session.scalar(
                select(ServiceStatusHistory.id).where(
                    ServiceStatusHistory.source_system_id == request.source_system_id,
                    ServiceStatusHistory.external_event_id == request.external_event_id,
                )
            )
            if duplicate is not None:
                raise ConflictError("External event has already been processed")

        history = ServiceStatusHistory(
            card_service_id=card_service.id,
            status_code=request.status.value,
            occurred_at=request.occurred_at,
            author_id=request.author_id,
            source_system_id=request.source_system_id,
            comment=request.comment,
            external_event_id=request.external_event_id,
        )
        session.add(history)
        card_service.current_status = request.status.value
        if request.status is ServiceResponseStatus.RECEIVED:
            card_service.received_at = request.occurred_at
            card_service.decision_deadline_at = request.occurred_at + timedelta(
                seconds=CARD_DECISION_DEADLINE_SECONDS
            )
        if request.status in {
            ServiceResponseStatus.ACCEPTED,
            ServiceResponseStatus.REJECTED,
        }:
            card_service.decided_at = request.occurred_at
            if (
                card_service.decision_deadline_at is not None
                and as_utc(request.occurred_at)
                > as_utc(card_service.decision_deadline_at)
                and card_service.decision_deadline_missed_at is None
            ):
                card_service.decision_deadline_missed_at = (
                    card_service.decision_deadline_at
                )
        if request.status in {
            ServiceResponseStatus.WORK_COMPLETED,
            ServiceResponseStatus.WORK_REFUSED,
        }:
            card_service.closed_at = request.occurred_at

        card.version += 1
        await session.flush()
        await self._refresh_projection(session, card)
        self._add_outbox(
            session,
            card,
            "card.service.status.changed",
            {
                "card_service_id": str(card_service.id),
                "service_id": str(card_service.service_id),
                "status": request.status.value,
                "occurred_at": request.occurred_at.isoformat(),
            },
        )
        await self._record_training_action(
            session,
            card,
            actor_id=request.author_id,
            action_type="SERVICE_STATUS_CHANGED",
            request_id=request.request_id,
            entity_type="card_service",
            entity_id=str(card_service.id),
            before_state={"status": previous_status},
            after_state={"status": card_service.current_status},
            details={
                "service_id": str(card_service.service_id),
                "status": request.status.value,
                "comment": request.comment,
            },
        )
        await session.flush()
        return history

    async def open_card_for_operator(
        self,
        session: AsyncSession,
        workspace_id: uuid.UUID,
        card_id: uuid.UUID,
        actor_id: uuid.UUID,
    ) -> CardService:
        card, card_service = await self._operator_card_service(
            session, workspace_id, card_id, actor_id
        )
        if card_service.received_at is not None:
            return card_service
        if card_service.current_status == ServiceResponseStatus.ADDED.value:
            deadline = card_service.acceptance_deadline_at
            if deadline is not None and utcnow() > as_utc(deadline):
                card.version += 1
                await self._mark_open_deadline_missed(
                    session, card, card_service, as_utc(deadline)
                )
        if card_service.current_status not in {
            ServiceResponseStatus.ADDED.value,
            ServiceResponseStatus.NOT_NOTIFIED.value,
        }:
            raise ConflictError(
                f"Card service cannot be opened from status {card_service.current_status}"
            )

        now = utcnow()
        previous_status = card_service.current_status
        card_service.current_status = ServiceResponseStatus.RECEIVED.value
        card_service.received_at = now
        card_service.decision_deadline_at = now + timedelta(
            seconds=CARD_DECISION_DEADLINE_SECONDS
        )
        session.add(
            ServiceStatusHistory(
                card_service_id=card_service.id,
                status_code=ServiceResponseStatus.RECEIVED.value,
                occurred_at=now,
                author_id=actor_id,
            )
        )
        card.version += 1
        await self._refresh_projection(session, card)
        self._add_outbox(
            session,
            card,
            "card.service.opened",
            {
                "card_service_id": str(card_service.id),
                "service_id": str(card_service.service_id),
                "decision_deadline_at": card_service.decision_deadline_at.isoformat(),
            },
        )
        await self._record_training_action(
            session,
            card,
            actor_id=actor_id,
            action_type="CARD_OPENED",
            request_id=f"card-open:{card_service.id}",
            entity_type="card_service",
            entity_id=str(card_service.id),
            before_state={"status": previous_status},
            after_state={"status": card_service.current_status},
            details={
                "service_id": str(card_service.service_id),
                "opened_on_time": card_service.open_deadline_missed_at is None,
            },
        )
        await session.flush()
        return card_service

    async def decide_card_for_operator(
        self,
        session: AsyncSession,
        workspace_id: uuid.UUID,
        card_id: uuid.UUID,
        actor_id: uuid.UUID,
        decision: ServiceResponseStatus,
        *,
        comment: str | None,
        request_id: str | None,
    ) -> CardService:
        card, card_service = await self._operator_card_service(
            session, workspace_id, card_id, actor_id
        )
        if card_service.current_status == decision.value:
            return card_service
        if card_service.received_at is None:
            raise ConflictError("Card must be opened before a decision is made")
        try:
            validate_service_status_transition(card_service.current_status, decision)
            validate_service_status_comment(decision, comment)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

        now = utcnow()
        if (
            card_service.decision_deadline_at is not None
            and now > as_utc(card_service.decision_deadline_at)
            and card_service.decision_deadline_missed_at is None
        ):
            card.version += 1
            await self._mark_decision_deadline_missed(
                session,
                card,
                card_service,
                as_utc(card_service.decision_deadline_at),
            )

        previous_status = card_service.current_status
        card_service.current_status = decision.value
        card_service.decided_at = now
        session.add(
            ServiceStatusHistory(
                card_service_id=card_service.id,
                status_code=decision.value,
                occurred_at=now,
                author_id=actor_id,
                comment=comment,
            )
        )
        card.version += 1
        await self._refresh_projection(session, card)
        self._add_outbox(
            session,
            card,
            "card.service.decision",
            {
                "card_service_id": str(card_service.id),
                "service_id": str(card_service.service_id),
                "decision": decision.value,
                "comment": comment,
            },
        )
        await self._record_training_action(
            session,
            card,
            actor_id=actor_id,
            action_type=(
                "CARD_ACCEPTED"
                if decision is ServiceResponseStatus.ACCEPTED
                else "CARD_REJECTED"
            ),
            request_id=request_id
            or f"card-decision:{card_service.id}:{decision.value}",
            entity_type="card_service",
            entity_id=str(card_service.id),
            before_state={"status": previous_status},
            after_state={"status": card_service.current_status},
            details={
                "service_id": str(card_service.service_id),
                "decision": decision.value,
                "comment": comment,
                "decided_on_time": card_service.decision_deadline_missed_at is None,
            },
        )
        await session.flush()
        return card_service

    async def process_service_deadlines(
        self,
        session: AsyncSession,
        now: datetime,
        *,
        batch_size: int = 100,
    ) -> int:
        processed = 0
        open_ids = list(
            await session.scalars(
                select(CardService.id)
                .where(
                    CardService.is_active.is_(True),
                    CardService.current_status == ServiceResponseStatus.ADDED.value,
                    CardService.acceptance_deadline_at.is_not(None),
                    CardService.acceptance_deadline_at <= now,
                    CardService.open_deadline_missed_at.is_(None),
                )
                .order_by(CardService.acceptance_deadline_at, CardService.id)
                .limit(batch_size)
            )
        )
        for card_service_id in open_ids:
            card_service = await session.scalar(
                select(CardService)
                .where(CardService.id == card_service_id)
                .with_for_update()
            )
            if (
                card_service is None
                or card_service.current_status != ServiceResponseStatus.ADDED.value
                or card_service.open_deadline_missed_at is not None
                or card_service.acceptance_deadline_at is None
            ):
                continue
            card = await session.get(IncidentCard, card_service.card_id)
            if card is None:
                continue
            card.version += 1
            await self._mark_open_deadline_missed(
                session,
                card,
                card_service,
                as_utc(card_service.acceptance_deadline_at),
            )
            await self._refresh_projection(session, card)
            processed += 1

        remaining = max(0, batch_size - processed)
        decision_ids = list(
            await session.scalars(
                select(CardService.id)
                .where(
                    CardService.is_active.is_(True),
                    CardService.current_status == ServiceResponseStatus.RECEIVED.value,
                    CardService.decision_deadline_at.is_not(None),
                    CardService.decision_deadline_at <= now,
                    CardService.decision_deadline_missed_at.is_(None),
                )
                .order_by(CardService.decision_deadline_at, CardService.id)
                .limit(remaining)
            )
        )
        for card_service_id in decision_ids:
            card_service = await session.scalar(
                select(CardService)
                .where(CardService.id == card_service_id)
                .with_for_update()
            )
            if (
                card_service is None
                or card_service.current_status != ServiceResponseStatus.RECEIVED.value
                or card_service.decision_deadline_missed_at is not None
                or card_service.decision_deadline_at is None
            ):
                continue
            card = await session.get(IncidentCard, card_service.card_id)
            if card is None:
                continue
            card.version += 1
            await self._mark_decision_deadline_missed(
                session,
                card,
                card_service,
                as_utc(card_service.decision_deadline_at),
            )
            await self._refresh_projection(session, card)
            processed += 1
        await session.flush()
        return processed

    async def _operator_card_service(
        self,
        session: AsyncSession,
        workspace_id: uuid.UUID,
        card_id: uuid.UUID,
        actor_id: uuid.UUID,
    ) -> tuple[IncidentCard, CardService]:
        workspace = await self._assert_workspace_access(
            session,
            workspace_id,
            actor_id,
            allowed_roles={WorkspaceMemberRole.PARTICIPANT.value},
        )
        if workspace.status != WorkspaceStatus.ACTIVE.value:
            raise ConflictError("Training workspace is not active")
        member = await session.get(WorkspaceMember, (workspace_id, actor_id))
        if member is None or not member.position_code:
            raise ValidationError("Participant service position is not assigned")
        card = await session.scalar(
            select(IncidentCard)
            .where(
                IncidentCard.id == card_id,
                IncidentCard.workspace_id == workspace_id,
            )
            .with_for_update()
        )
        if card is None:
            raise NotFoundError("Card not found in this workspace")
        card_service = await session.scalar(
            select(CardService)
            .join(EmergencyService, EmergencyService.id == CardService.service_id)
            .where(
                CardService.card_id == card.id,
                CardService.is_active.is_(True),
                EmergencyService.code == member.position_code,
                EmergencyService.is_active.is_(True),
            )
            .with_for_update()
        )
        if card_service is None:
            raise ValidationError("Card is not routed to the participant service")
        return card, card_service

    async def _mark_open_deadline_missed(
        self,
        session: AsyncSession,
        card: IncidentCard,
        card_service: CardService,
        missed_at: datetime,
    ) -> None:
        card_service.current_status = ServiceResponseStatus.NOT_NOTIFIED.value
        card_service.open_deadline_missed_at = missed_at
        session.add(
            ServiceStatusHistory(
                card_service_id=card_service.id,
                status_code=ServiceResponseStatus.NOT_NOTIFIED.value,
                occurred_at=missed_at,
                comment="Card was not opened before the notification deadline",
            )
        )
        self._add_outbox(
            session,
            card,
            "card.service.open-deadline-missed",
            {
                "card_service_id": str(card_service.id),
                "service_id": str(card_service.service_id),
                "deadline_at": missed_at.isoformat(),
            },
        )
        await self._record_training_action(
            session,
            card,
            actor_id=None,
            action_type="CARD_OPEN_DEADLINE_MISSED",
            request_id=f"card-open-deadline:{card_service.id}",
            entity_type="card_service",
            entity_id=str(card_service.id),
            after_state={"status": card_service.current_status},
            details={
                "service_id": str(card_service.service_id),
                "deadline_at": missed_at.isoformat(),
            },
        )

    async def _mark_decision_deadline_missed(
        self,
        session: AsyncSession,
        card: IncidentCard,
        card_service: CardService,
        missed_at: datetime,
    ) -> None:
        card_service.decision_deadline_missed_at = missed_at
        self._add_outbox(
            session,
            card,
            "card.service.decision-deadline-missed",
            {
                "card_service_id": str(card_service.id),
                "service_id": str(card_service.service_id),
                "deadline_at": missed_at.isoformat(),
            },
        )
        await self._record_training_action(
            session,
            card,
            actor_id=None,
            action_type="CARD_DECISION_DEADLINE_MISSED",
            request_id=f"card-decision-deadline:{card_service.id}",
            entity_type="card_service",
            entity_id=str(card_service.id),
            details={
                "service_id": str(card_service.service_id),
                "deadline_at": missed_at.isoformat(),
            },
        )

    async def _lock_card(
        self, session: AsyncSession, card_id: uuid.UUID, expected_version: int
    ) -> IncidentCard:
        card = await session.scalar(
            select(IncidentCard).where(IncidentCard.id == card_id).with_for_update()
        )
        if card is None:
            raise NotFoundError("Card not found")
        if card.version != expected_version:
            raise ConflictError(
                f"Card version conflict: expected {expected_version}, actual {card.version}"
            )
        return card

    async def _sync_automatic_services(
        self,
        session: AsyncSession,
        card: IncidentCard,
        feature: CardFeature,
    ) -> None:
        rules = list(
            await session.scalars(
                select(ServiceRoutingRule)
                .where(
                    ServiceRoutingRule.event_kind_id == feature.event_kind_id,
                    ServiceRoutingRule.is_active.is_(True),
                )
                .order_by(ServiceRoutingRule.sort_order, ServiceRoutingRule.route_code)
            )
        )
        matched_rules = [
            rule
            for rule in rules
            if self._condition_matches(rule.condition, feature.additional_features)
        ]
        rules_by_service: dict[uuid.UUID, list[ServiceRoutingRule]] = {}
        for rule in matched_rules:
            rules_by_service.setdefault(rule.service_id, []).append(rule)

        existing_services = list(
            await session.scalars(
                select(CardService)
                .options(selectinload(CardService.dispatches))
                .where(CardService.card_id == card.id)
            )
        )
        services_by_id = {item.service_id: item for item in existing_services}
        now = utcnow()

        for item in existing_services:
            if (
                item.added_reason == ServiceAddedReason.EKP.value
                and item.service_id not in rules_by_service
                and item.is_active
            ):
                item.is_active = False
                item.removed_at = now
                for dispatch in item.dispatches:
                    dispatch.is_active = False

        for service_id, service_rules in rules_by_service.items():
            card_service = services_by_id.get(service_id)
            is_new_or_reactivated = card_service is None or not card_service.is_active
            if card_service is None:
                card_service = CardService(
                    card_id=card.id,
                    service_id=service_id,
                    added_reason=ServiceAddedReason.EKP.value,
                    added_at=now,
                    dispatches=[],
                )
                session.add(card_service)
                await session.flush()
                services_by_id[service_id] = card_service
            elif card_service.added_reason == ServiceAddedReason.EKP.value:
                card_service.added_at = now if is_new_or_reactivated else card_service.added_at

            methods = {rule.notification_method for rule in service_rules}
            card_service.notification_method = (
                next(iter(methods))
                if len(methods) == 1
                else NotificationMethod.COMBINED.value
            )
            card_service.is_active = True
            card_service.is_visible = True
            card_service.removed_at = None
            if is_new_or_reactivated:
                card_service.current_status = ServiceResponseStatus.ADDED.value
                card_service.sent_at = now
                card_service.acceptance_deadline_at = now + timedelta(
                    seconds=CARD_OPEN_DEADLINE_SECONDS
                )
                card_service.received_at = None
                card_service.decision_deadline_at = None
                card_service.decided_at = None
                card_service.open_deadline_missed_at = None
                card_service.decision_deadline_missed_at = None
                card_service.closed_at = None
                session.add(
                    ServiceStatusHistory(
                        card_service_id=card_service.id,
                        status_code=ServiceResponseStatus.ADDED.value,
                        occurred_at=now,
                    )
                )

            dispatches_by_code = {item.route_code: item for item in card_service.dispatches}
            active_route_codes = {rule.route_code for rule in service_rules}
            for dispatch in card_service.dispatches:
                if dispatch.route_code not in active_route_codes:
                    dispatch.is_active = False
            for rule in service_rules:
                dispatch = dispatches_by_code.get(rule.route_code)
                if dispatch is None:
                    dispatch = CardServiceDispatch(
                        card_service_id=card_service.id,
                        route_code=rule.route_code,
                    )
                    session.add(dispatch)
                dispatch.routing_rule_id = rule.id
                dispatch.notification_method = rule.notification_method
                dispatch.external_incident_type = rule.external_incident_type
                dispatch.payload = {}
                dispatch.is_active = True

    @classmethod
    def _condition_matches(cls, condition: dict[str, Any], values: dict[str, Any]) -> bool:
        if "$and" in condition:
            return all(cls._condition_matches(item, values) for item in condition["$and"])
        if "$or" in condition:
            return any(cls._condition_matches(item, values) for item in condition["$or"])
        for key, expected in condition.items():
            if isinstance(expected, dict) and "$exists" in expected:
                exists = key in values
                if exists != bool(expected["$exists"]):
                    return False
                if not exists:
                    continue
            if key not in values:
                return False
            actual = values[key]
            if isinstance(expected, dict):
                if "$eq" in expected and actual != expected["$eq"]:
                    return False
                if "$ne" in expected and actual == expected["$ne"]:
                    return False
                if "$in" in expected and actual not in expected["$in"]:
                    return False
                nested = {key: value for key, value in expected.items() if not key.startswith("$")}
                if nested and (
                    not isinstance(actual, dict) or not cls._condition_matches(nested, actual)
                ):
                    return False
            elif isinstance(expected, list):
                if actual not in expected:
                    return False
            elif actual != expected:
                return False
        return True

    async def _validate_features(
        self,
        session: AsyncSession,
        event_type_id: int,
        features: CardFeatureInput,
    ) -> None:
        event_kind = await session.get(EventKind, features.event_kind_id)
        if event_kind is None or not event_kind.is_active:
            raise ValidationError("Unknown or inactive event_kind_id")
        if event_kind.event_type_id != event_type_id:
            raise ValidationError("event_kind_id does not belong to card event_type_id")

        if features.first_order_feature_id is not None:
            first = await session.get(FirstOrderFeature, features.first_order_feature_id)
            if first is None or not first.is_active:
                raise ValidationError("Unknown or inactive first_order_feature_id")
            if first.event_kind_id != event_kind.id:
                raise ValidationError("First-order feature does not belong to event kind")

        if features.second_order_feature_id is not None:
            second = await session.get(SecondOrderFeature, features.second_order_feature_id)
            if second is None or not second.is_active:
                raise ValidationError("Unknown or inactive second_order_feature_id")
            if second.first_order_feature_id != features.first_order_feature_id:
                raise ValidationError("Second-order feature does not belong to first-order feature")

        if features.third_order_feature_id is not None:
            third = await session.get(ThirdOrderFeature, features.third_order_feature_id)
            if third is None or not third.is_active:
                raise ValidationError("Unknown or inactive third_order_feature_id")
            if third.second_order_feature_id != features.second_order_feature_id:
                raise ValidationError("Third-order feature does not belong to second-order feature")

    def _make_feature(
        self,
        card: IncidentCard,
        request: CardFeatureInput,
        actor_id: uuid.UUID | None,
    ) -> CardFeature:
        return CardFeature(
            card_id=card.id,
            event_type_id=card.event_type_id,
            event_kind_id=request.event_kind_id,
            first_order_feature_id=request.first_order_feature_id,
            second_order_feature_id=request.second_order_feature_id,
            third_order_feature_id=request.third_order_feature_id,
            incident_type_id=None,
            additional_features=request.additional_features,
            revision=1,
            updated_by=actor_id,
        )

    @staticmethod
    def _feature_history(
        feature: CardFeature, actor_id: uuid.UUID | None
    ) -> CardFeatureHistory:
        return CardFeatureHistory(
            card_id=feature.card_id,
            revision=feature.revision,
            event_type_id=feature.event_type_id,
            event_kind_id=feature.event_kind_id,
            first_order_feature_id=feature.first_order_feature_id,
            second_order_feature_id=feature.second_order_feature_id,
            third_order_feature_id=feature.third_order_feature_id,
            incident_type_id=feature.incident_type_id,
            additional_features=feature.additional_features,
            changed_by=actor_id,
        )

    async def _refresh_projection(
        self,
        session: AsyncSession,
        card: IncidentCard,
        *,
        feature: CardFeature | None = None,
    ) -> None:
        projection = await session.get(CardListProjection, card.id)
        if projection is None:
            raise NotFoundError("Card read projection not found")
        if feature is None:
            feature = await session.get(CardFeature, card.id)

        services = (
            await session.execute(
                select(CardService, EmergencyService)
                .join(EmergencyService, EmergencyService.id == CardService.service_id)
                .where(
                    CardService.card_id == card.id,
                    CardService.is_active.is_(True),
                )
                .order_by(EmergencyService.code)
            )
        ).all()

        projection.event_type_id = card.event_type_id
        projection.workspace_id = card.workspace_id
        projection.event_kind_id = feature.event_kind_id if feature else None
        projection.incident_address = card.incident_address
        projection.victims_count = card.victims_count
        projection.current_status = card.current_status
        projection.services_summary = [
            {
                "card_service_id": str(card_service.id),
                "service_id": str(service.id),
                "service_code": service.code,
                "status": card_service.current_status,
            }
            for card_service, service in services
        ]
        projection.features_summary = self._features_summary(feature)
        projection.last_updated_at = utcnow()
        projection.version = card.version

    @staticmethod
    def _features_summary(feature: CardFeature | None) -> dict[str, Any]:
        if feature is None:
            return {}
        return {
            "event_kind_id": feature.event_kind_id,
            "first_order_feature_id": feature.first_order_feature_id,
            "second_order_feature_id": feature.second_order_feature_id,
            "third_order_feature_id": feature.third_order_feature_id,
            "incident_type_id": str(feature.incident_type_id) if feature.incident_type_id else None,
            "additional_features": feature.additional_features,
            "revision": feature.revision,
        }

    def _add_outbox(
        self,
        session: AsyncSession,
        card: IncidentCard,
        event_type: str,
        data: dict[str, Any],
    ) -> None:
        event_id = uuid.uuid4()
        occurred_at = utcnow()
        session.add(
            OutboxEvent(
                id=event_id,
                aggregate_type="incident_card",
                aggregate_id=str(card.id),
                aggregate_version=card.version,
                event_type=event_type,
                topic=self.topic,
                message_key=str(card.id),
                payload={
                    "event_id": str(event_id),
                    "event_type": event_type,
                    "aggregate_type": "incident_card",
                    "aggregate_id": str(card.id),
                    "aggregate_version": card.version,
                    "workspace_id": str(card.workspace_id),
                    "occurred_at": occurred_at.isoformat(),
                    "data": {"workspace_id": str(card.workspace_id), **data},
                },
            )
        )

    async def _assert_workspace_access(
        self,
        session: AsyncSession,
        workspace_id: uuid.UUID,
        actor_id: uuid.UUID | None,
        *,
        allow_system_actor: bool = False,
        allowed_roles: set[str] | None = None,
        card_id: uuid.UUID | None = None,
    ) -> SimulationWorkspace:
        workspace = await session.get(SimulationWorkspace, workspace_id)
        if workspace is None:
            raise ValidationError("Unknown workspace_id")
        if workspace.training_session_id is None:
            return workspace
        if workspace.status != WorkspaceStatus.ACTIVE.value:
            raise ConflictError("Training workspace is not active")
        if actor_id is None:
            if allow_system_actor:
                return workspace
            raise ValidationError("actor_id is required in a training workspace")
        member = await session.get(WorkspaceMember, (workspace.id, actor_id))
        if member is None or member.left_at is not None:
            raise ValidationError("Actor is not a member of this workspace")
        if allowed_roles is not None and member.member_role not in allowed_roles:
            raise ValidationError("Actor role is not allowed for this workspace operation")
        if (
            card_id is not None
            and member.member_role == WorkspaceMemberRole.PARTICIPANT.value
            and member.position_code is not None
        ):
            notified = await session.scalar(
                select(CardService.id)
                .join(EmergencyService, EmergencyService.id == CardService.service_id)
                .where(
                    CardService.card_id == card_id,
                    CardService.is_active.is_(True),
                    EmergencyService.code == member.position_code,
                    EmergencyService.is_active.is_(True),
                )
                .limit(1)
            )
            if notified is None:
                raise ValidationError("Card is not routed to the participant service")
        return workspace

    async def _record_training_action(
        self,
        session: AsyncSession,
        card: IncidentCard,
        *,
        actor_id: uuid.UUID | None,
        action_type: str,
        request_id: str | None,
        entity_type: str = "incident_card",
        entity_id: str | None = None,
        before_state: dict[str, Any] | None = None,
        after_state: dict[str, Any] | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        workspace = await session.get(SimulationWorkspace, card.workspace_id)
        if workspace is None or workspace.training_session_id is None:
            return
        action_id = uuid.uuid4()
        session.add(
            TrainingAction(
                id=action_id,
                training_session_id=workspace.training_session_id,
                workspace_id=workspace.id,
                actor_user_id=actor_id,
                incident_card_id=card.id,
                action_type=action_type,
                entity_type=entity_type,
                entity_id=entity_id or str(card.id),
                occurred_at=utcnow(),
                request_id=request_id,
                result=TrainingActionResult.SUCCESS.value,
                before_state=before_state,
                after_state=after_state,
                details=details or {},
            )
        )
        await self._add_training_monitoring_outbox(
            session,
            event_id=action_id,
            training_session_id=workspace.training_session_id,
            workspace_id=workspace.id,
            event_type="training.action_recorded",
            data={
                "action_type": action_type,
                "action_result": TrainingActionResult.SUCCESS.value,
                "actor_user_id": str(actor_id) if actor_id else None,
                "incident_card_id": str(card.id),
            },
        )

    async def record_rejected_card_action(
        self,
        session: AsyncSession,
        card_id: uuid.UUID,
        *,
        actor_id: uuid.UUID | None,
        action_type: str,
        request_id: str | None,
        error: str,
    ) -> None:
        card = await session.get(IncidentCard, card_id)
        if card is None:
            return
        workspace = await session.get(SimulationWorkspace, card.workspace_id)
        if workspace is None or workspace.training_session_id is None:
            return
        stored_actor_id = actor_id
        if actor_id is not None and await session.get(UserAccount, actor_id) is None:
            stored_actor_id = None
        action_id = uuid.uuid4()
        session.add(
            TrainingAction(
                id=action_id,
                training_session_id=workspace.training_session_id,
                workspace_id=workspace.id,
                actor_user_id=stored_actor_id,
                incident_card_id=card.id,
                action_type=action_type,
                entity_type="incident_card",
                entity_id=str(card.id),
                occurred_at=utcnow(),
                request_id=request_id,
                result=TrainingActionResult.REJECTED.value,
                details={
                    "error": error,
                    "attempted_actor_id": str(actor_id) if actor_id else None,
                },
            )
        )
        await self._add_training_monitoring_outbox(
            session,
            event_id=action_id,
            training_session_id=workspace.training_session_id,
            workspace_id=workspace.id,
            event_type="training.action_recorded",
            data={
                "action_type": action_type,
                "action_result": TrainingActionResult.REJECTED.value,
                "actor_user_id": str(actor_id) if actor_id else None,
                "incident_card_id": str(card.id),
                "error": error,
            },
        )

    async def record_rejected_service_action(
        self,
        session: AsyncSession,
        card_service_id: uuid.UUID,
        *,
        actor_id: uuid.UUID | None,
        request_id: str | None,
        error: str,
    ) -> None:
        card_service = await session.get(CardService, card_service_id)
        if card_service is None:
            return
        await self.record_rejected_card_action(
            session,
            card_service.card_id,
            actor_id=actor_id,
            action_type="SERVICE_STATUS_CHANGED",
            request_id=request_id,
            error=error,
        )

    async def _add_training_monitoring_outbox(
        self,
        session: AsyncSession,
        *,
        event_id: uuid.UUID,
        training_session_id: uuid.UUID,
        workspace_id: uuid.UUID,
        event_type: str,
        data: dict[str, Any],
    ) -> None:
        teacher_ids = list(
            await session.scalars(
                select(WorkspaceMember.user_id).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.member_role == WorkspaceMemberRole.INSTRUCTOR.value,
                    WorkspaceMember.left_at.is_(None),
                )
            )
        )
        if not teacher_ids:
            return
        occurred_at = utcnow()
        session.add(
            OutboxEvent(
                aggregate_type="training_event",
                aggregate_id=str(event_id),
                aggregate_version=1,
                event_type=event_type,
                topic=self.topic,
                message_key=str(training_session_id),
                payload={
                    "event_id": str(event_id),
                    "event_type": event_type,
                    "aggregate_type": "training_session",
                    "aggregate_id": str(training_session_id),
                    "aggregate_version": 1,
                    "workspace_id": str(workspace_id),
                    "teacher_ids": [str(value) for value in teacher_ids],
                    "occurred_at": occurred_at.isoformat(),
                    "data": {
                        "session_id": str(training_session_id),
                        "workspace_id": str(workspace_id),
                        **data,
                    },
                },
            )
        )

    @staticmethod
    def _card_core_state(card: IncidentCard) -> dict[str, Any]:
        return {
            "card_number": card.card_number,
            "event_type_id": card.event_type_id,
            "description": card.description,
            "questionnaire": card.questionnaire,
            "reported_address": card.reported_address,
            "incident_address": card.incident_address,
            "victims_count": card.victims_count,
            "current_status": card.current_status,
            "version": card.version,
        }

    @staticmethod
    def _new_card_number() -> str:
        return f"112-{utcnow():%Y%m%d}-{uuid.uuid4().hex[:10].upper()}"
