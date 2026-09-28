from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import or_, select

from s112.api.schemas import CardCreate, OperatorClassification
from s112.api.simulation_schemas import (
    CardTemplateCreate,
    ExpectedCardState,
    ExpectedResult,
    ExpectedServiceStatusChange,
    IncomingCallTemplateCreate,
    InitialIncomingCall,
)
from s112.api.simulation_service import (
    CARD_TEMPLATE_REVIEW_SECTIONS,
    INCOMING_CALL_TEMPLATE_REVIEW_SECTIONS,
    SimulationApplicationService,
)
from s112.classifier_reference import classifier_records
from s112.common.config import Settings
from s112.common.database import Database
from s112.common.enums import (
    CardStatus,
    ServiceResponseStatus,
    SourceType,
    TemplateGenerationStatus,
    TemplateStatus,
)
from s112.domain.models import CardTemplateGeneration
from s112.semantic_evaluation.rules import OutboundCallRule
from s112.template_generation.client import (
    GeneratedIncidentFacts,
    TemplateGenerationClient,
    applicant_gender,
)


logger = logging.getLogger(__name__)

PRIMARY_SERVICE_BY_DDS = {
    "101": "MCHS",
    "102": "Police",
    "103": "AMBULANCE",
    "104": "MOSGAZ",
}
RESPONSE_UNIT_BY_DDS = {
    "101": "Пожарный расчёт",
    "102": "Наряд полиции",
    "103": "Бригада скорой медицинской помощи",
    "104": "Аварийная газовая бригада",
}
SYNTHETIC_INCIDENT_ADDRESSES = (
    "г. Москва, Учебный проезд, д. 10",
    "г. Москва, Тренировочная улица, д. 7",
    "г. Москва, Учебный бульвар, д. 15",
    "г. Москва, Тренировочный переулок, д. 4",
)
COMPLEX_CLASSIFIER_MARKERS = (
    "минут",
    "час",
    "суток",
    "свыше",
    "менее",
    "до прибытия",
    "после ",
)
CURATED_CLASSIFIER_RECORDS_BY_DDS = {
    "101": (1010101, 1010102, 1010201),
    "102": (2010100, 2010200, 2010400),
    "103": (22010000, 22150000, 22520000),
    "104": (13010400, 13020100, 13020300),
}
SEMANTIC_MARKER_GROUPS_BY_CLASSIFIER = {
    1010101: (("мусор",), ("плам", "горит", "возгоран")),
    1010102: (("мусор",), ("дым", "задым")),
    1010201: (("трав",), ("плам", "горит", "возгоран")),
    2010100: (("дтп", "авари", "столк"), ("легков",)),
    2010200: (("дтп", "авари", "столк"), ("обществен", "автобус")),
    2010400: (("дтп", "авари", "столк"), ("грузов",)),
    22010000: (("аллерг",),),
    22150000: (("головн",), ("бол",)),
    22520000: (("температур", "жар"),),
    13010400: (("запах",), ("газ",), ("улиц",)),
    13020100: (("запах",), ("газ",), ("кухн",)),
    13020300: (("запах",), ("газ",), ("частн",), ("дом",)),
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CardTemplateGenerationWorker:
    def __init__(
        self,
        database: Database,
        settings: Settings,
        client: TemplateGenerationClient,
    ) -> None:
        self.database = database
        self.settings = settings
        self.client = client
        self.service = SimulationApplicationService(settings.kafka_topic)
        self._stopped = asyncio.Event()

    def stop(self) -> None:
        self._stopped.set()

    async def run_forever(self) -> None:
        while not self._stopped.is_set():
            try:
                processed = await self.run_once()
            except Exception:
                logger.exception("Card template generation worker iteration failed")
                processed = False
            if not processed:
                try:
                    await asyncio.wait_for(
                        self._stopped.wait(),
                        timeout=self.settings.template_generation_poll_interval_seconds,
                    )
                except TimeoutError:
                    pass

    async def run_once(self) -> bool:
        generation = await self._claim_generation()
        if generation is None:
            return False
        try:
            record = self._select_classifier_record(
                generation.id, generation.dds_service_codes[0]
            )
            phone_number = self._synthetic_phone_number(generation.id)
            incident_address = self._synthetic_incident_address(generation.id)
            required_applicant_gender = (
                "male" if generation.id.int % 2 == 0 else "female"
            )
            facts = await self.client.generate(
                classifier_record=record,
                dds_service_codes=list(generation.dds_service_codes),
                automatic_phone_number=phone_number,
                required_incident_address=incident_address,
                required_applicant_gender=required_applicant_gender,
            )
            self._validate_generated_facts(record, facts)
            await self._save_generated_templates(
                generation.id,
                record,
                facts,
                phone_number,
            )
        except Exception as exc:
            logger.exception("Card template generation %s failed", generation.id)
            await self._record_failure(generation.id, str(exc))
        return True

    async def _claim_generation(self) -> CardTemplateGeneration | None:
        stale_before = utcnow() - timedelta(
            seconds=self.settings.template_generation_stale_seconds
        )
        async with self.database.write_session_factory() as session:
            async with session.begin():
                exhausted = await session.scalar(
                    select(CardTemplateGeneration)
                    .where(
                        CardTemplateGeneration.status
                        == TemplateGenerationStatus.PROCESSING.value,
                        CardTemplateGeneration.started_at < stale_before,
                        CardTemplateGeneration.attempts
                        >= self.settings.template_generation_retry_limit,
                    )
                    .order_by(CardTemplateGeneration.created_at)
                    .with_for_update(skip_locked=True)
                    .limit(1)
                )
                if exhausted is not None:
                    exhausted.status = TemplateGenerationStatus.FAILED.value
                    exhausted.completed_at = utcnow()
                    exhausted.last_error = (
                        exhausted.last_error
                        or "Template generation worker stopped during the final attempt"
                    )
                generation = await session.scalar(
                    select(CardTemplateGeneration)
                    .where(
                        or_(
                            CardTemplateGeneration.status
                            == TemplateGenerationStatus.PENDING.value,
                            (
                                CardTemplateGeneration.status
                                == TemplateGenerationStatus.PROCESSING.value
                            )
                            & (CardTemplateGeneration.started_at < stale_before),
                        ),
                        CardTemplateGeneration.attempts
                        < self.settings.template_generation_retry_limit,
                    )
                    .order_by(CardTemplateGeneration.created_at)
                    .with_for_update(skip_locked=True)
                    .limit(1)
                )
                if generation is None:
                    return None
                generation.status = TemplateGenerationStatus.PROCESSING.value
                generation.attempts += 1
                generation.started_at = utcnow()
                generation.completed_at = None
                generation.last_error = None
                await session.flush()
                return generation

    def _select_classifier_record(
        self, generation_id: uuid.UUID, primary_dds_code: str
    ) -> dict[str, Any]:
        records = classifier_records()
        curated = [
            records[record_id]
            for record_id in CURATED_CLASSIFIER_RECORDS_BY_DDS[primary_dds_code]
            if record_id in records
        ]
        if curated:
            return curated[generation_id.int % len(curated)]

        primary_service = PRIMARY_SERVICE_BY_DDS[primary_dds_code]
        candidates = [
            record
            for record in records.values()
            if record.get("primary_service") == primary_service
            and isinstance(record.get("final_incident_type"), str)
            and record["final_incident_type"].strip()
        ]
        specific = [
            record
            for record in candidates
            if "проч" not in record["final_incident_type"].lower()
            and "консульта" not in record["final_incident_type"].lower()
        ]
        candidates = specific or candidates
        uncomplicated = [
            record
            for record in candidates
            if not any(
                marker in " ".join(
                    str(record.get(field) or "").casefold()
                    for field in (
                        "feature_1",
                        "feature_2",
                        "feature_3",
                        "additional_features",
                        "final_incident_type",
                    )
                )
                for marker in COMPLEX_CLASSIFIER_MARKERS
            )
        ]
        candidates = uncomplicated or candidates
        if not candidates:
            raise ValueError(
                f"Classifier has no records for primary DDS {primary_dds_code}"
            )
        candidates.sort(key=lambda item: int(item["classifier_number"]))
        return candidates[generation_id.int % len(candidates)]

    @staticmethod
    def _synthetic_phone_number(generation_id: uuid.UUID) -> str:
        suffix = generation_id.int % 10_000_000
        return f"+7000{suffix:07d}"

    @staticmethod
    def _synthetic_incident_address(generation_id: uuid.UUID) -> str:
        return SYNTHETIC_INCIDENT_ADDRESSES[
            generation_id.int % len(SYNTHETIC_INCIDENT_ADDRESSES)
        ]

    def _voice_id_for_facts(self, facts: GeneratedIncidentFacts) -> str:
        male_voice_id = self.settings.template_generation_male_voice_id
        female_voice_id = self.settings.template_generation_female_voice_id
        if male_voice_id == female_voice_id:
            raise ValueError("Male and female template voices must be different")
        return (
            male_voice_id
            if applicant_gender(facts.applicant_full_name) == "male"
            else female_voice_id
        )

    @staticmethod
    def _validate_generated_facts(
        record: dict[str, Any], facts: GeneratedIncidentFacts
    ) -> None:
        classifier_text = " ".join(
            str(record.get(field) or "").casefold()
            for field in (
                "feature_1",
                "feature_2",
                "feature_3",
                "additional_features",
                "final_incident_type",
            )
        )
        description = facts.description.casefold()
        unsupported_markers = {
            "запах газа": "запах",
            "взрыв": "взрыв",
            "пламя": "плам",
            "задымление": "дым",
        }
        unsupported = [
            phrase
            for phrase, classifier_marker in unsupported_markers.items()
            if phrase in description and classifier_marker not in classifier_text
        ]
        if unsupported:
            raise ValueError(
                "Generated description adds facts absent from classifier: "
                + ", ".join(unsupported)
            )
        response_markers = (
            "полиция прибыла",
            "наряд прибыл",
            "бригада прибыла",
            "расчёт прибыл",
            "служба приехала",
        )
        if any(marker in description for marker in response_markers):
            raise ValueError(
                "Generated description must not contain completed response actions"
            )
        classifier_number = int(record["classifier_number"])
        missing_marker_groups = [
            "/".join(group)
            for group in SEMANTIC_MARKER_GROUPS_BY_CLASSIFIER.get(
                classifier_number, ()
            )
            if not any(marker in description for marker in group)
        ]
        if missing_marker_groups:
            raise ValueError(
                "Generated description does not express the selected classifier: "
                + ", ".join(missing_marker_groups)
            )
        generated_text = f"{facts.initial_utterance} {facts.description}".casefold()
        forbidden_markers = {
            1010101: ("квартир", "помещен", "кухн", "подъезд"),
            1010102: ("квартир", "помещен", "кухн", "подъезд"),
            1010201: ("квартир", "помещен", "кухн", "подъезд"),
            13010400: ("квартир", "помещен", "кухн", "подъезд"),
        }
        contradictions = [
            marker
            for marker in forbidden_markers.get(classifier_number, ())
            if marker in generated_text
        ]
        if contradictions:
            raise ValueError(
                "Generated incident contradicts the selected classifier: "
                + ", ".join(contradictions)
            )
        if record.get("primary_service") == "AMBULANCE" and (
            facts.victims_count < 1
            or "без пострадав" in generated_text
            or "пострадавших нет" in generated_text
        ):
            raise ValueError(
                "Medical incident must contain at least one victim"
            )
        if "без пострадав" in classifier_text and facts.victims_count != 0:
            raise ValueError(
                "Classifier without victims requires victims_count=0"
            )

    async def _save_generated_templates(
        self,
        generation_id: uuid.UUID,
        record: dict[str, Any],
        facts: GeneratedIncidentFacts,
        phone_number: str,
    ) -> None:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                generation = await session.scalar(
                    select(CardTemplateGeneration)
                    .where(CardTemplateGeneration.id == generation_id)
                    .with_for_update()
                )
                if (
                    generation is None
                    or generation.status != TemplateGenerationStatus.PROCESSING.value
                ):
                    return
                classification = self._classification(record)
                incoming_request = self._incoming_call_request(
                    generation.created_by,
                    list(generation.dds_service_codes),
                    facts,
                    classification,
                    phone_number,
                )
                incoming = await self.service.create_incoming_call_template(
                    session, incoming_request
                )
                incoming.status = TemplateStatus.DRAFT.value
                incoming.generated_by_ai = True
                incoming.ai_review_state = {
                    section: "AI_PROPOSED"
                    for section in INCOMING_CALL_TEMPLATE_REVIEW_SECTIONS
                }
                incoming.generation_id = generation.id

                card_template_ids: list[str] = []
                for service_code in generation.dds_service_codes:
                    request = self._dds_card_request(
                        generation.created_by,
                        service_code,
                        facts,
                        classification,
                        phone_number,
                    )
                    card = await self.service.create_template(session, request)
                    card.status = TemplateStatus.DRAFT.value
                    card.generated_by_ai = True
                    card.ai_review_state = {
                        section: "AI_PROPOSED"
                        for section in CARD_TEMPLATE_REVIEW_SECTIONS
                    }
                    card.generation_id = generation.id
                    card_template_ids.append(str(card.id))

                generation.incoming_call_template_id = incoming.id
                generation.card_template_ids = card_template_ids
                generation.status = TemplateGenerationStatus.COMPLETED.value
                generation.completed_at = utcnow()
                generation.last_error = None
                await session.flush()

    async def _record_failure(self, generation_id: uuid.UUID, error: str) -> None:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                generation = await session.scalar(
                    select(CardTemplateGeneration)
                    .where(CardTemplateGeneration.id == generation_id)
                    .with_for_update()
                )
                if generation is None:
                    return
                generation.last_error = error[:4_000]
                if generation.attempts >= self.settings.template_generation_retry_limit:
                    generation.status = TemplateGenerationStatus.FAILED.value
                    generation.completed_at = utcnow()
                else:
                    generation.status = TemplateGenerationStatus.PENDING.value
                    generation.started_at = None
                await session.flush()

    @staticmethod
    def _classification(record: dict[str, Any]) -> OperatorClassification:
        return OperatorClassification(
            record_id=int(record["classifier_number"]),
            group_code=int(record["group_code"]),
            feature_1_code=int(record["feature_1_code"]),
            feature_2_code=int(record["feature_2_code"]),
            feature_3_code=int(record["feature_3_code"]),
            final_incident_type=record["final_incident_type"],
            routing_flags={},
            excluded_service_codes=[],
        )

    @staticmethod
    def _common_card_fields(
        facts: GeneratedIncidentFacts,
        classification: OperatorClassification,
        phone_number: str,
    ) -> dict[str, Any]:
        return {
            "classification": classification,
            "description": facts.description,
            "questionnaire": None,
            "applicant_full_name": facts.applicant_full_name,
            "automatic_phone_number": phone_number,
            "provided_phone_number": phone_number,
            "location_phone_number": None,
            "reported_address": facts.reported_address,
            "incident_address": facts.incident_address,
            "victims_count": facts.victims_count,
        }

    def _incoming_call_request(
        self,
        created_by: uuid.UUID,
        service_codes: list[str],
        facts: GeneratedIncidentFacts,
        classification: OperatorClassification,
        phone_number: str,
    ) -> IncomingCallTemplateCreate:
        expected_card = ExpectedCardState(
            **self._common_card_fields(facts, classification, phone_number),
            current_status=CardStatus.REGISTERED,
            services=service_codes,
            service_statuses={
                code: ServiceResponseStatus.ADDED for code in service_codes
            },
        )
        return IncomingCallTemplateCreate(
            name=f"112: {facts.title}",
            description=facts.training_description,
            difficulty=facts.difficulty,
            voice_id=self._voice_id_for_facts(facts),
            initial_call=InitialIncomingCall(
                initial_utterance=facts.initial_utterance,
                automatic_phone_number=phone_number,
            ),
            expected_result=ExpectedResult(card=expected_card),
            created_by=created_by,
        )

    def _dds_card_request(
        self,
        created_by: uuid.UUID,
        service_code: str,
        facts: GeneratedIncidentFacts,
        classification: OperatorClassification,
        phone_number: str,
    ) -> CardTemplateCreate:
        common = self._common_card_fields(facts, classification, phone_number)
        unit_name = RESPONSE_UNIT_BY_DDS[service_code]
        unit_number = f"Учебный-{service_code}-01"
        history = [
            ExpectedServiceStatusChange(status=ServiceResponseStatus.RECEIVED),
            ExpectedServiceStatusChange(
                status=ServiceResponseStatus.ACCEPTED,
                comment=f"{unit_name} направлен к месту происшествия.",
            ),
            ExpectedServiceStatusChange(
                status=ServiceResponseStatus.RESPONSE_STARTED,
                comment=f"{unit_name} выехал к месту происшествия.",
                unit_number=unit_number,
            ),
            ExpectedServiceStatusChange(
                status=ServiceResponseStatus.ARRIVED,
                comment=f"{unit_name} прибыл по указанному адресу.",
                unit_number=unit_number,
            ),
            ExpectedServiceStatusChange(
                status=ServiceResponseStatus.WORK_IN_PROGRESS,
                comment=f"{unit_name} приступил к работе на месте.",
                unit_number=unit_number,
            ),
            ExpectedServiceStatusChange(
                status=ServiceResponseStatus.WORK_COMPLETED,
                comment=f"Работы службы {service_code} завершены.",
                unit_number=unit_number,
            ),
        ]
        initial_card = CardCreate(source_type=SourceType.CALL, **common)
        expected_card = ExpectedCardState(
            **common,
            current_status=CardStatus.COMPLETED,
            services=[service_code],
            service_statuses={
                service_code: ServiceResponseStatus.WORK_COMPLETED
            },
        )
        return CardTemplateCreate(
            name=f"ДДС-{service_code}: {facts.title}",
            description=facts.training_description,
            difficulty=facts.difficulty,
            voice_id=self._voice_id_for_facts(facts),
            initial_card=initial_card,
            expected_result=ExpectedResult(
                card=expected_card,
                outbound_call=OutboundCallRule(
                    expected_text=(
                        f"{facts.description} Адрес происшествия: "
                        f"{facts.incident_address}."
                    ),
                    minimum_similarity=0.8,
                ),
                service_status_history={service_code: history},
            ),
            created_by=created_by,
        )
