from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from s112.api.schemas import CardCreate
from s112.api.service import ConflictError, NotFoundError, ValidationError
from s112.api.simulation_schemas import (
    CardTemplateCreate,
    ScenarioAssignmentCreate,
    ScenarioDefinition,
    TrainingScenarioCreate,
    TrainingScenarioUpdate,
)
from s112.common.enums import (
    AssignmentStatus,
    LaunchPolicy,
    ParticipantStatus,
    ScenarioCardSourceType,
    ScenarioStatus,
    ScenarioTriggerType,
    ScheduledCardStatus,
    TrainingActionResult,
    TrainingSessionStatus,
    UserRole,
    WorkspaceMemberRole,
    WorkspaceMode,
    WorkspaceStatus,
)
from s112.domain.models import (
    AssignmentParticipant,
    CardFeature,
    CardService,
    CardTemplate,
    EmergencyService,
    IncidentCard,
    ScenarioAssignment,
    SessionScheduledCard,
    SimulationWorkspace,
    TrainingAction,
    TrainingCardResult,
    TrainingScenario,
    TrainingSession,
    UserAccount,
    WorkspaceMember,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class SimulationApplicationService:
    async def create_template(
        self, session: AsyncSession, request: CardTemplateCreate
    ) -> CardTemplate:
        await self._require_user_role(
            session, request.created_by, {UserRole.TEACHER, UserRole.ADMINISTRATOR}
        )
        template_key = request.template_key or uuid.uuid4()
        existing = await session.scalar(
            select(CardTemplate.id).where(
                CardTemplate.template_key == template_key,
                CardTemplate.version == request.version,
            )
        )
        if existing is not None:
            raise ConflictError("This template version already exists")

        card_payload = request.initial_card.model_dump(mode="json", exclude_none=True)
        card_payload.pop("workspace_id", None)
        card_payload.pop("request_id", None)
        template = CardTemplate(
            template_key=template_key,
            version=request.version,
            name=request.name,
            description=request.description,
            difficulty=request.difficulty,
            initial_card=card_payload,
            expected_result=request.expected_result.model_dump(mode="json"),
            evaluation_rules=request.evaluation_rules,
            created_by=request.created_by,
        )
        session.add(template)
        await session.flush()
        return template

    async def create_scenario(
        self, session: AsyncSession, request: TrainingScenarioCreate
    ) -> TrainingScenario:
        await self._require_user_role(
            session, request.created_by, {UserRole.TEACHER, UserRole.ADMINISTRATOR}
        )
        await self._validate_template_references(session, request.definition)
        scenario = TrainingScenario(
            name=request.name,
            description=request.description,
            difficulty=request.difficulty,
            estimated_duration_seconds=request.estimated_duration_seconds,
            cards_count=len(request.definition.cards),
            workspace_mode=request.workspace_mode.value,
            min_participants=request.min_participants,
            max_participants=request.max_participants,
            definition=request.definition.model_dump(mode="json", exclude_none=True),
            revision=1,
            status=request.status.value,
            created_by=request.created_by,
            updated_by=request.created_by,
        )
        session.add(scenario)
        await session.flush()
        return scenario

    async def update_scenario(
        self,
        session: AsyncSession,
        scenario_id: uuid.UUID,
        request: TrainingScenarioUpdate,
    ) -> TrainingScenario:
        await self._require_user_role(
            session, request.updated_by, {UserRole.TEACHER, UserRole.ADMINISTRATOR}
        )
        scenario = await session.scalar(
            select(TrainingScenario)
            .where(TrainingScenario.id == scenario_id)
            .with_for_update()
        )
        if scenario is None:
            raise NotFoundError("Training scenario not found")
        if scenario.revision != request.expected_revision:
            raise ConflictError(
                f"Scenario revision conflict: expected {request.expected_revision}, "
                f"actual {scenario.revision}"
            )

        values = request.model_dump(
            exclude={"expected_revision", "updated_by", "definition"}, exclude_unset=True
        )
        for field, value in values.items():
            if hasattr(value, "value"):
                value = value.value
            setattr(scenario, field, value)
        if request.definition is not None:
            await self._validate_template_references(session, request.definition)
            scenario.definition = request.definition.model_dump(mode="json", exclude_none=True)
            scenario.cards_count = len(request.definition.cards)

        self._validate_participant_range(
            scenario.workspace_mode,
            scenario.min_participants,
            scenario.max_participants,
        )
        scenario.updated_by = request.updated_by
        scenario.revision += 1
        await session.flush()
        return scenario

    async def create_assignment(
        self, session: AsyncSession, request: ScenarioAssignmentCreate
    ) -> ScenarioAssignment:
        await self._require_user_role(
            session, request.assigned_by, {UserRole.TEACHER, UserRole.ADMINISTRATOR}
        )
        scenario = await session.get(TrainingScenario, request.scenario_id)
        if scenario is None:
            raise NotFoundError("Training scenario not found")
        if scenario.status != ScenarioStatus.PUBLISHED.value:
            raise ValidationError("Only a published scenario can be assigned")

        participant_count = len(request.participant_ids)
        if not scenario.min_participants <= participant_count <= scenario.max_participants:
            raise ValidationError(
                "Participant count is outside the scenario participant range"
            )
        if (
            scenario.workspace_mode == WorkspaceMode.INDIVIDUAL.value
            and participant_count != 1
        ):
            raise ValidationError("An individual assignment requires one participant")
        if (
            request.launch_policy is LaunchPolicy.STUDENT_SELF_START
            and scenario.workspace_mode != WorkspaceMode.INDIVIDUAL.value
        ):
            raise ValidationError("STUDENT_SELF_START is only available for individual scenarios")

        for participant_id in request.participant_ids:
            await self._require_user_role(session, participant_id, {UserRole.STUDENT})

        definition = ScenarioDefinition.model_validate(scenario.definition)
        resolved_cards: list[dict[str, Any]] = []
        for card in definition.cards:
            raw = card.model_dump(mode="json", exclude_none=True)
            if card.source_type is ScenarioCardSourceType.TEMPLATE:
                template = await session.get(CardTemplate, card.template_id)
                if template is None or not template.is_active:
                    raise ValidationError(f"Inactive or missing card template: {card.template_id}")
                raw["source_type"] = ScenarioCardSourceType.SNAPSHOT.value
                raw["template_id"] = str(template.id)
                raw["template_key"] = str(template.template_key)
                raw["template_version"] = template.version
                raw["initial_card"] = dict(template.initial_card)
                raw["expected_result"] = dict(template.expected_result)
                raw["evaluation_rules"] = {
                    **template.evaluation_rules,
                    **card.evaluation_rules,
                }
            else:
                raw["source_type"] = ScenarioCardSourceType.SNAPSHOT.value
            raw["initial_card"].pop("workspace_id", None)
            raw["initial_card"].pop("request_id", None)
            resolved_cards.append(raw)

        snapshot = {
            "scenario_id": str(scenario.id),
            "scenario_revision": scenario.revision,
            "name": scenario.name,
            "difficulty": scenario.difficulty,
            "estimated_duration_seconds": scenario.estimated_duration_seconds,
            "workspace_mode": scenario.workspace_mode,
            "min_participants": scenario.min_participants,
            "max_participants": scenario.max_participants,
            "definition": {
                "schema_version": definition.schema_version,
                "cards": resolved_cards,
            },
        }
        assignment = ScenarioAssignment(
            scenario_id=scenario.id,
            scenario_revision=scenario.revision,
            scenario_snapshot=snapshot,
            assigned_by=request.assigned_by,
            workspace_mode=scenario.workspace_mode,
            launch_policy=request.launch_policy.value,
            max_attempts=request.max_attempts,
            status=AssignmentStatus.ASSIGNED.value,
            available_from=request.available_from,
            due_at=request.due_at,
        )
        session.add(assignment)
        await session.flush()
        session.add_all(
            [
                AssignmentParticipant(
                    assignment_id=assignment.id,
                    user_id=participant_id,
                    status=ParticipantStatus.ASSIGNED.value,
                )
                for participant_id in request.participant_ids
            ]
        )
        await session.flush()
        return assignment

    async def start_individual_assignment(
        self,
        session: AsyncSession,
        assignment_id: uuid.UUID,
        user_id: uuid.UUID,
        idempotency_key: str,
    ) -> tuple[TrainingSession, SimulationWorkspace, bool]:
        existing = await session.scalar(
            select(TrainingSession).where(
                TrainingSession.assignment_id == assignment_id,
                TrainingSession.start_idempotency_key == idempotency_key,
            )
        )
        if existing is not None:
            participant = await session.get(
                AssignmentParticipant, (assignment_id, user_id)
            )
            if participant is None:
                raise ValidationError("User is not assigned to this scenario")
            workspace = await session.scalar(
                select(SimulationWorkspace).where(
                    SimulationWorkspace.training_session_id == existing.id
                )
            )
            if workspace is None:
                raise ConflictError("Idempotent session exists without a workspace")
            return existing, workspace, True

        assignment = await session.scalar(
            select(ScenarioAssignment)
            .where(ScenarioAssignment.id == assignment_id)
            .with_for_update()
        )
        if assignment is None:
            raise NotFoundError("Scenario assignment not found")
        existing = await session.scalar(
            select(TrainingSession).where(
                TrainingSession.assignment_id == assignment_id,
                TrainingSession.start_idempotency_key == idempotency_key,
            )
        )
        if existing is not None:
            participant = await session.get(
                AssignmentParticipant, (assignment_id, user_id)
            )
            if participant is None:
                raise ValidationError("User is not assigned to this scenario")
            workspace = await session.scalar(
                select(SimulationWorkspace).where(
                    SimulationWorkspace.training_session_id == existing.id
                )
            )
            if workspace is None:
                raise ConflictError("Idempotent session exists without a workspace")
            return existing, workspace, True
        if assignment.workspace_mode != WorkspaceMode.INDIVIDUAL.value:
            raise ValidationError("Shared scenario start policy has not been enabled yet")
        if assignment.launch_policy != LaunchPolicy.STUDENT_SELF_START.value:
            raise ValidationError("This assignment cannot be started by a student")
        if assignment.status in {
            AssignmentStatus.CANCELLED.value,
            AssignmentStatus.EXPIRED.value,
        }:
            raise ConflictError(f"Assignment is {assignment.status.lower()}")
        if assignment.status == AssignmentStatus.COMPLETED.value:
            raise ConflictError("Assignment is completed")

        participant = await session.get(AssignmentParticipant, (assignment.id, user_id))
        if participant is None:
            raise ValidationError("User is not assigned to this scenario")
        await self._require_user_role(session, user_id, {UserRole.STUDENT})

        now = utcnow()
        if assignment.available_from and now < _as_utc(assignment.available_from):
            raise ConflictError("Assignment is not available yet")
        if assignment.due_at and now > _as_utc(assignment.due_at):
            assignment.status = AssignmentStatus.EXPIRED.value
            raise ConflictError("Assignment deadline has passed")

        active = await session.scalar(
            select(TrainingSession).where(
                TrainingSession.assignment_id == assignment.id,
                TrainingSession.status.in_(
                    [TrainingSessionStatus.CREATED.value, TrainingSessionStatus.RUNNING.value]
                ),
            )
        )
        if active is not None:
            raise ConflictError("Assignment already has an active session")
        attempts = int(
            await session.scalar(
                select(func.count())
                .select_from(TrainingSession)
                .where(TrainingSession.assignment_id == assignment.id)
            )
            or 0
        )
        if attempts >= assignment.max_attempts:
            raise ConflictError("Maximum number of attempts has been reached")

        training_session = TrainingSession(
            assignment_id=assignment.id,
            attempt_number=attempts + 1,
            start_idempotency_key=idempotency_key,
            status=TrainingSessionStatus.RUNNING.value,
            started_at=now,
            result={},
        )
        session.add(training_session)
        await session.flush()
        workspace = SimulationWorkspace(
            training_session_id=training_session.id,
            mode=WorkspaceMode.INDIVIDUAL.value,
            status=WorkspaceStatus.ACTIVE.value,
            activated_at=now,
        )
        session.add(workspace)
        await session.flush()
        session.add(
            WorkspaceMember(
                workspace_id=workspace.id,
                user_id=user_id,
                member_role=WorkspaceMemberRole.PARTICIPANT.value,
            )
        )
        if assignment.assigned_by != user_id:
            session.add(
                WorkspaceMember(
                    workspace_id=workspace.id,
                    user_id=assignment.assigned_by,
                    member_role=WorkspaceMemberRole.INSTRUCTOR.value,
                )
            )
        session.add(
            TrainingAction(
                training_session_id=training_session.id,
                workspace_id=workspace.id,
                actor_user_id=user_id,
                action_type="SESSION_STARTED",
                entity_type="training_session",
                entity_id=str(training_session.id),
                occurred_at=now,
                request_id=(
                    f"session-start:{uuid.uuid5(uuid.NAMESPACE_URL, idempotency_key)}"
                ),
                result=TrainingActionResult.SUCCESS.value,
                details={"attempt_number": training_session.attempt_number},
            )
        )

        cards = assignment.scenario_snapshot["definition"]["cards"]
        for item in cards:
            trigger_type = item["trigger_type"]
            scheduled_at: datetime | None = None
            if trigger_type == ScenarioTriggerType.TIME_OFFSET.value:
                scheduled_at = now + timedelta(
                    seconds=int(item["trigger_config"]["offset_seconds"])
                )
            session.add(
                SessionScheduledCard(
                    training_session_id=training_session.id,
                    workspace_id=workspace.id,
                    scenario_card_key=item["key"],
                    trigger_type=trigger_type,
                    trigger_config=item.get("trigger_config", {}),
                    source_type=ScenarioCardSourceType.SNAPSHOT.value,
                    card_payload=item["initial_card"],
                    expected_result=item["expected_result"],
                    evaluation_rules=item.get("evaluation_rules", {}),
                    scheduled_at=scheduled_at,
                    status=ScheduledCardStatus.PENDING.value,
                )
            )

        assignment.status = AssignmentStatus.RUNNING.value
        participant.status = ParticipantStatus.RUNNING.value
        await session.flush()
        return training_session, workspace, False

    async def complete_session(
        self, session: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID
    ) -> TrainingSession:
        training_session = await session.scalar(
            select(TrainingSession)
            .where(TrainingSession.id == session_id)
            .with_for_update()
        )
        if training_session is None:
            raise NotFoundError("Training session not found")
        if training_session.status == TrainingSessionStatus.COMPLETED.value:
            return training_session
        if training_session.status != TrainingSessionStatus.RUNNING.value:
            raise ConflictError("Training session is not running")
        workspace = await session.scalar(
            select(SimulationWorkspace).where(
                SimulationWorkspace.training_session_id == training_session.id
            )
        )
        if workspace is None:
            raise ConflictError("Training session workspace is missing")
        member = await session.get(WorkspaceMember, (workspace.id, user_id))
        if member is None or member.left_at is not None:
            raise ValidationError("User is not a member of this workspace")

        scheduled_cards = list(
            await session.scalars(
                select(SessionScheduledCard)
                .where(SessionScheduledCard.training_session_id == training_session.id)
                .order_by(SessionScheduledCard.scenario_card_key)
            )
        )
        card_results: list[dict[str, Any]] = []
        total_score = Decimal("0")
        evaluated_count = 0
        for item in scheduled_cards:
            if item.status != ScheduledCardStatus.EMITTED.value or item.incident_card_id is None:
                if item.status == ScheduledCardStatus.PENDING.value:
                    item.status = ScheduledCardStatus.CANCELLED.value
                if item.trigger_type != ScenarioTriggerType.MANUAL.value:
                    missing_result = TrainingCardResult(
                        session_scheduled_card_id=item.id,
                        score=Decimal("0"),
                        passed=False,
                        discrepancies=[
                            {
                                "path": "incident_card",
                                "expected": "EMITTED",
                                "actual": item.status,
                                "reason": "scenario_card_not_emitted",
                            }
                        ],
                    )
                    session.add(missing_result)
                    evaluated_count += 1
                    card_results.append(
                        {
                            "scenario_card_key": item.scenario_card_key,
                            "incident_card_id": None,
                            "score": 0.0,
                            "passed": False,
                            "discrepancies": missing_result.discrepancies,
                        }
                    )
                continue
            result = await self._evaluate_card(session, item)
            session.add(result)
            total_score += result.score
            evaluated_count += 1
            card_results.append(
                {
                    "scenario_card_key": item.scenario_card_key,
                    "incident_card_id": str(item.incident_card_id),
                    "score": float(result.score),
                    "passed": result.passed,
                    "discrepancies": result.discrepancies,
                }
            )

        score = total_score / evaluated_count if evaluated_count else Decimal("0")
        passed = evaluated_count > 0 and all(item["passed"] for item in card_results)
        now = utcnow()
        training_session.status = TrainingSessionStatus.COMPLETED.value
        training_session.completed_at = now
        training_session.score = score.quantize(Decimal("0.01"))
        training_session.passed = passed
        training_session.result = {"cards": card_results}
        workspace.status = WorkspaceStatus.READ_ONLY.value
        workspace.closed_at = now
        session.add(
            TrainingAction(
                training_session_id=training_session.id,
                workspace_id=workspace.id,
                actor_user_id=user_id,
                action_type="SESSION_COMPLETED",
                entity_type="training_session",
                entity_id=str(training_session.id),
                occurred_at=now,
                request_id=f"session-complete:{training_session.id}",
                result=TrainingActionResult.SUCCESS.value,
                details={"score": float(training_session.score), "passed": passed},
            )
        )

        assignment = await session.get(ScenarioAssignment, training_session.assignment_id)
        if assignment is not None:
            participant = await session.get(AssignmentParticipant, (assignment.id, user_id))
            if passed or training_session.attempt_number >= assignment.max_attempts:
                assignment.status = AssignmentStatus.COMPLETED.value
            else:
                assignment.status = AssignmentStatus.ASSIGNED.value
            if participant is not None and assignment.status == AssignmentStatus.COMPLETED.value:
                participant.status = ParticipantStatus.COMPLETED.value
                participant.completed_at = now
            elif participant is not None:
                participant.status = ParticipantStatus.ASSIGNED.value
        await session.flush()
        return training_session

    async def _evaluate_card(
        self, session: AsyncSession, item: SessionScheduledCard
    ) -> TrainingCardResult:
        card = await session.scalar(
            select(IncidentCard)
            .options(selectinload(IncidentCard.features))
            .where(IncidentCard.id == item.incident_card_id)
        )
        if card is None:
            raise ConflictError("Emitted incident card is missing")
        state = await self._card_state(session, card)
        expected = item.expected_result
        discrepancies: list[dict[str, Any]] = []
        checks = self._compare_expected(
            expected.get("final_state", {}), state, "", discrepancies
        )

        actions = list(
            await session.scalars(
                select(TrainingAction)
                .where(
                    TrainingAction.training_session_id == item.training_session_id,
                    TrainingAction.incident_card_id == item.incident_card_id,
                )
                .order_by(TrainingAction.occurred_at)
            )
        )
        for required in expected.get("required_actions", []):
            checks += 1
            matching = [
                action
                for action in actions
                if action.action_type == required["action_type"]
                and action.result == TrainingActionResult.SUCCESS.value
                and self._dict_contains(action.details, required.get("parameters", {}))
            ]
            deadline = required.get("deadline_seconds")
            if deadline is not None and item.emitted_at is not None:
                limit = _as_utc(item.emitted_at) + timedelta(seconds=int(deadline))
                matching = [action for action in matching if _as_utc(action.occurred_at) <= limit]
            if not matching:
                discrepancies.append(
                    {
                        "path": "required_actions",
                        "expected": required,
                        "actual": None,
                        "reason": "required_action_missing",
                    }
                )

        failures = len(discrepancies)
        score = Decimal("100") if checks == 0 else Decimal(max(0, checks - failures) * 100) / checks
        return TrainingCardResult(
            session_scheduled_card_id=item.id,
            score=score.quantize(Decimal("0.01")),
            passed=failures == 0,
            discrepancies=discrepancies,
        )

    async def _card_state(
        self, session: AsyncSession, card: IncidentCard
    ) -> dict[str, Any]:
        feature = await session.get(CardFeature, card.id)
        services = (
            await session.execute(
                select(CardService, EmergencyService)
                .join(EmergencyService, EmergencyService.id == CardService.service_id)
                .where(CardService.card_id == card.id, CardService.is_active.is_(True))
                .order_by(EmergencyService.code)
            )
        ).all()
        return {
            "event_type_id": card.event_type_id,
            "description": card.description,
            "questionnaire": card.questionnaire,
            "reported_address": card.reported_address,
            "incident_address": card.incident_address,
            "victims_count": card.victims_count,
            "current_status": card.current_status,
            "features": (
                {
                    "event_kind_id": feature.event_kind_id,
                    "first_order_feature_id": feature.first_order_feature_id,
                    "second_order_feature_id": feature.second_order_feature_id,
                    "third_order_feature_id": feature.third_order_feature_id,
                    "additional_features": feature.additional_features,
                }
                if feature
                else None
            ),
            "services": [service.code for _, service in services],
            "service_statuses": {
                service.code: card_service.current_status
                for card_service, service in services
            },
        }

    @classmethod
    def _compare_expected(
        cls,
        expected: Any,
        actual: Any,
        path: str,
        discrepancies: list[dict[str, Any]],
    ) -> int:
        if isinstance(expected, dict):
            checks = 0
            actual_dict = actual if isinstance(actual, dict) else {}
            for key, value in expected.items():
                child_path = f"{path}.{key}" if path else key
                checks += cls._compare_expected(
                    value, actual_dict.get(key), child_path, discrepancies
                )
            return checks
        if isinstance(expected, list) and isinstance(actual, list):
            matches = sorted(expected, key=str) == sorted(actual, key=str)
        else:
            matches = expected == actual
        if not matches:
            discrepancies.append(
                {"path": path, "expected": expected, "actual": actual, "reason": "value_mismatch"}
            )
        return 1

    @classmethod
    def _dict_contains(cls, actual: dict[str, Any], expected: dict[str, Any]) -> bool:
        for key, value in expected.items():
            if key not in actual:
                return False
            if isinstance(value, dict):
                if not isinstance(actual[key], dict) or not cls._dict_contains(actual[key], value):
                    return False
            elif actual[key] != value:
                return False
        return True

    async def _validate_template_references(
        self, session: AsyncSession, definition: ScenarioDefinition
    ) -> None:
        for card in definition.cards:
            if card.source_type is ScenarioCardSourceType.TEMPLATE:
                template = await session.get(CardTemplate, card.template_id)
                if template is None or not template.is_active:
                    raise ValidationError(f"Inactive or missing card template: {card.template_id}")

    async def _require_user_role(
        self,
        session: AsyncSession,
        user_id: uuid.UUID,
        roles: set[UserRole],
    ) -> UserAccount:
        user = await session.get(UserAccount, user_id)
        if user is None or user.is_blocked:
            raise ValidationError("Unknown or blocked user")
        if user.role not in {role.value for role in roles}:
            raise ValidationError("User role is not allowed for this operation")
        return user

    @staticmethod
    def _validate_participant_range(mode: str, minimum: int, maximum: int) -> None:
        if maximum < minimum:
            raise ValidationError("max_participants must not be lower than min_participants")
        if mode == WorkspaceMode.INDIVIDUAL.value and (minimum != 1 or maximum != 1):
            raise ValidationError("INDIVIDUAL scenario requires exactly one participant")
