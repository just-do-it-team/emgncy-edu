from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.service import ConflictError, NotFoundError, ValidationError
from s112.api.scenario_completion import ScenarioCompletionService
from s112.audio.storage import StoredAudioObject
from s112.common.config import Settings
from s112.common.enums import (
    AudioMessageDirection,
    AudioMessageKind,
    AudioMessageStatus,
    TrainingCallStatus,
    TrainingSessionStatus,
    WorkspaceMemberRole,
    WorkspaceStatus,
)
from s112.domain.models import (
    AudioMessage,
    CardService,
    EmergencyService,
    IncidentCard,
    OutboxEvent,
    SimulationWorkspace,
    TrainingCall,
    TrainingSession,
    WorkspaceMember,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AudioMessageService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def validate_context(
        self,
        session: AsyncSession,
        *,
        workspace_id: uuid.UUID,
        card_id: uuid.UUID,
        user_id: uuid.UUID,
        lock_session: bool = False,
        require_active: bool = True,
    ) -> tuple[SimulationWorkspace, TrainingSession, IncidentCard]:
        workspace = await session.get(SimulationWorkspace, workspace_id)
        if workspace is None or workspace.training_session_id is None:
            raise NotFoundError("Training workspace not found")

        member = await session.get(WorkspaceMember, (workspace_id, user_id))
        if (
            member is None
            or member.left_at is not None
            or member.member_role != WorkspaceMemberRole.PARTICIPANT.value
        ):
            raise ValidationError("Active student workspace membership is required")

        session_statement = select(TrainingSession).where(
            TrainingSession.id == workspace.training_session_id
        )
        if lock_session:
            session_statement = session_statement.with_for_update()
        training_session = await session.scalar(session_statement)
        if training_session is None:
            raise NotFoundError("Training session not found")

        card = await session.scalar(
            select(IncidentCard).where(
                IncidentCard.id == card_id,
                IncidentCard.workspace_id == workspace_id,
            )
        )
        if card is None:
            raise NotFoundError("Card not found")

        if member.position_code:
            visible_service = await session.scalar(
                select(CardService.id)
                .join(
                    EmergencyService,
                    EmergencyService.id == CardService.service_id,
                )
                .where(
                    CardService.card_id == card.id,
                    CardService.is_active.is_(True),
                    EmergencyService.code == member.position_code,
                    EmergencyService.is_active.is_(True),
                )
                .limit(1)
            )
            if visible_service is None:
                raise NotFoundError("Card not found")
        if require_active:
            self.assert_context_active(workspace, training_session)
        return workspace, training_session, card

    async def validate_call_context(
        self,
        session: AsyncSession,
        *,
        workspace_id: uuid.UUID,
        call_id: uuid.UUID,
        user_id: uuid.UUID,
        lock_session: bool = False,
        require_active: bool = True,
        require_active_call: bool = True,
    ) -> tuple[SimulationWorkspace, TrainingSession, TrainingCall]:
        workspace = await session.get(SimulationWorkspace, workspace_id)
        if workspace is None or workspace.training_session_id is None:
            raise NotFoundError("Training workspace not found")

        member = await session.get(WorkspaceMember, (workspace_id, user_id))
        if (
            member is None
            or member.left_at is not None
            or member.member_role != WorkspaceMemberRole.PARTICIPANT.value
        ):
            raise ValidationError("Active student workspace membership is required")

        if member.position_code is not None:
            raise ValidationError("Operator 112 access is required for incoming calls")

        session_statement = select(TrainingSession).where(
            TrainingSession.id == workspace.training_session_id
        )
        if lock_session:
            session_statement = session_statement.with_for_update()
        training_session = await session.scalar(session_statement)
        if training_session is None:
            raise NotFoundError("Training session not found")

        training_call = await session.scalar(
            select(TrainingCall).where(
                TrainingCall.id == call_id,
                TrainingCall.training_session_id == training_session.id,
                TrainingCall.workspace_id == workspace_id,
            )
        )
        if training_call is None:
            raise NotFoundError("Incoming call not found")
        if (
            require_active_call
            and training_call.status != TrainingCallStatus.ACTIVE.value
        ):
            raise ConflictError("Audio can be sent only during an active incoming call")
        if require_active_call and training_call.operator_user_id != user_id:
            raise ConflictError("Only the answering operator can speak in this call")
        if require_active:
            self.assert_context_active(workspace, training_session)
        return workspace, training_session, training_call

    @staticmethod
    def assert_context_active(
        workspace: SimulationWorkspace,
        training_session: TrainingSession,
    ) -> None:
        if workspace.status != WorkspaceStatus.ACTIVE.value:
            raise ConflictError("Training workspace is not active")
        if training_session.status != TrainingSessionStatus.RUNNING.value:
            raise ConflictError("Training session is not running")

    async def find_replay(
        self,
        session: AsyncSession,
        *,
        training_session_id: uuid.UUID,
        idempotency_key: str,
    ) -> AudioMessage | None:
        return await session.scalar(
            select(AudioMessage).where(
                AudioMessage.training_session_id == training_session_id,
                AudioMessage.idempotency_key == idempotency_key,
            )
        )

    async def create_stt_message(
        self,
        session: AsyncSession,
        *,
        message_id: uuid.UUID,
        workspace_id: uuid.UUID,
        card_id: uuid.UUID,
        user_id: uuid.UUID,
        idempotency_key: str,
        stored: StoredAudioObject,
        client_sent_at: datetime | None,
        direction: str = AudioMessageDirection.INBOUND.value,
    ) -> tuple[AudioMessage, bool]:
        workspace, training_session, _ = await self.validate_context(
            session,
            workspace_id=workspace_id,
            card_id=card_id,
            user_id=user_id,
            lock_session=True,
            require_active=False,
        )
        replay = await self.find_replay(
            session,
            training_session_id=training_session.id,
            idempotency_key=idempotency_key,
        )
        if replay is not None:
            self.assert_replay_matches(
                replay,
                kind=AudioMessageKind.STT.value,
                card_id=card_id,
                user_id=user_id,
                direction=direction,
            )
            return replay, True
        self.assert_context_active(workspace, training_session)

        message = AudioMessage(
            id=message_id,
            training_session_id=training_session.id,
            workspace_id=workspace.id,
            incident_card_id=card_id,
            actor_user_id=user_id,
            kind=AudioMessageKind.STT.value,
            direction=direction,
            status=AudioMessageStatus.QUEUED.value,
            sequence_no=await self._next_sequence(session, training_session.id),
            revision=1,
            idempotency_key=idempotency_key,
            object_key=stored.object_key,
            object_etag=stored.etag,
            sha256=stored.sha256,
            content_type=stored.content_type,
            size_bytes=stored.size_bytes,
            client_sent_at=client_sent_at,
        )
        session.add(message)
        self._add_request_outbox(session, message)
        await ScenarioCompletionService(self.settings.kafka_topic).refresh(
            session, training_session
        )
        return message, False

    async def create_tts_message(
        self,
        session: AsyncSession,
        *,
        message_id: uuid.UUID,
        workspace_id: uuid.UUID,
        card_id: uuid.UUID,
        user_id: uuid.UUID,
        idempotency_key: str,
        text: str,
        client_sent_at: datetime | None,
    ) -> tuple[AudioMessage, bool]:
        workspace, training_session, _ = await self.validate_context(
            session,
            workspace_id=workspace_id,
            card_id=card_id,
            user_id=user_id,
            lock_session=True,
            require_active=False,
        )
        replay = await self.find_replay(
            session,
            training_session_id=training_session.id,
            idempotency_key=idempotency_key,
        )
        if replay is not None:
            self.assert_replay_matches(
                replay,
                kind=AudioMessageKind.TTS.value,
                card_id=card_id,
                user_id=user_id,
                source_text=text,
            )
            return replay, True
        self.assert_context_active(workspace, training_session)
        if len(text) > self.settings.tts_max_text_chars:
            raise ValidationError("Text exceeds the configured TTS limit")

        object_key = (
            f"{self.settings.seaweed_audio_prefix.rstrip('/')}"
            f"/{training_session.id}/{message_id}.wav"
        )
        message = AudioMessage(
            id=message_id,
            training_session_id=training_session.id,
            workspace_id=workspace.id,
            incident_card_id=card_id,
            actor_user_id=user_id,
            kind=AudioMessageKind.TTS.value,
            direction=AudioMessageDirection.OUTBOUND.value,
            status=AudioMessageStatus.QUEUED.value,
            sequence_no=await self._next_sequence(session, training_session.id),
            revision=1,
            idempotency_key=idempotency_key,
            source_text=text,
            object_key=object_key,
            client_sent_at=client_sent_at,
        )
        session.add(message)
        self._add_request_outbox(session, message)
        await ScenarioCompletionService(self.settings.kafka_topic).refresh(
            session, training_session
        )
        return message, False

    async def create_call_stt_message(
        self,
        session: AsyncSession,
        *,
        message_id: uuid.UUID,
        workspace_id: uuid.UUID,
        call_id: uuid.UUID,
        user_id: uuid.UUID,
        idempotency_key: str,
        stored: StoredAudioObject,
        client_sent_at: datetime | None,
    ) -> tuple[AudioMessage, bool]:
        workspace, training_session, training_call = await self.validate_call_context(
            session,
            workspace_id=workspace_id,
            call_id=call_id,
            user_id=user_id,
            lock_session=True,
            require_active=False,
        )
        replay = await self.find_replay(
            session,
            training_session_id=training_session.id,
            idempotency_key=idempotency_key,
        )
        if replay is not None:
            self.assert_replay_matches(
                replay,
                kind=AudioMessageKind.STT.value,
                training_call_id=call_id,
                user_id=user_id,
                direction=AudioMessageDirection.OUTBOUND.value,
            )
            return replay, True
        self.assert_context_active(workspace, training_session)

        latest = await session.scalar(
            select(AudioMessage)
            .where(AudioMessage.training_call_id == call_id)
            .order_by(AudioMessage.sequence_no.desc())
            .limit(1)
        )
        if latest is not None and (
            latest.status in {AudioMessageStatus.QUEUED.value, AudioMessageStatus.PROCESSING.value}
            or (latest.kind == AudioMessageKind.STT.value and latest.status == AudioMessageStatus.COMPLETED.value)
        ):
            raise ConflictError("The previous call turn is still being processed")

        message = AudioMessage(
            id=message_id,
            training_session_id=training_session.id,
            workspace_id=workspace.id,
            training_call_id=call_id,
            incident_card_id=training_call.incident_card_id,
            actor_user_id=user_id,
            kind=AudioMessageKind.STT.value,
            direction=AudioMessageDirection.OUTBOUND.value,
            status=AudioMessageStatus.QUEUED.value,
            sequence_no=await self._next_sequence(session, training_session.id),
            revision=1,
            idempotency_key=idempotency_key,
            object_key=stored.object_key,
            object_etag=stored.etag,
            sha256=stored.sha256,
            content_type=stored.content_type,
            size_bytes=stored.size_bytes,
            client_sent_at=client_sent_at,
        )
        session.add(message)
        self._add_request_outbox(session, message)
        await ScenarioCompletionService(self.settings.kafka_topic).refresh(
            session, training_session
        )
        return message, False

    async def create_call_tts_message(
        self,
        session: AsyncSession,
        *,
        message_id: uuid.UUID,
        workspace_id: uuid.UUID,
        call_id: uuid.UUID,
        user_id: uuid.UUID,
        idempotency_key: str,
        text: str,
        client_sent_at: datetime | None,
    ) -> tuple[AudioMessage, bool]:
        workspace, training_session, training_call = await self.validate_call_context(
            session,
            workspace_id=workspace_id,
            call_id=call_id,
            user_id=user_id,
            lock_session=True,
            require_active=False,
        )
        replay = await self.find_replay(
            session,
            training_session_id=training_session.id,
            idempotency_key=idempotency_key,
        )
        if replay is not None:
            self.assert_replay_matches(
                replay,
                kind=AudioMessageKind.TTS.value,
                training_call_id=call_id,
                user_id=user_id,
                source_text=text,
            )
            return replay, True
        self.assert_context_active(workspace, training_session)
        if len(text) > self.settings.tts_max_text_chars:
            raise ValidationError("Text exceeds the configured TTS limit")

        object_key = (
            f"{self.settings.seaweed_audio_prefix.rstrip('/')}"
            f"/{training_session.id}/{message_id}.wav"
        )
        message = AudioMessage(
            id=message_id,
            training_session_id=training_session.id,
            workspace_id=workspace.id,
            training_call_id=call_id,
            incident_card_id=training_call.incident_card_id,
            actor_user_id=user_id,
            kind=AudioMessageKind.TTS.value,
            direction=AudioMessageDirection.OUTBOUND.value,
            status=AudioMessageStatus.QUEUED.value,
            sequence_no=await self._next_sequence(session, training_session.id),
            revision=1,
            idempotency_key=idempotency_key,
            source_text=text,
            object_key=object_key,
            client_sent_at=client_sent_at,
        )
        session.add(message)
        self._add_request_outbox(session, message)
        await ScenarioCompletionService(self.settings.kafka_topic).refresh(
            session, training_session
        )
        return message, False

    async def assert_message_access(
        self,
        session: AsyncSession,
        message_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> AudioMessage:
        message = await session.get(AudioMessage, message_id)
        if message is None:
            raise NotFoundError("Audio message not found")
        member = await session.get(
            WorkspaceMember, (message.workspace_id, user_id)
        )
        if member is None or member.left_at is not None:
            raise NotFoundError("Audio message not found")
        if member.position_code and message.incident_card_id is not None:
            visible_service = await session.scalar(
                select(CardService.id)
                .join(
                    EmergencyService,
                    EmergencyService.id == CardService.service_id,
                )
                .where(
                    CardService.card_id == message.incident_card_id,
                    CardService.is_active.is_(True),
                    EmergencyService.code == member.position_code,
                    EmergencyService.is_active.is_(True),
                )
                .limit(1)
            )
            if visible_service is None:
                raise NotFoundError("Audio message not found")
        return message

    async def list_card_messages(
        self,
        session: AsyncSession,
        *,
        workspace_id: uuid.UUID,
        card_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> list[AudioMessage]:
        workspace = await session.get(SimulationWorkspace, workspace_id)
        if workspace is None or workspace.training_session_id is None:
            raise NotFoundError("Training workspace not found")
        member = await session.get(WorkspaceMember, (workspace_id, user_id))
        if member is None or member.left_at is not None:
            raise NotFoundError("Card not found")
        card = await session.scalar(
            select(IncidentCard).where(
                IncidentCard.id == card_id,
                IncidentCard.workspace_id == workspace_id,
            )
        )
        if card is None:
            raise NotFoundError("Card not found")
        if member.position_code:
            visible_service = await session.scalar(
                select(CardService.id)
                .join(
                    EmergencyService,
                    EmergencyService.id == CardService.service_id,
                )
                .where(
                    CardService.card_id == card.id,
                    CardService.is_active.is_(True),
                    EmergencyService.code == member.position_code,
                    EmergencyService.is_active.is_(True),
                )
                .limit(1)
            )
            if visible_service is None:
                raise NotFoundError("Card not found")
        return list(
            await session.scalars(
                select(AudioMessage)
                .where(
                    AudioMessage.workspace_id == workspace_id,
                    or_(
                        AudioMessage.incident_card_id == card_id,
                        AudioMessage.training_call_id.in_(
                            select(TrainingCall.id).where(TrainingCall.incident_card_id == card_id)
                        ),
                    ),
                )
                .order_by(AudioMessage.sequence_no)
            )
        )

    async def list_call_messages(
        self,
        session: AsyncSession,
        *,
        workspace_id: uuid.UUID,
        call_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> list[AudioMessage]:
        await self.validate_call_context(
            session,
            workspace_id=workspace_id,
            call_id=call_id,
            user_id=user_id,
            require_active=False,
            require_active_call=False,
        )
        return list(
            await session.scalars(
                select(AudioMessage)
                .where(
                    AudioMessage.workspace_id == workspace_id,
                    AudioMessage.training_call_id == call_id,
                )
                .order_by(AudioMessage.sequence_no)
            )
        )

    @staticmethod
    def assert_replay_matches(
        message: AudioMessage,
        *,
        kind: str,
        card_id: uuid.UUID | None = None,
        training_call_id: uuid.UUID | None = None,
        user_id: uuid.UUID,
        source_text: str | None = None,
        direction: str | None = None,
    ) -> None:
        if (
            message.kind != kind
            or (training_call_id is None and message.incident_card_id != card_id)
            or message.training_call_id != training_call_id
            or message.actor_user_id != user_id
            or (source_text is not None and message.source_text != source_text)
            or (direction is not None and message.direction != direction)
        ):
            raise ConflictError(
                "Idempotency-Key was already used for a different audio request"
            )

    async def _next_sequence(
        self, session: AsyncSession, training_session_id: uuid.UUID
    ) -> int:
        current = await session.scalar(
            select(func.max(AudioMessage.sequence_no)).where(
                AudioMessage.training_session_id == training_session_id
            )
        )
        return int(current or 0) + 1

    def _add_request_outbox(
        self, session: AsyncSession, message: AudioMessage
    ) -> None:
        event_id = uuid.uuid4()
        event_type = (
            "audio.stt.requested"
            if message.kind == AudioMessageKind.STT.value
            else "audio.tts.requested"
        )
        topic = (
            self.settings.audio_stt_request_topic
            if message.kind == AudioMessageKind.STT.value
            else self.settings.audio_tts_request_topic
        )
        occurred_at = utcnow()
        session.add(
            OutboxEvent(
                id=event_id,
                aggregate_type="audio_message",
                aggregate_id=str(message.id),
                aggregate_version=message.revision,
                event_type=event_type,
                topic=topic,
                message_key=str(message.training_session_id),
                payload={
                    "schema_version": 1,
                    "event_id": str(event_id),
                    "event_type": event_type,
                    "aggregate_type": "audio_message",
                    "aggregate_id": str(message.id),
                    "aggregate_version": message.revision,
                    "occurred_at": occurred_at.isoformat(),
                    "correlation_id": str(message.id),
                    "data": {
                        "audio_message_id": str(message.id),
                        "training_session_id": str(message.training_session_id),
                        "workspace_id": str(message.workspace_id),
                        "incident_card_id": (
                            str(message.incident_card_id)
                            if message.incident_card_id
                            else None
                        ),
                        "training_call_id": (
                            str(message.training_call_id)
                            if message.training_call_id
                            else None
                        ),
                        "actor_user_id": (
                            str(message.actor_user_id)
                            if message.actor_user_id
                            else None
                        ),
                        "kind": message.kind,
                        "direction": message.direction,
                        "sequence_no": message.sequence_no,
                        "object_key": message.object_key,
                        "object_etag": message.object_etag,
                        "sha256": message.sha256,
                        "content_type": message.content_type,
                        "size_bytes": message.size_bytes,
                        "source_text": message.source_text,
                        "client_sent_at": (
                            message.client_sent_at.isoformat()
                            if message.client_sent_at
                            else None
                        ),
                    },
                },
            )
        )
