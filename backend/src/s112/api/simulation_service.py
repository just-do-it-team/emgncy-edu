from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from s112.api.schemas import CardCreate
from s112.api.scenario_completion import (
    CompletionNotReadyError,
    ScenarioCompletionService,
)
from s112.api.service import ConflictError, NotFoundError, ValidationError
from s112.api.simulation_schemas import (
    CardTemplateCreate,
    CardTemplateDeleteRequest,
    ExpertAssessmentUpdate,
    GroupScenarioAssignmentCreate,
    LearningGroupCreate,
    LearningGroupMembersUpdate,
    LearningGroupUpdate,
    IncomingCallTemplateCreate,
    IncomingCallTemplateDeleteRequest,
    ScenarioAssignmentCreate,
    ScenarioDefinition,
    ScenarioDeleteRequest,
    ScenarioSnapshot,
    TrainingScenarioCreate,
    TrainingScenarioUpdate,
    TrainingCallActionRequest,
    TrainingCallCardLinkRequest,
    TrainingDiscrepancy,
    strip_scenario_card_runtime_fields,
)
from s112.common.enums import (
    AssignmentStatus,
    LaunchPolicy,
    ParticipantStatus,
    ProceduralGenerationStatus,
    ScenarioCardSourceType,
    ScenarioCompletionPolicy,
    ScenarioItemType,
    ScenarioMode,
    ScenarioStatus,
    ScenarioTriggerType,
    ScheduledCardStatus,
    TrainingActionResult,
    TrainingCallStatus,
    TrainingSessionStatus,
    UserRole,
    WorkspaceMemberRole,
    WorkspaceMode,
    WorkspaceStatus,
)
from s112.domain.models import (
    AudioMessage,
    AssignmentBatch,
    AssignmentParticipant,
    CardFeature,
    CardService,
    CardTemplate,
    EmergencyService,
    IncidentCard,
    IncomingCallTemplate,
    LearningGroup,
    LearningGroupMember,
    OutboxEvent,
    ScenarioAssignment,
    SessionScheduledCard,
    SimulationWorkspace,
    TrainingAction,
    TrainingCall,
    TrainingCardResult,
    TrainingScenario,
    TrainingSession,
    UserAccount,
    WorkspaceMember,
)
from s112.semantic_evaluation.rules import (
    EVALUATION_RESULT_ACTION,
    outbound_call_rule,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


PROCEDURAL_PRESETS: dict[int, dict[str, int]] = {
    1: {"initial_delay_seconds": 5, "release_interval_seconds": 180, "max_active": 1},
    2: {"initial_delay_seconds": 5, "release_interval_seconds": 120, "max_active": 1},
    3: {"initial_delay_seconds": 5, "release_interval_seconds": 90, "max_active": 2},
    4: {"initial_delay_seconds": 0, "release_interval_seconds": 60, "max_active": 3},
    5: {"initial_delay_seconds": 0, "release_interval_seconds": 30, "max_active": 4},
}


class SimulationApplicationService:
    def __init__(self, topic: str = "card.events") -> None:
        self.topic = topic
        self.completion = ScenarioCompletionService(topic)

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

    async def delete_template(
        self,
        session: AsyncSession,
        template_id: uuid.UUID,
        request: CardTemplateDeleteRequest,
    ) -> None:
        await self._require_user_role(
            session, request.deleted_by, {UserRole.TEACHER, UserRole.ADMINISTRATOR}
        )
        template = await session.scalar(
            select(CardTemplate)
            .where(CardTemplate.id == template_id)
            .with_for_update()
        )
        if template is None:
            raise NotFoundError("Card template not found")
        if not template.is_active:
            return

        scenarios = list(
            await session.scalars(
                select(TrainingScenario).where(
                    TrainingScenario.status != ScenarioStatus.ARCHIVED.value
                )
            )
        )
        for scenario in scenarios:
            definition = ScenarioDefinition.model_validate(scenario.definition)
            if any(
                item.item_type is ScenarioItemType.INCIDENT_CARD
                and item.source_type is ScenarioCardSourceType.TEMPLATE
                and item.template_id == template.id
                for item in definition.cards
            ):
                raise ConflictError(
                    "Card template is referenced by an active training scenario"
                )
            generator = definition.procedural_generation
            if (
                generator is not None
                and generator.template_pool.template_ids is not None
                and template.id in generator.template_pool.template_ids
            ):
                raise ConflictError(
                    "Card template is referenced by an active procedural scenario"
                )
        template.is_active = False
        await session.flush()

    async def create_incoming_call_template(
        self, session: AsyncSession, request: IncomingCallTemplateCreate
    ) -> IncomingCallTemplate:
        await self._require_user_role(
            session, request.created_by, {UserRole.TEACHER, UserRole.ADMINISTRATOR}
        )
        template_key = request.template_key or uuid.uuid4()
        existing = await session.scalar(
            select(IncomingCallTemplate.id).where(
                IncomingCallTemplate.template_key == template_key,
                IncomingCallTemplate.version == request.version,
            )
        )
        if existing is not None:
            raise ConflictError("This incoming call template version already exists")

        template = IncomingCallTemplate(
            template_key=template_key,
            version=request.version,
            name=request.name,
            description=request.description,
            difficulty=request.difficulty,
            initial_call=request.initial_call.model_dump(mode="json"),
            expected_result=request.expected_result.model_dump(mode="json"),
            created_by=request.created_by,
        )
        session.add(template)
        await session.flush()
        return template

    async def delete_incoming_call_template(
        self,
        session: AsyncSession,
        template_id: uuid.UUID,
        request: IncomingCallTemplateDeleteRequest,
    ) -> None:
        await self._require_user_role(
            session, request.deleted_by, {UserRole.TEACHER, UserRole.ADMINISTRATOR}
        )
        template = await session.scalar(
            select(IncomingCallTemplate)
            .where(IncomingCallTemplate.id == template_id)
            .with_for_update()
        )
        if template is None:
            raise NotFoundError("Incoming call template not found")
        if not template.is_active:
            return

        scenarios = list(
            await session.scalars(
                select(TrainingScenario).where(
                    TrainingScenario.status != ScenarioStatus.ARCHIVED.value
                )
            )
        )
        for scenario in scenarios:
            definition = ScenarioDefinition.model_validate(scenario.definition)
            if any(
                item.item_type is ScenarioItemType.INCOMING_CALL
                and item.source_type is ScenarioCardSourceType.TEMPLATE
                and item.template_id == template.id
                for item in definition.cards
            ):
                raise ConflictError(
                    "Incoming call template is referenced by an active training scenario"
                )
        template.is_active = False
        await session.flush()

    async def create_scenario(
        self, session: AsyncSession, request: TrainingScenarioCreate
    ) -> TrainingScenario:
        await self._require_user_role(
            session, request.created_by, {UserRole.TEACHER, UserRole.ADMINISTRATOR}
        )
        await self._validate_template_references(
            session, request.definition, request.difficulty
        )
        procedural_count = (
            request.definition.procedural_generation.target_count
            if request.definition.procedural_generation is not None
            else 0
        )
        scenario = TrainingScenario(
            name=request.name,
            description=request.description,
            difficulty=request.difficulty,
            estimated_duration_seconds=request.estimated_duration_seconds,
            cards_count=len(request.definition.cards) + procedural_count,
            workspace_mode=request.workspace_mode.value,
            completion_policy=self._resolve_completion_policy(
                request.workspace_mode.value,
                request.completion_policy.value if request.completion_policy else None,
            ),
            min_participants=request.min_participants,
            max_participants=request.max_participants,
            definition=strip_scenario_card_runtime_fields(
                request.definition.model_dump(mode="json", exclude_none=True)
            ),
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
        if scenario.status != ScenarioStatus.DRAFT.value:
            raise ConflictError("Only a draft scenario can be edited")
        if request.status is ScenarioStatus.ARCHIVED:
            raise ValidationError("Use the scenario delete endpoint to archive a scenario")

        values = request.model_dump(
            exclude={
                "expected_revision",
                "updated_by",
                "definition",
                "completion_policy",
            },
            exclude_unset=True,
        )
        for field, value in values.items():
            if hasattr(value, "value"):
                value = value.value
            setattr(scenario, field, value)
        if request.completion_policy is not None:
            scenario.completion_policy = request.completion_policy.value
        elif request.workspace_mode is not None:
            scenario.completion_policy = self._resolve_completion_policy(
                scenario.workspace_mode, None
            )
        if request.definition is not None:
            await self._validate_template_references(
                session, request.definition, scenario.difficulty
            )
            scenario.definition = strip_scenario_card_runtime_fields(
                request.definition.model_dump(mode="json", exclude_none=True)
            )
            scenario.cards_count = len(request.definition.cards) + (
                request.definition.procedural_generation.target_count
                if request.definition.procedural_generation is not None
                else 0
            )
        elif request.difficulty is not None:
            await self._validate_template_references(
                session,
                ScenarioDefinition.model_validate(scenario.definition),
                scenario.difficulty,
            )

        self._validate_participant_range(
            scenario.workspace_mode,
            scenario.min_participants,
            scenario.max_participants,
        )
        self._resolve_completion_policy(
            scenario.workspace_mode, scenario.completion_policy
        )
        scenario.updated_by = request.updated_by
        scenario.revision += 1
        await session.flush()
        return scenario

    async def delete_scenario(
        self,
        session: AsyncSession,
        scenario_id: uuid.UUID,
        request: ScenarioDeleteRequest,
    ) -> None:
        await self._require_user_role(
            session, request.deleted_by, {UserRole.TEACHER, UserRole.ADMINISTRATOR}
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
        if scenario.status == ScenarioStatus.ARCHIVED.value:
            return
        scenario.status = ScenarioStatus.ARCHIVED.value
        scenario.updated_by = request.deleted_by
        scenario.revision += 1
        await session.flush()

    async def create_learning_group(
        self, session: AsyncSession, request: LearningGroupCreate
    ) -> LearningGroup:
        await self._require_user_role(
            session, request.teacher_id, {UserRole.TEACHER, UserRole.ADMINISTRATOR}
        )
        for student_id in request.student_ids:
            await self._require_user_role(session, student_id, {UserRole.STUDENT})
        existing = await session.scalar(
            select(LearningGroup.id).where(
                LearningGroup.teacher_id == request.teacher_id,
                LearningGroup.name == request.name.strip(),
            )
        )
        if existing is not None:
            raise ConflictError("A learning group with this name already exists")
        group = LearningGroup(
            name=request.name.strip(),
            description=request.description,
            teacher_id=request.teacher_id,
            is_active=True,
        )
        session.add(group)
        await session.flush()
        session.add_all(
            [
                LearningGroupMember(group_id=group.id, student_id=student_id)
                for student_id in request.student_ids
            ]
        )
        await session.flush()
        return group

    async def update_learning_group(
        self,
        session: AsyncSession,
        group_id: uuid.UUID,
        request: LearningGroupUpdate,
    ) -> LearningGroup:
        group = await self._require_group_owner(session, group_id, request.actor_id)
        values = request.model_dump(exclude={"actor_id"}, exclude_unset=True)
        for field, value in values.items():
            if field == "name" and value is not None:
                value = value.strip()
                duplicate = await session.scalar(
                    select(LearningGroup.id).where(
                        LearningGroup.teacher_id == group.teacher_id,
                        LearningGroup.name == value,
                        LearningGroup.id != group.id,
                    )
                )
                if duplicate is not None:
                    raise ConflictError("A learning group with this name already exists")
            setattr(group, field, value)
        await session.flush()
        return group

    async def add_learning_group_members(
        self,
        session: AsyncSession,
        group_id: uuid.UUID,
        request: LearningGroupMembersUpdate,
    ) -> LearningGroup:
        group = await self._require_group_owner(session, group_id, request.actor_id)
        if not group.is_active:
            raise ConflictError("Learning group is archived")
        for student_id in request.student_ids:
            await self._require_user_role(session, student_id, {UserRole.STUDENT})
            member = await session.get(LearningGroupMember, (group_id, student_id))
            if member is None:
                session.add(
                    LearningGroupMember(group_id=group_id, student_id=student_id)
                )
            else:
                member.removed_at = None
                member.joined_at = utcnow()
        await session.flush()
        return group

    async def remove_learning_group_member(
        self,
        session: AsyncSession,
        group_id: uuid.UUID,
        student_id: uuid.UUID,
        actor_id: uuid.UUID,
    ) -> None:
        await self._require_group_owner(session, group_id, actor_id)
        member = await session.get(LearningGroupMember, (group_id, student_id))
        if member is None or member.removed_at is not None:
            raise NotFoundError("Active learning group member not found")
        member.removed_at = utcnow()
        await session.flush()

    async def create_group_assignment(
        self,
        session: AsyncSession,
        group_id: uuid.UUID,
        request: GroupScenarioAssignmentCreate,
    ) -> tuple[AssignmentBatch, list[ScenarioAssignment]]:
        group = await self._require_group_owner(session, group_id, request.assigned_by)
        if not group.is_active:
            raise ConflictError("Learning group is archived")
        student_ids = list(
            await session.scalars(
                select(LearningGroupMember.student_id)
                .where(
                    LearningGroupMember.group_id == group_id,
                    LearningGroupMember.removed_at.is_(None),
                )
                .order_by(LearningGroupMember.student_id)
            )
        )
        if not student_ids:
            raise ValidationError("Learning group has no active students")
        unknown_positions = set(request.participant_positions) - set(student_ids)
        if unknown_positions:
            raise ValidationError(
                "participant_positions contains users outside the learning group"
            )
        missing_positions = set(student_ids) - set(request.participant_positions)
        if missing_positions:
            raise ValidationError(
                "participant_positions must contain every active group member"
            )
        scenario = await session.get(TrainingScenario, request.scenario_id)
        if scenario is None:
            raise NotFoundError("Training scenario not found")
        if (
            scenario.workspace_mode == WorkspaceMode.INDIVIDUAL.value
            and request.launch_policy is not LaunchPolicy.STUDENT_SELF_START
        ):
            raise ValidationError(
                "Individual group assignments require STUDENT_SELF_START"
            )
        if (
            scenario.workspace_mode == WorkspaceMode.INDIVIDUAL.value
            and request.incoming_call_operators
        ):
            raise ValidationError(
                "Incoming call operators are assigned automatically in individual scenarios"
            )
        if (
            scenario.workspace_mode == WorkspaceMode.SHARED.value
            and request.launch_policy is not LaunchPolicy.TEACHER_START
        ):
            raise ValidationError("Shared group assignments require TEACHER_START")
        if scenario.workspace_mode == WorkspaceMode.SHARED.value and len(student_ids) > 100:
            raise ValidationError("A shared assignment supports at most 100 participants")

        batch = AssignmentBatch(
            group_id=group_id,
            scenario_id=request.scenario_id,
            assigned_by=request.assigned_by,
            launch_policy=request.launch_policy.value,
            max_attempts=request.max_attempts,
            available_from=request.available_from,
            due_at=request.due_at,
        )
        session.add(batch)
        await session.flush()

        assignments: list[ScenarioAssignment] = []
        participant_sets = (
            [[student_id] for student_id in student_ids]
            if scenario.workspace_mode == WorkspaceMode.INDIVIDUAL.value
            else [student_ids]
        )
        for participant_ids in participant_sets:
            assignment = await self.create_assignment(
                session,
                ScenarioAssignmentCreate(
                    scenario_id=request.scenario_id,
                    participant_ids=participant_ids,
                    participant_positions={
                        student_id: request.participant_positions[student_id]
                        for student_id in participant_ids
                        if student_id in request.participant_positions
                    },
                    incoming_call_operators=(
                        request.incoming_call_operators
                        if scenario.workspace_mode == WorkspaceMode.SHARED.value
                        else {}
                    ),
                    assigned_by=request.assigned_by,
                    launch_policy=request.launch_policy,
                    max_attempts=request.max_attempts,
                    available_from=request.available_from,
                    due_at=request.due_at,
                ),
            )
            assignment.assignment_batch_id = batch.id
            assignments.append(assignment)
        await session.flush()
        return batch, assignments

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
        if (
            scenario.workspace_mode == WorkspaceMode.SHARED.value
            and request.launch_policy is not LaunchPolicy.TEACHER_START
        ):
            raise ValidationError("Shared scenarios currently require TEACHER_START")

        definition = ScenarioDefinition.model_validate(scenario.definition)
        operator_ids = {
            participant_id
            for participant_id in request.participant_ids
            if request.participant_positions[participant_id] is None
        }
        call_keys = {
            item.key
            for item in definition.cards
            if item.item_type is ScenarioItemType.INCOMING_CALL
        }
        if call_keys and not operator_ids:
            raise ValidationError("An incoming-call scenario needs an operator 112")
        unknown_call_keys = set(request.incoming_call_operators) - call_keys
        if unknown_call_keys:
            raise ValidationError("incoming_call_operators contains unknown call keys")
        if len(operator_ids) > 1 and call_keys - set(request.incoming_call_operators):
            raise ValidationError(
                "Assign every incoming call to an operator 112 when several are participating"
            )
        if any(
            user_id not in operator_ids
            for user_id in request.incoming_call_operators.values()
        ):
            raise ValidationError("Incoming calls must be assigned to participating operators 112")
        assigned_call_operators = dict(request.incoming_call_operators)
        if len(operator_ids) == 1:
            sole_operator = next(iter(operator_ids))
            for call_key in call_keys:
                assigned_call_operators.setdefault(call_key, sole_operator)
        for participant_id in request.participant_ids:
            await self._require_user_role(session, participant_id, {UserRole.STUDENT})
            position_code = request.participant_positions[participant_id]
            if position_code is not None:
                service = await session.scalar(
                    select(EmergencyService).where(
                        EmergencyService.code == position_code,
                        EmergencyService.is_active.is_(True),
                    )
                )
                if service is None:
                    raise ValidationError(
                        f"Unknown or inactive participant service: {position_code}"
                    )

        resolved_cards: list[dict[str, Any]] = []
        for item in definition.cards:
            raw = item.model_dump(mode="json", exclude_none=True)
            if item.item_type is ScenarioItemType.INCOMING_CALL:
                raw["assigned_operator_user_id"] = str(assigned_call_operators[item.key])
            if item.source_type is ScenarioCardSourceType.TEMPLATE:
                if item.item_type is ScenarioItemType.INCOMING_CALL:
                    template = await session.get(IncomingCallTemplate, item.template_id)
                    if template is None or not template.is_active:
                        raise ValidationError(
                            f"Inactive or missing incoming call template: {item.template_id}"
                        )
                    raw["source_type"] = ScenarioCardSourceType.SNAPSHOT.value
                    raw["template_id"] = str(template.id)
                    raw["template_key"] = str(template.template_key)
                    raw["template_version"] = template.version
                    raw["initial_call"] = {
                        "initial_utterance": template.initial_call["initial_utterance"]
                    }
                    raw["expected_result"] = dict(template.expected_result)
                else:
                    template = await session.get(CardTemplate, item.template_id)
                    if template is None or not template.is_active:
                        raise ValidationError(
                            f"Inactive or missing card template: {item.template_id}"
                        )
                    raw["source_type"] = ScenarioCardSourceType.SNAPSHOT.value
                    raw["template_id"] = str(template.id)
                    raw["template_key"] = str(template.template_key)
                    raw["template_version"] = template.version
                    raw["initial_card"] = dict(template.initial_card)
                    raw["expected_result"] = dict(template.expected_result)
                    raw["evaluation_rules"] = {
                        **template.evaluation_rules,
                        **item.evaluation_rules,
                    }
            else:
                raw["source_type"] = ScenarioCardSourceType.SNAPSHOT.value
            if item.item_type is ScenarioItemType.INCIDENT_CARD:
                raw["initial_card"].pop("workspace_id", None)
                raw["initial_card"].pop("request_id", None)
            resolved_cards.append(raw)

        procedural_catalog: list[dict[str, Any]] = []
        if definition.procedural_generation is not None:
            templates = await self._procedural_templates(
                session, definition, scenario.difficulty
            )
            for template in templates:
                initial_card = dict(template.initial_card)
                initial_card.pop("workspace_id", None)
                initial_card.pop("request_id", None)
                procedural_catalog.append(
                    {
                        "template_id": str(template.id),
                        "template_key": str(template.template_key),
                        "template_version": template.version,
                        "difficulty": template.difficulty,
                        "initial_card": initial_card,
                        "expected_result": dict(template.expected_result),
                        "evaluation_rules": dict(template.evaluation_rules),
                    }
                )

        snapshot = {
            "scenario_id": str(scenario.id),
            "scenario_revision": scenario.revision,
            "name": scenario.name,
            "description": scenario.description,
            "difficulty": scenario.difficulty,
            "estimated_duration_seconds": scenario.estimated_duration_seconds,
            "workspace_mode": scenario.workspace_mode,
            "completion_policy": scenario.completion_policy,
            "min_participants": scenario.min_participants,
            "max_participants": scenario.max_participants,
            "definition": {
                "schema_version": definition.schema_version,
                "mode": definition.mode.value,
                "cards": resolved_cards,
                "procedural_generation": (
                    definition.procedural_generation.model_dump(
                        mode="json", exclude_none=True
                    )
                    if definition.procedural_generation is not None
                    else None
                ),
                "procedural_catalog": procedural_catalog,
            },
        }
        ScenarioSnapshot.model_validate(snapshot)
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
                    position_code=request.participant_positions.get(participant_id),
                )
                for participant_id in request.participant_ids
            ]
        )
        await session.flush()
        return assignment

    async def mark_participant_ready(
        self,
        session: AsyncSession,
        assignment_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> AssignmentParticipant:
        assignment = await session.scalar(
            select(ScenarioAssignment)
            .where(ScenarioAssignment.id == assignment_id)
            .with_for_update()
        )
        if assignment is None:
            raise NotFoundError("Scenario assignment not found")
        if assignment.workspace_mode != WorkspaceMode.SHARED.value:
            raise ValidationError("Readiness is only used for shared scenarios")
        if assignment.status != AssignmentStatus.ASSIGNED.value:
            raise ConflictError("Scenario assignment is not awaiting participants")
        participant = await session.get(AssignmentParticipant, (assignment_id, user_id))
        if participant is None:
            raise ValidationError("User is not assigned to this scenario")
        await self._require_user_role(session, user_id, {UserRole.STUDENT})
        now = utcnow()
        if assignment.available_from and now < _as_utc(assignment.available_from):
            raise ConflictError("Assignment is not available yet")
        if assignment.due_at and now > _as_utc(assignment.due_at):
            raise ConflictError("Assignment deadline has passed")
        if participant.status == ParticipantStatus.READY.value:
            return participant
        if participant.status != ParticipantStatus.ASSIGNED.value:
            raise ConflictError("Participant cannot become ready from the current status")
        participant.status = ParticipantStatus.READY.value
        participant.ready_at = now
        await session.flush()
        return participant

    async def start_individual_assignment(
        self,
        session: AsyncSession,
        assignment_id: uuid.UUID,
        user_id: uuid.UUID,
        idempotency_key: str,
    ) -> tuple[TrainingSession, SimulationWorkspace, bool]:
        candidate = await session.get(ScenarioAssignment, assignment_id)
        if (
            candidate is not None
            and candidate.workspace_mode == WorkspaceMode.SHARED.value
        ):
            return await self._start_shared_assignment(
                session, candidate.id, user_id, idempotency_key
            )
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
        await self._assert_participants_not_running(session, [user_id])
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
            completion_policy=self._snapshot_completion_policy(assignment),
            started_at=now,
            result={},
            generation_state=self._initial_generation_state(
                assignment.scenario_snapshot, now
            ),
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
                position_code=participant.position_code,
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
        started_action_id = uuid.uuid4()
        session.add(
            TrainingAction(
                id=started_action_id,
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
        self._add_monitoring_outbox(
            session,
            event_id=started_action_id,
            event_type="training.session_started",
            training_session=training_session,
            workspace_id=workspace.id,
            teacher_id=assignment.assigned_by,
            data={"attempt_number": training_session.attempt_number},
        )

        self._add_scheduled_items(
            session,
            training_session_id=training_session.id,
            workspace_id=workspace.id,
            items=assignment.scenario_snapshot["definition"]["cards"],
            started_at=now,
        )

        assignment.status = AssignmentStatus.RUNNING.value
        participant.status = ParticipantStatus.RUNNING.value
        await session.flush()
        return training_session, workspace, False

    async def _start_shared_assignment(
        self,
        session: AsyncSession,
        assignment_id: uuid.UUID,
        teacher_id: uuid.UUID,
        idempotency_key: str,
    ) -> tuple[TrainingSession, SimulationWorkspace, bool]:
        assignment = await session.scalar(
            select(ScenarioAssignment)
            .where(ScenarioAssignment.id == assignment_id)
            .with_for_update()
        )
        if assignment is None:
            raise NotFoundError("Scenario assignment not found")
        if assignment.assigned_by != teacher_id:
            raise ValidationError("Only the assigning teacher can start a shared scenario")
        await self._require_user_role(
            session, teacher_id, {UserRole.TEACHER, UserRole.ADMINISTRATOR}
        )
        if assignment.launch_policy != LaunchPolicy.TEACHER_START.value:
            raise ValidationError("A shared scenario currently requires TEACHER_START")

        existing = await session.scalar(
            select(TrainingSession).where(
                TrainingSession.assignment_id == assignment_id,
                TrainingSession.start_idempotency_key == idempotency_key,
            )
        )
        if existing is not None:
            workspace = await session.scalar(
                select(SimulationWorkspace).where(
                    SimulationWorkspace.training_session_id == existing.id
                )
            )
            if workspace is None:
                raise ConflictError("Idempotent session exists without a workspace")
            return existing, workspace, True
        if assignment.status in {
            AssignmentStatus.CANCELLED.value,
            AssignmentStatus.EXPIRED.value,
        }:
            raise ConflictError(f"Assignment is {assignment.status.lower()}")
        if assignment.status == AssignmentStatus.COMPLETED.value:
            raise ConflictError("Assignment is completed")

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
        participants = list(
            await session.scalars(
                select(AssignmentParticipant)
                .where(AssignmentParticipant.assignment_id == assignment.id)
                .order_by(AssignmentParticipant.user_id)
            )
        )
        if not participants:
            raise ConflictError("Shared assignment has no participants")
        if any(participant.status != ParticipantStatus.READY.value for participant in participants):
            raise ConflictError("All shared-scenario participants must confirm readiness")
        await self._assert_participants_not_running(
            session, [participant.user_id for participant in participants]
        )

        training_session = TrainingSession(
            assignment_id=assignment.id,
            attempt_number=attempts + 1,
            start_idempotency_key=idempotency_key,
            status=TrainingSessionStatus.RUNNING.value,
            completion_policy=self._snapshot_completion_policy(assignment),
            started_at=now,
            result={},
            generation_state=self._initial_generation_state(
                assignment.scenario_snapshot, now
            ),
        )
        session.add(training_session)
        await session.flush()
        workspace = SimulationWorkspace(
            training_session_id=training_session.id,
            mode=WorkspaceMode.SHARED.value,
            status=WorkspaceStatus.ACTIVE.value,
            activated_at=now,
        )
        session.add(workspace)
        await session.flush()
        session.add_all(
            [
                WorkspaceMember(
                    workspace_id=workspace.id,
                    user_id=participant.user_id,
                    member_role=WorkspaceMemberRole.PARTICIPANT.value,
                    position_code=participant.position_code,
                )
                for participant in participants
            ]
        )
        session.add(
            WorkspaceMember(
                workspace_id=workspace.id,
                user_id=teacher_id,
                member_role=WorkspaceMemberRole.INSTRUCTOR.value,
            )
        )
        started_action_id = uuid.uuid4()
        session.add(
            TrainingAction(
                id=started_action_id,
                training_session_id=training_session.id,
                workspace_id=workspace.id,
                actor_user_id=teacher_id,
                action_type="SESSION_STARTED",
                entity_type="training_session",
                entity_id=str(training_session.id),
                occurred_at=now,
                request_id=(
                    f"session-start:{uuid.uuid5(uuid.NAMESPACE_URL, idempotency_key)}"
                ),
                result=TrainingActionResult.SUCCESS.value,
                details={
                    "attempt_number": training_session.attempt_number,
                    "participants_count": len(participants),
                },
            )
        )
        self._add_monitoring_outbox(
            session,
            event_id=started_action_id,
            event_type="training.session_started",
            training_session=training_session,
            workspace_id=workspace.id,
            teacher_id=teacher_id,
            data={
                "attempt_number": training_session.attempt_number,
                "participants_count": len(participants),
            },
        )

        self._add_scheduled_items(
            session,
            training_session_id=training_session.id,
            workspace_id=workspace.id,
            items=assignment.scenario_snapshot["definition"]["cards"],
            started_at=now,
        )
        assignment.status = AssignmentStatus.RUNNING.value
        for participant in participants:
            participant.status = ParticipantStatus.RUNNING.value
        await session.flush()
        return training_session, workspace, False

    async def complete_session(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
        user_id: uuid.UUID | None,
        *,
        automatic: bool = False,
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
        if automatic:
            if (
                training_session.completion_policy
                != ScenarioCompletionPolicy.AUTO_WHEN_READY.value
            ):
                raise ValidationError("This session is not configured for automatic completion")
        else:
            if user_id is None:
                raise ValidationError("user_id is required for manual completion")
            member = await session.get(WorkspaceMember, (workspace.id, user_id))
            if member is None or member.left_at is not None:
                raise ValidationError("User is not a member of this workspace")
            if (
                training_session.completion_policy
                == ScenarioCompletionPolicy.TEACHER_ONLY.value
                and member.member_role != WorkspaceMemberRole.INSTRUCTOR.value
            ):
                raise ValidationError("Only the instructor can complete this session")
            if (
                training_session.completion_policy
                == ScenarioCompletionPolicy.STUDENT_CONFIRM.value
                and member.member_role != WorkspaceMemberRole.PARTICIPANT.value
            ):
                raise ValidationError("Only a participant can complete this session")
            if (
                training_session.completion_policy
                == ScenarioCompletionPolicy.AUTO_WHEN_READY.value
            ):
                raise ConflictError("This session completes automatically when ready")

        readiness, _ = await self.completion.refresh(session, training_session)
        if not readiness["can_complete"]:
            raise CompletionNotReadyError(readiness)

        scheduled_cards = list(
            await session.scalars(
                select(SessionScheduledCard)
                .where(SessionScheduledCard.training_session_id == training_session.id)
                .order_by(SessionScheduledCard.scenario_card_key)
            )
        )
        training_calls = list(
            await session.scalars(
                select(TrainingCall)
                .where(TrainingCall.training_session_id == training_session.id)
                .order_by(TrainingCall.scenario_item_key)
            )
        )
        if any(
            item.status != ScheduledCardStatus.EMITTED.value
            or item.incident_card_id is None
            for item in scheduled_cards
        ) or any(
            item.status != TrainingCallStatus.COMPLETED.value
            or item.incident_card_id is None
            for item in training_calls
        ):
            raise CompletionNotReadyError(readiness)
        score, passed, result = await self._evaluate_session_work(
            session, scheduled_cards, training_calls
        )
        now = utcnow()
        training_session.status = TrainingSessionStatus.COMPLETED.value
        training_session.completed_at = now
        training_session.completion_state_revision += 1
        training_session.completion_state = {
            **(training_session.completion_state or {}),
            "status": TrainingSessionStatus.COMPLETED.value,
            "can_complete": False,
            "revision": training_session.completion_state_revision,
        }
        training_session.score = score.quantize(Decimal("0.01"))
        training_session.passed = passed
        training_session.result = result
        training_session.completed_automatically = automatic
        workspace.status = WorkspaceStatus.READ_ONLY.value
        workspace.closed_at = now
        completed_action_id = uuid.uuid4()
        session.add(
            TrainingAction(
                id=completed_action_id,
                training_session_id=training_session.id,
                workspace_id=workspace.id,
                actor_user_id=user_id,
                action_type="SESSION_COMPLETED",
                entity_type="training_session",
                entity_id=str(training_session.id),
                occurred_at=now,
                request_id=f"session-complete:{training_session.id}",
                result=TrainingActionResult.SUCCESS.value,
                details={
                    "score": float(training_session.score),
                    "passed": passed,
                    "completed_automatically": automatic,
                },
            )
        )

        assignment = await session.get(ScenarioAssignment, training_session.assignment_id)
        if assignment is not None:
            if passed or training_session.attempt_number >= assignment.max_attempts:
                assignment.status = AssignmentStatus.COMPLETED.value
            else:
                assignment.status = AssignmentStatus.ASSIGNED.value
            participants = list(
                await session.scalars(
                    select(AssignmentParticipant).where(
                        AssignmentParticipant.assignment_id == assignment.id
                    )
                )
            )
            for participant in participants:
                if assignment.status == AssignmentStatus.COMPLETED.value:
                    participant.status = ParticipantStatus.COMPLETED.value
                    participant.completed_at = now
                else:
                    participant.status = ParticipantStatus.ASSIGNED.value
                    participant.ready_at = None
            self._add_monitoring_outbox(
                session,
                event_id=completed_action_id,
                event_type="training.session_completed",
                training_session=training_session,
                workspace_id=workspace.id,
                teacher_id=assignment.assigned_by,
                data={
                    "score": float(training_session.score),
                    "passed": passed,
                    "completed_automatically": automatic,
                },
            )
        await session.flush()
        return training_session

    async def _evaluate_session_work(
        self,
        session: AsyncSession,
        scheduled_cards: list[SessionScheduledCard],
        training_calls: list[TrainingCall],
    ) -> tuple[Decimal, bool, dict[str, Any]]:
        card_results: list[dict[str, Any]] = []
        call_results: list[dict[str, Any]] = []
        total_score = Decimal("0")
        for item in scheduled_cards:
            if item.status != ScheduledCardStatus.EMITTED.value or item.incident_card_id is None:
                continue
            result = await self._evaluate_card(session, item)
            session.add(result)
            total_score += result.score
            card_results.append(
                {
                    "scenario_card_key": item.scenario_card_key,
                    "incident_card_id": str(item.incident_card_id),
                    "score": float(result.score),
                    "passed": result.passed,
                    "discrepancies": result.discrepancies,
                }
            )
        for item in training_calls:
            if item.status != TrainingCallStatus.COMPLETED.value or item.incident_card_id is None:
                continue
            result = await self._evaluate_incoming_call(session, item)
            total_score += result["score"]
            call_results.append(
                {
                    "scenario_item_key": item.scenario_item_key,
                    "training_call_id": str(item.id),
                    "incident_card_id": str(item.incident_card_id),
                    "score": float(result["score"]),
                    "passed": result["passed"],
                    "discrepancies": result["discrepancies"],
                }
            )
        evaluated_count = len(card_results) + len(call_results)
        score = total_score / evaluated_count if evaluated_count else Decimal("0")
        passed = evaluated_count > 0 and all(
            item["passed"] for item in [*card_results, *call_results]
        )
        return score, passed, {"cards": card_results, "incoming_calls": call_results}

    async def abort_individual_session(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> TrainingSession:
        training_session = await session.scalar(
            select(TrainingSession)
            .where(TrainingSession.id == session_id)
            .with_for_update()
        )
        if training_session is None:
            raise NotFoundError("Training session not found")
        assignment = await session.get(ScenarioAssignment, training_session.assignment_id)
        if assignment is None or assignment.workspace_mode != WorkspaceMode.INDIVIDUAL.value:
            raise ValidationError("Only an individual training session can be aborted here")
        workspace = await session.scalar(
            select(SimulationWorkspace).where(
                SimulationWorkspace.training_session_id == training_session.id
            )
        )
        if workspace is None:
            raise ConflictError("Training session workspace is missing")
        member = await session.get(WorkspaceMember, (workspace.id, user_id))
        if (
            member is None
            or member.left_at is not None
            or member.member_role != WorkspaceMemberRole.PARTICIPANT.value
        ):
            raise ValidationError("Only the session participant can abort this session")
        await self._require_user_role(session, user_id, {UserRole.STUDENT})
        if training_session.status == TrainingSessionStatus.ABORTED.value:
            return training_session
        if training_session.status != TrainingSessionStatus.RUNNING.value:
            raise ConflictError("Only a running session can be aborted")

        readiness = await self.completion.calculate(
            session, training_session, workspace=workspace
        )
        scheduled_cards = list(
            await session.scalars(
                select(SessionScheduledCard)
                .where(SessionScheduledCard.training_session_id == session_id)
                .order_by(SessionScheduledCard.scenario_card_key)
            )
        )
        training_calls = list(
            await session.scalars(
                select(TrainingCall)
                .where(TrainingCall.training_session_id == session_id)
                .order_by(TrainingCall.scenario_item_key)
            )
        )
        score, work_passed, result = await self._evaluate_session_work(
            session, scheduled_cards, training_calls
        )
        passed = readiness["can_complete"] and work_passed
        now = utcnow()
        training_session.status = TrainingSessionStatus.ABORTED.value
        training_session.completed_at = now
        training_session.ready_to_complete_at = None
        training_session.completion_state = {}
        training_session.score = score.quantize(Decimal("0.01"))
        training_session.passed = passed
        training_session.result = result
        workspace.status = WorkspaceStatus.READ_ONLY.value
        workspace.closed_at = now
        await session.execute(
            update(SessionScheduledCard)
            .where(
                SessionScheduledCard.training_session_id == session_id,
                SessionScheduledCard.status == ScheduledCardStatus.PENDING.value,
            )
            .values(status=ScheduledCardStatus.CANCELLED.value)
        )
        await session.execute(
            update(TrainingCall)
            .where(
                TrainingCall.training_session_id == session_id,
                TrainingCall.status.in_(
                    [
                        TrainingCallStatus.PENDING.value,
                        TrainingCallStatus.RINGING.value,
                        TrainingCallStatus.ACTIVE.value,
                    ]
                ),
            )
            .values(status=TrainingCallStatus.CANCELLED.value)
        )
        assignment.status = (
            AssignmentStatus.COMPLETED.value
            if passed or training_session.attempt_number >= assignment.max_attempts
            else AssignmentStatus.ASSIGNED.value
        )
        participants = list(
            await session.scalars(
                select(AssignmentParticipant).where(
                    AssignmentParticipant.assignment_id == assignment.id
                )
            )
        )
        for participant in participants:
            if assignment.status == AssignmentStatus.COMPLETED.value:
                participant.status = ParticipantStatus.COMPLETED.value
                participant.completed_at = now
            else:
                participant.status = ParticipantStatus.ASSIGNED.value
                participant.ready_at = None
        action_id = uuid.uuid4()
        session.add(
            TrainingAction(
                id=action_id,
                training_session_id=session_id,
                workspace_id=workspace.id,
                actor_user_id=user_id,
                action_type="SESSION_ABORTED",
                entity_type="training_session",
                entity_id=str(session_id),
                occurred_at=now,
                request_id=f"session-abort:{session_id}",
                result=TrainingActionResult.SUCCESS.value,
                details={
                    "score": float(training_session.score),
                    "passed": passed,
                },
            )
        )
        self._add_monitoring_outbox(
            session,
            event_id=action_id,
            event_type="training.session_aborted",
            training_session=training_session,
            workspace_id=workspace.id,
            teacher_id=assignment.assigned_by,
            data={"score": float(training_session.score), "passed": passed},
        )
        await session.flush()
        return training_session

    async def abort_shared_session(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
        teacher_id: uuid.UUID,
        reason: str,
    ) -> TrainingSession:
        training_session = await session.scalar(
            select(TrainingSession)
            .where(TrainingSession.id == session_id)
            .with_for_update()
        )
        if training_session is None:
            raise NotFoundError("Training session not found")
        assignment = await session.get(ScenarioAssignment, training_session.assignment_id)
        if assignment is None or assignment.workspace_mode != WorkspaceMode.SHARED.value:
            raise ValidationError("Only a shared training session can be aborted here")
        if assignment.assigned_by != teacher_id:
            raise ValidationError("Only the assigning teacher can abort this session")
        await self._require_user_role(
            session, teacher_id, {UserRole.TEACHER, UserRole.ADMINISTRATOR}
        )
        if training_session.status == TrainingSessionStatus.ABORTED.value:
            return training_session
        if training_session.status != TrainingSessionStatus.RUNNING.value:
            raise ConflictError("Only a running session can be aborted")
        workspace = await session.scalar(
            select(SimulationWorkspace).where(
                SimulationWorkspace.training_session_id == training_session.id
            )
        )
        if workspace is None:
            raise ConflictError("Training session workspace is missing")

        now = utcnow()
        training_session.status = TrainingSessionStatus.ABORTED.value
        training_session.completed_at = now
        training_session.ready_to_complete_at = None
        training_session.completion_state = {}
        workspace.status = WorkspaceStatus.READ_ONLY.value
        workspace.closed_at = now
        await session.execute(
            update(SessionScheduledCard)
            .where(
                SessionScheduledCard.training_session_id == session_id,
                SessionScheduledCard.status == ScheduledCardStatus.PENDING.value,
            )
            .values(status=ScheduledCardStatus.CANCELLED.value)
        )
        await session.execute(
            update(TrainingCall)
            .where(
                TrainingCall.training_session_id == session_id,
                TrainingCall.status.in_(
                    [
                        TrainingCallStatus.PENDING.value,
                        TrainingCallStatus.RINGING.value,
                        TrainingCallStatus.ACTIVE.value,
                    ]
                ),
            )
            .values(status=TrainingCallStatus.CANCELLED.value)
        )
        assignment.status = (
            AssignmentStatus.COMPLETED.value
            if training_session.attempt_number >= assignment.max_attempts
            else AssignmentStatus.ASSIGNED.value
        )
        participants = list(
            await session.scalars(
                select(AssignmentParticipant).where(
                    AssignmentParticipant.assignment_id == assignment.id
                )
            )
        )
        for participant in participants:
            participant.status = (
                ParticipantStatus.COMPLETED.value
                if assignment.status == AssignmentStatus.COMPLETED.value
                else ParticipantStatus.ASSIGNED.value
            )
            participant.ready_at = None
            if assignment.status == AssignmentStatus.COMPLETED.value:
                participant.completed_at = now
        action_id = uuid.uuid4()
        session.add(
            TrainingAction(
                id=action_id,
                training_session_id=session_id,
                workspace_id=workspace.id,
                actor_user_id=teacher_id,
                action_type="SESSION_ABORTED",
                entity_type="training_session",
                entity_id=str(session_id),
                occurred_at=now,
                request_id=f"session-abort:{session_id}",
                result=TrainingActionResult.SUCCESS.value,
                details={"reason": reason},
            )
        )
        self._add_monitoring_outbox(
            session,
            event_id=action_id,
            event_type="training.session_aborted",
            training_session=training_session,
            workspace_id=workspace.id,
            teacher_id=teacher_id,
            data={"reason": reason},
        )
        await session.flush()
        return training_session

    async def update_expert_assessment(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
        request: ExpertAssessmentUpdate,
    ) -> TrainingSession:
        await self._require_user_role(
            session, request.teacher_id, {UserRole.TEACHER, UserRole.ADMINISTRATOR}
        )
        training_session = await session.scalar(
            select(TrainingSession)
            .where(TrainingSession.id == session_id)
            .with_for_update()
        )
        if training_session is None:
            raise NotFoundError("Training session not found")
        if training_session.status != TrainingSessionStatus.COMPLETED.value:
            raise ConflictError("Only a completed training session can be assessed")
        assignment = await session.get(ScenarioAssignment, training_session.assignment_id)
        if assignment is None:
            raise ConflictError("Scenario assignment is missing")
        teacher = await session.get(UserAccount, request.teacher_id)
        if (
            teacher is None
            or teacher.role != UserRole.ADMINISTRATOR.value
        ) and assignment.assigned_by != request.teacher_id:
            raise ValidationError("Teacher does not own this assignment")
        workspace = await session.scalar(
            select(SimulationWorkspace).where(
                SimulationWorkspace.training_session_id == training_session.id
            )
        )
        if workspace is None:
            raise ConflictError("Training session workspace is missing")

        now = utcnow()
        training_session.expert_score = request.score.quantize(Decimal("0.01"))
        training_session.expert_passed = request.passed
        training_session.expert_comment = request.comment
        training_session.expert_evaluated_by = request.teacher_id
        training_session.expert_evaluated_at = now
        action_id = uuid.uuid4()
        session.add(
            TrainingAction(
                id=action_id,
                training_session_id=training_session.id,
                workspace_id=workspace.id,
                actor_user_id=request.teacher_id,
                action_type="EXPERT_ASSESSMENT_UPDATED",
                entity_type="training_session",
                entity_id=str(training_session.id),
                occurred_at=now,
                request_id=f"expert-assessment:{training_session.id}:{now.isoformat()}",
                result=TrainingActionResult.SUCCESS.value,
                details={
                    "score": float(training_session.expert_score),
                    "passed": request.passed,
                    "has_comment": request.comment is not None,
                },
            )
        )
        self._add_monitoring_outbox(
            session,
            event_id=action_id,
            event_type="training.expert_assessment_updated",
            training_session=training_session,
            workspace_id=workspace.id,
            teacher_id=assignment.assigned_by,
            data={
                "score": float(training_session.expert_score),
                "passed": request.passed,
            },
        )
        await session.flush()
        return training_session

    async def build_expert_review_context(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
        teacher_id: uuid.UUID,
    ) -> dict[str, Any]:
        await self._require_user_role(
            session, teacher_id, {UserRole.TEACHER, UserRole.ADMINISTRATOR}
        )
        training_session = await session.get(TrainingSession, session_id)
        if training_session is None:
            raise NotFoundError("Training session not found")
        if training_session.status != TrainingSessionStatus.COMPLETED.value:
            raise ConflictError("Expert review is available after session completion")
        assignment = await session.get(ScenarioAssignment, training_session.assignment_id)
        if assignment is None:
            raise ConflictError("Scenario assignment is missing")
        teacher = await session.get(UserAccount, teacher_id)
        if (
            teacher is None
            or teacher.role != UserRole.ADMINISTRATOR.value
        ) and assignment.assigned_by != teacher_id:
            raise ValidationError("Teacher does not own this assignment")

        participant_ids = list(
            await session.scalars(
                select(AssignmentParticipant.user_id)
                .where(AssignmentParticipant.assignment_id == assignment.id)
                .order_by(AssignmentParticipant.user_id)
            )
        )
        actions = list(
            await session.scalars(
                select(TrainingAction)
                .where(TrainingAction.training_session_id == training_session.id)
                .order_by(TrainingAction.occurred_at, TrainingAction.id)
            )
        )
        scheduled_cards = list(
            await session.scalars(
                select(SessionScheduledCard)
                .where(SessionScheduledCard.training_session_id == training_session.id)
                .order_by(SessionScheduledCard.scenario_card_key)
            )
        )
        cards: list[dict[str, Any]] = []
        for item in scheduled_cards:
            current_state: dict[str, Any] | None = None
            if item.incident_card_id is not None:
                card = await session.get(IncidentCard, item.incident_card_id)
                if card is not None:
                    current_state = await self._card_state(session, card)
            card_result = await session.scalar(
                select(TrainingCardResult).where(
                    TrainingCardResult.session_scheduled_card_id == item.id
                )
            )
            cards.append(
                {
                    "scenario_card_key": item.scenario_card_key,
                    "incident_card_id": item.incident_card_id,
                    "expected_result": item.expected_result,
                    "current_state": current_state,
                    "automatic_result": (
                        {
                            "score": float(card_result.score),
                            "passed": card_result.passed,
                            "discrepancies": card_result.discrepancies,
                            "evaluated_at": card_result.evaluated_at,
                        }
                        if card_result is not None
                        else None
                    ),
                }
            )
        training_calls = list(
            await session.scalars(
                select(TrainingCall)
                .where(TrainingCall.training_session_id == training_session.id)
                .order_by(TrainingCall.scenario_item_key)
            )
        )
        stored_call_results = {
            item.get("training_call_id"): item
            for item in (training_session.result or {}).get("incoming_calls", [])
        }
        incoming_calls: list[dict[str, Any]] = []
        for item in training_calls:
            current_state: dict[str, Any] | None = None
            if item.incident_card_id is not None:
                card = await session.get(IncidentCard, item.incident_card_id)
                if card is not None:
                    current_state = await self._card_state(session, card)
            incoming_calls.append(
                {
                    "scenario_item_key": item.scenario_item_key,
                    "training_call_id": item.id,
                    "incident_card_id": item.incident_card_id,
                    "status": item.status,
                    "expected_result": item.expected_result,
                    "current_state": current_state,
                    "automatic_result": stored_call_results.get(str(item.id)),
                }
            )
        return {
            "session": training_session,
            "scenario_snapshot": assignment.scenario_snapshot,
            "participant_ids": participant_ids,
            "cards": cards,
            "incoming_calls": incoming_calls,
            "actions": actions,
        }

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
            expected.get("card") or expected.get("final_state", {}),
            state,
            "card" if expected.get("card") else "",
            discrepancies,
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
        try:
            call_rule = outbound_call_rule(item.evaluation_rules, expected)
        except ValueError as exc:
            checks += 1
            rule_path = (
                "expected_result.outbound_call"
                if expected.get("outbound_call") is not None
                else "evaluation_rules.outbound_call"
            )
            discrepancies.append(
                {
                    "path": rule_path,
                    "expected": "VALID_RULE",
                    "actual": expected.get("outbound_call") or item.evaluation_rules.get("outbound_call"),
                    "reason": f"invalid_semantic_evaluation_rule: {exc}",
                }
            )
        else:
            if call_rule is not None:
                checks += 1
                evaluations = [
                    action
                    for action in actions
                    if action.action_type == EVALUATION_RESULT_ACTION
                ]
                successful = [
                    action
                    for action in evaluations
                    if action.result == TrainingActionResult.SUCCESS.value
                ]
                if not successful:
                    latest = evaluations[-1] if evaluations else None
                    discrepancies.append(
                        {
                            "path": (
                                "expected_result.outbound_call"
                                if expected.get("outbound_call") is not None
                                else "evaluation_rules.outbound_call"
                            ),
                            "expected": {
                                "minimum_similarity": call_rule.minimum_similarity,
                            },
                            "actual": latest.details if latest is not None else None,
                            "reason": (
                                "semantic_similarity_below_threshold"
                                if latest is not None
                                and latest.result
                                == TrainingActionResult.REJECTED.value
                                else "semantic_evaluation_failed"
                                if latest is not None
                                else "semantic_evaluation_missing"
                            ),
                        }
                    )

        position_codes = set(
            await session.scalars(
                select(WorkspaceMember.position_code).where(
                    WorkspaceMember.workspace_id == item.workspace_id,
                    WorkspaceMember.member_role
                    == WorkspaceMemberRole.PARTICIPANT.value,
                    WorkspaceMember.left_at.is_(None),
                    WorkspaceMember.position_code.is_not(None),
                )
            )
        )
        workspace = await session.get(SimulationWorkspace, item.workspace_id)
        if workspace is not None and workspace.mode == WorkspaceMode.SHARED.value:
            position_codes.clear()
        if position_codes:
            service_rows = (
                await session.execute(
                    select(CardService, EmergencyService)
                    .join(
                        EmergencyService,
                        EmergencyService.id == CardService.service_id,
                    )
                    .where(
                        CardService.card_id == item.incident_card_id,
                        CardService.is_active.is_(True),
                        EmergencyService.code.in_(position_codes),
                    )
                    .order_by(EmergencyService.code)
                )
            ).all()
            for card_service, emergency_service in service_rows:
                checks += 2
                if card_service.received_at is None:
                    discrepancies.append(
                        {
                            "path": f"service_handling.{emergency_service.code}.opened_at",
                            "expected": "OPENED",
                            "actual": None,
                            "reason": "card_not_opened",
                        }
                    )
                elif card_service.open_deadline_missed_at is not None:
                    discrepancies.append(
                        {
                            "path": f"service_handling.{emergency_service.code}.open_deadline",
                            "expected": "ON_TIME",
                            "actual": "MISSED",
                            "reason": "card_open_deadline_missed",
                        }
                    )
                if card_service.decided_at is None:
                    discrepancies.append(
                        {
                            "path": f"service_handling.{emergency_service.code}.decision",
                            "expected": "ACCEPTED_OR_REJECTED",
                            "actual": None,
                            "reason": "card_decision_missing",
                        }
                    )
                elif card_service.decision_deadline_missed_at is not None:
                    discrepancies.append(
                        {
                            "path": f"service_handling.{emergency_service.code}.decision_deadline",
                            "expected": "ON_TIME",
                            "actual": "MISSED",
                            "reason": "card_decision_deadline_missed",
                        }
                    )

        failures = len(discrepancies)
        score = Decimal("100") if checks == 0 else Decimal(max(0, checks - failures) * 100) / checks
        return TrainingCardResult(
            session_scheduled_card_id=item.id,
            score=score.quantize(Decimal("0.01")),
            passed=failures == 0,
            discrepancies=[
                TrainingDiscrepancy.model_validate(entry).model_dump(mode="json")
                for entry in discrepancies
            ],
        )

    async def _evaluate_incoming_call(
        self, session: AsyncSession, item: TrainingCall
    ) -> dict[str, Any]:
        card = await session.scalar(
            select(IncidentCard)
            .options(selectinload(IncidentCard.features))
            .where(IncidentCard.id == item.incident_card_id)
        )
        if card is None:
            raise ConflictError("Incident card created from the incoming call is missing")
        state = await self._card_state(session, card)
        expected = item.expected_result
        discrepancies: list[dict[str, Any]] = []
        checks = self._compare_expected(
            expected.get("card") or expected.get("final_state", {}),
            state,
            "card" if expected.get("card") else "",
            discrepancies,
        )
        matched = max(0, checks - len(discrepancies))
        score = Decimal("100") if checks == 0 else (
            Decimal(matched) * Decimal("100") / Decimal(checks)
        )
        return {
            "score": score.quantize(Decimal("0.01")),
            "passed": not discrepancies,
            "discrepancies": [
                TrainingDiscrepancy.model_validate(entry).model_dump(mode="json")
                for entry in discrepancies
            ],
        }

    async def answer_incoming_call(
        self,
        session: AsyncSession,
        call_id: uuid.UUID,
        request: TrainingCallActionRequest,
    ) -> TrainingCall:
        item, training_session = await self._training_call_context(
            session, call_id, request.user_id
        )
        if item.status == TrainingCallStatus.ACTIVE.value:
            if item.operator_user_id == request.user_id:
                return item
            raise ConflictError("Incoming call is already being handled by another operator")
        if item.status != TrainingCallStatus.RINGING.value:
            raise ConflictError(f"Incoming call cannot be answered from status {item.status}")
        now = utcnow()
        item.status = TrainingCallStatus.ACTIVE.value
        item.answered_at = now
        item.operator_user_id = request.user_id
        self._add_training_call_action(
            session,
            item,
            request.user_id,
            "INCOMING_CALL_ANSWERED",
            now,
        )
        await self.completion.refresh(session, training_session)
        return item

    async def link_incoming_call_card(
        self,
        session: AsyncSession,
        call_id: uuid.UUID,
        request: TrainingCallCardLinkRequest,
    ) -> TrainingCall:
        item, training_session = await self._training_call_context(
            session, call_id, request.user_id
        )
        if item.status != TrainingCallStatus.ACTIVE.value:
            raise ConflictError("Only an active incoming call can be linked to a card")
        card = await session.scalar(
            select(IncidentCard).where(
                IncidentCard.id == request.incident_card_id,
                IncidentCard.workspace_id == item.workspace_id,
            )
        )
        if card is None:
            raise NotFoundError("Incident card not found in the call workspace")
        if card.operator_id != request.user_id:
            raise ValidationError(
                "Only a card created by the answering student can be linked"
            )
        scheduled_card = await session.scalar(
            select(SessionScheduledCard.id).where(
                SessionScheduledCard.incident_card_id == card.id
            )
        )
        if scheduled_card is not None:
            raise ConflictError(
                "A pre-created scenario card cannot be linked to an incoming call"
            )
        if item.incident_card_id is not None:
            if item.incident_card_id == card.id:
                return item
            raise ConflictError("Incoming call is already linked to another card")
        existing_call = await session.scalar(
            select(TrainingCall.id).where(
                TrainingCall.incident_card_id == card.id,
                TrainingCall.id != item.id,
            )
        )
        if existing_call is not None:
            raise ConflictError("Incident card is already linked to another incoming call")
        item.incident_card_id = card.id
        await session.execute(
            update(AudioMessage)
            .where(
                AudioMessage.training_call_id == item.id,
                AudioMessage.incident_card_id.is_(None),
            )
            .values(incident_card_id=card.id)
        )
        self._add_training_call_action(
            session,
            item,
            request.user_id,
            "INCIDENT_CARD_CREATED_FROM_CALL",
            utcnow(),
            incident_card_id=card.id,
        )
        await self.completion.refresh(session, training_session)
        return item

    async def complete_incoming_call(
        self,
        session: AsyncSession,
        call_id: uuid.UUID,
        request: TrainingCallActionRequest,
    ) -> TrainingCall:
        item, training_session = await self._training_call_context(
            session, call_id, request.user_id
        )
        if item.status == TrainingCallStatus.COMPLETED.value:
            if item.operator_user_id == request.user_id:
                return item
            raise ConflictError("Incoming call belongs to another operator")
        if item.status != TrainingCallStatus.ACTIVE.value:
            raise ConflictError(f"Incoming call cannot complete from status {item.status}")
        if item.incident_card_id is None:
            raise ConflictError("Create and link an incident card before completing the call")
        now = utcnow()
        item.status = TrainingCallStatus.COMPLETED.value
        item.completed_at = now
        self._add_training_call_action(
            session,
            item,
            request.user_id,
            "INCOMING_CALL_COMPLETED",
            now,
            incident_card_id=item.incident_card_id,
        )
        await self.completion.refresh(session, training_session)
        return item

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

    async def _training_call_context(
        self,
        session: AsyncSession,
        call_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> tuple[TrainingCall, TrainingSession]:
        item = await session.scalar(
            select(TrainingCall)
            .where(TrainingCall.id == call_id)
            .with_for_update()
        )
        if item is None:
            raise NotFoundError("Incoming training call not found")
        member = await session.get(WorkspaceMember, (item.workspace_id, user_id))
        if (
            member is None
            or member.left_at is not None
            or member.member_role != WorkspaceMemberRole.PARTICIPANT.value
        ):
            raise ValidationError("Active student workspace membership is required")
        if member.position_code is not None:
            raise ValidationError("Operator 112 access is required for incoming calls")
        if (
            item.assigned_operator_user_id is not None
            and item.assigned_operator_user_id != user_id
        ):
            raise ValidationError("Incoming call is assigned to another operator 112")
        if item.operator_user_id is not None and item.operator_user_id != user_id:
            raise ConflictError("Incoming call is being handled by another operator")
        training_session = await session.get(TrainingSession, item.training_session_id)
        workspace = await session.get(SimulationWorkspace, item.workspace_id)
        if training_session is None or workspace is None:
            raise ConflictError("Incoming call training context is missing")
        if training_session.status != TrainingSessionStatus.RUNNING.value:
            raise ConflictError("Training session is not running")
        if workspace.status != WorkspaceStatus.ACTIVE.value:
            raise ConflictError("Training workspace is not active")
        return item, training_session

    @staticmethod
    def _add_training_call_action(
        session: AsyncSession,
        item: TrainingCall,
        actor_user_id: uuid.UUID,
        action_type: str,
        occurred_at: datetime,
        *,
        incident_card_id: uuid.UUID | None = None,
    ) -> None:
        session.add(
            TrainingAction(
                training_session_id=item.training_session_id,
                workspace_id=item.workspace_id,
                actor_user_id=actor_user_id,
                incident_card_id=incident_card_id,
                action_type=action_type,
                entity_type="training_call",
                entity_id=str(item.id),
                occurred_at=occurred_at,
                request_id=f"training-call:{item.id}:{action_type}",
                result=TrainingActionResult.SUCCESS.value,
                details={"scenario_item_key": item.scenario_item_key},
            )
        )

    async def _validate_template_references(
        self,
        session: AsyncSession,
        definition: ScenarioDefinition,
        scenario_difficulty: int,
    ) -> None:
        for item in definition.cards:
            if item.source_type is not ScenarioCardSourceType.TEMPLATE:
                continue
            if item.item_type is ScenarioItemType.INCOMING_CALL:
                template = await session.get(IncomingCallTemplate, item.template_id)
                if template is None or not template.is_active:
                    raise ValidationError(
                        f"Inactive or missing incoming call template: {item.template_id}"
                    )
            else:
                template = await session.get(CardTemplate, item.template_id)
                if template is None or not template.is_active:
                    raise ValidationError(
                        f"Inactive or missing card template: {item.template_id}"
                    )
        if definition.procedural_generation is not None:
            await self._procedural_templates(
                session, definition, scenario_difficulty
            )

    @staticmethod
    async def _procedural_templates(
        session: AsyncSession,
        definition: ScenarioDefinition,
        scenario_difficulty: int,
    ) -> list[CardTemplate]:
        generator = definition.procedural_generation
        if generator is None:
            return []
        pool = generator.template_pool
        statement = select(CardTemplate).where(
            CardTemplate.is_active.is_(True),
            CardTemplate.difficulty <= scenario_difficulty,
        )
        if pool.template_ids is not None:
            statement = statement.where(CardTemplate.id.in_(pool.template_ids))
        templates = list(
            await session.scalars(
                statement.order_by(CardTemplate.difficulty, CardTemplate.id)
            )
        )
        if pool.template_ids is not None:
            resolved_ids = {template.id for template in templates}
            missing = set(pool.template_ids) - resolved_ids
            if missing:
                formatted = ", ".join(sorted(str(item) for item in missing))
                raise ValidationError(
                    "Procedural template_ids contain missing, inactive, or too difficult "
                    f"templates: {formatted}"
                )
        if pool.event_type_ids is not None:
            event_type_ids = set(pool.event_type_ids)
            templates = [
                template
                for template in templates
                if template.initial_card.get("event_type_id") in event_type_ids
            ]
        if len(templates) < generator.target_count:
            raise ValidationError(
                "Procedural template pool must contain at least target_count "
                f"eligible unique templates; found {len(templates)}, "
                f"required {generator.target_count}"
            )
        return templates

    @staticmethod
    def _initial_generation_state(
        scenario_snapshot: dict[str, Any], started_at: datetime
    ) -> dict[str, Any]:
        definition = scenario_snapshot["definition"]
        generator = definition.get("procedural_generation")
        if generator is None:
            return {}
        difficulty = int(scenario_snapshot["difficulty"])
        preset = PROCEDURAL_PRESETS[difficulty]
        next_generation_at = started_at + timedelta(
            seconds=preset["initial_delay_seconds"]
        )
        return {
            "status": ProceduralGenerationStatus.RUNNING.value,
            "generator_key": generator["key"],
            "target_count": int(generator["target_count"]),
            "generated_count": 0,
            "max_active": preset["max_active"],
            "release_interval_seconds": preset["release_interval_seconds"],
            "next_generation_at": next_generation_at.isoformat(),
            "remaining_template_ids": [
                item["template_id"] for item in definition["procedural_catalog"]
            ],
        }

    @staticmethod
    def _add_scheduled_items(
        session: AsyncSession,
        *,
        training_session_id: uuid.UUID,
        workspace_id: uuid.UUID,
        items: list[dict[str, Any]],
        started_at: datetime,
    ) -> None:
        for item in items:
            trigger_type = item["trigger_type"]
            scheduled_at: datetime | None = None
            if trigger_type == ScenarioTriggerType.TIME_OFFSET.value:
                scheduled_at = started_at + timedelta(
                    seconds=int(item["trigger_config"]["offset_seconds"])
                )
            if item.get("item_type", ScenarioItemType.INCIDENT_CARD.value) == (
                ScenarioItemType.INCOMING_CALL.value
            ):
                session.add(
                    TrainingCall(
                        training_session_id=training_session_id,
                        workspace_id=workspace_id,
                        scenario_item_key=item["key"],
                        trigger_type=trigger_type,
                        trigger_config=item.get("trigger_config", {}),
                        source_type=ScenarioCardSourceType.SNAPSHOT.value,
                        call_payload=item["initial_call"],
                        assigned_operator_user_id=(
                            uuid.UUID(item["assigned_operator_user_id"])
                            if item.get("assigned_operator_user_id")
                            else None
                        ),
                        expected_result=item["expected_result"],
                        scheduled_at=scheduled_at,
                        status=TrainingCallStatus.PENDING.value,
                    )
                )
                continue
            session.add(
                SessionScheduledCard(
                    training_session_id=training_session_id,
                    workspace_id=workspace_id,
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
    async def _assert_participants_not_running(
        session: AsyncSession, participant_ids: list[uuid.UUID]
    ) -> None:
        await session.execute(
            select(UserAccount.id)
            .where(UserAccount.id.in_(participant_ids))
            .order_by(UserAccount.id)
            .with_for_update()
        )
        active_user = await session.scalar(
            select(AssignmentParticipant.user_id)
            .where(
                AssignmentParticipant.user_id.in_(participant_ids),
                AssignmentParticipant.status == ParticipantStatus.RUNNING.value,
            )
            .limit(1)
        )
        if active_user is not None:
            raise ConflictError("A participant already has an active training session")

    async def _require_group_owner(
        self,
        session: AsyncSession,
        group_id: uuid.UUID,
        actor_id: uuid.UUID,
    ) -> LearningGroup:
        actor = await self._require_user_role(
            session, actor_id, {UserRole.TEACHER, UserRole.ADMINISTRATOR}
        )
        group = await session.get(LearningGroup, group_id)
        if group is None:
            raise NotFoundError("Learning group not found")
        if (
            actor.role != UserRole.ADMINISTRATOR.value
            and group.teacher_id != actor_id
        ):
            raise ValidationError("Teacher does not own this learning group")
        return group

    def _add_monitoring_outbox(
        self,
        session: AsyncSession,
        *,
        event_id: uuid.UUID,
        event_type: str,
        training_session: TrainingSession,
        workspace_id: uuid.UUID,
        teacher_id: uuid.UUID,
        data: dict[str, Any],
    ) -> None:
        occurred_at = utcnow()
        session.add(
            OutboxEvent(
                id=uuid.uuid4(),
                aggregate_type="training_event",
                aggregate_id=str(event_id),
                aggregate_version=1,
                event_type=event_type,
                topic=self.topic,
                message_key=str(training_session.id),
                payload={
                    "event_id": str(event_id),
                    "event_type": event_type,
                    "aggregate_type": "training_session",
                    "aggregate_id": str(training_session.id),
                    "aggregate_version": training_session.attempt_number,
                    "workspace_id": str(workspace_id),
                    "teacher_id": str(teacher_id),
                    "teacher_ids": [str(teacher_id)],
                    "occurred_at": occurred_at.isoformat(),
                    "data": {
                        "session_id": str(training_session.id),
                        "assignment_id": str(training_session.assignment_id),
                        "workspace_id": str(workspace_id),
                        **data,
                    },
                },
            )
        )

    @staticmethod
    def _validate_participant_range(mode: str, minimum: int, maximum: int) -> None:
        if maximum < minimum:
            raise ValidationError("max_participants must not be lower than min_participants")
        if mode == WorkspaceMode.INDIVIDUAL.value and (minimum != 1 or maximum != 1):
            raise ValidationError("INDIVIDUAL scenario requires exactly one participant")

    @staticmethod
    def _resolve_completion_policy(mode: str, policy: str | None) -> str:
        if policy is None:
            return (
                ScenarioCompletionPolicy.TEACHER_ONLY.value
                if mode == WorkspaceMode.SHARED.value
                else ScenarioCompletionPolicy.STUDENT_CONFIRM.value
            )
        if (
            mode == WorkspaceMode.SHARED.value
            and policy != ScenarioCompletionPolicy.TEACHER_ONLY.value
        ):
            raise ValidationError("SHARED scenario requires TEACHER_ONLY completion policy")
        if (
            mode == WorkspaceMode.INDIVIDUAL.value
            and policy == ScenarioCompletionPolicy.TEACHER_ONLY.value
        ):
            raise ValidationError("INDIVIDUAL scenario cannot use TEACHER_ONLY completion policy")
        return policy

    @classmethod
    def _snapshot_completion_policy(cls, assignment: ScenarioAssignment) -> str:
        return cls._resolve_completion_policy(
            assignment.workspace_mode,
            assignment.scenario_snapshot.get("completion_policy"),
        )
