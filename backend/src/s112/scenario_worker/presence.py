"""Abort training sessions whose participants have stopped sending heartbeats."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import exists, select

from s112.api.simulation_service import SimulationApplicationService
from s112.common.database import Database
from s112.common.enums import TrainingSessionStatus, WorkspaceMemberRole, WorkspaceMode
from s112.domain.models import (
    ScenarioAssignment,
    SimulationWorkspace,
    TrainingSession,
    WorkspaceMember,
)


logger = logging.getLogger(__name__)


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class PresenceSweepWorker:
    def __init__(self, database: Database, *, timeout_seconds: int, batch_size: int = 100) -> None:
        self.database = database
        self.timeout_seconds = timeout_seconds
        self.batch_size = batch_size
        self.simulation = SimulationApplicationService()

    async def run_once(self) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=self.timeout_seconds)
        seen_participant = exists(
            select(WorkspaceMember.user_id).where(
                WorkspaceMember.workspace_id == SimulationWorkspace.id,
                WorkspaceMember.member_role == WorkspaceMemberRole.PARTICIPANT.value,
                WorkspaceMember.left_at.is_(None),
                WorkspaceMember.last_presence_at.is_not(None),
                WorkspaceMember.last_presence_at <= cutoff,
            )
        )
        recent_participant = exists(
            select(WorkspaceMember.user_id).where(
                WorkspaceMember.workspace_id == SimulationWorkspace.id,
                WorkspaceMember.member_role == WorkspaceMemberRole.PARTICIPANT.value,
                WorkspaceMember.left_at.is_(None),
                WorkspaceMember.last_presence_at > cutoff,
            )
        )
        async with self.database.write_session_factory() as session:
            candidate_ids = list(
                await session.scalars(
                    select(TrainingSession.id)
                    .join(
                        SimulationWorkspace,
                        SimulationWorkspace.training_session_id == TrainingSession.id,
                    )
                    .where(
                        TrainingSession.status == TrainingSessionStatus.RUNNING.value,
                        seen_participant,
                        ~recent_participant,
                    )
                    .order_by(TrainingSession.started_at, TrainingSession.id)
                    .limit(self.batch_size)
                )
            )

        aborted = 0
        for session_id in candidate_ids:
            try:
                aborted += await self._abort_if_empty(session_id, cutoff)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Failed to expire training session %s", session_id)
        return aborted

    async def _abort_if_empty(self, session_id: uuid.UUID, cutoff: datetime) -> int:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                statement = select(TrainingSession).where(TrainingSession.id == session_id)
                if session.bind and session.bind.dialect.name == "postgresql":
                    statement = statement.with_for_update(skip_locked=True)
                training_session = await session.scalar(statement)
                if training_session is None or training_session.status != TrainingSessionStatus.RUNNING.value:
                    return 0
                workspace = await session.scalar(
                    select(SimulationWorkspace).where(
                        SimulationWorkspace.training_session_id == session_id
                    )
                )
                if workspace is None:
                    return 0
                participants = list(
                    await session.scalars(
                        select(WorkspaceMember).where(
                            WorkspaceMember.workspace_id == workspace.id,
                            WorkspaceMember.member_role == WorkspaceMemberRole.PARTICIPANT.value,
                            WorkspaceMember.left_at.is_(None),
                        )
                    )
                )
                if not any(member.last_presence_at is not None for member in participants):
                    return 0  # Older clients have not opted in to presence tracking.
                if any(
                    member.last_presence_at is not None
                    and _utc(member.last_presence_at) > cutoff
                    for member in participants
                ):
                    return 0
                assignment = await session.get(ScenarioAssignment, training_session.assignment_id)
                if assignment is None:
                    return 0
                if assignment.workspace_mode == WorkspaceMode.INDIVIDUAL.value:
                    if len(participants) != 1:
                        return 0
                    await self.simulation.abort_individual_session(
                        session, session_id, participants[0].user_id,
                        reason="PRESENCE_TIMEOUT",
                    )
                elif assignment.workspace_mode == WorkspaceMode.SHARED.value:
                    await self.simulation.abort_shared_session(
                        session, session_id, assignment.assigned_by,
                        "PRESENCE_TIMEOUT", system_initiated=True,
                    )
                else:
                    return 0
                logger.info("Aborted empty training session %s after presence timeout", session_id)
                return 1

    async def run_forever(self, interval_seconds: float) -> None:
        # Let clients reconnect after a worker restart before checking old leases.
        await asyncio.sleep(self.timeout_seconds)
        while True:
            try:
                await self.run_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Presence sweep iteration failed")
            await asyncio.sleep(interval_seconds)
