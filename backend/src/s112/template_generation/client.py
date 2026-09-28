from __future__ import annotations

import json
import re
from typing import Any, Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from s112.common.config import Settings


class TemplateGenerationError(RuntimeError):
    pass


ApplicantGender = Literal["male", "female"]


def applicant_gender(full_name: str) -> ApplicantGender:
    parts = full_name.split()
    if len(parts) != 3:
        raise ValueError("applicant_full_name must contain exactly three words")
    surname, _, patronymic = (part.casefold() for part in parts)
    if patronymic.endswith(("овна", "евна", "ична")):
        gender: ApplicantGender = "female"
    elif patronymic.endswith(("ович", "евич", "ич")):
        gender = "male"
    else:
        raise ValueError("applicant_full_name has an unrecognized patronymic")
    if gender == "female" and surname.endswith(
        ("ов", "ев", "ин", "ый", "ий", "ой")
    ):
        raise ValueError("applicant surname contradicts the female patronymic")
    if gender == "male" and surname.endswith(
        ("ова", "ева", "ина", "ая", "яя")
    ):
        raise ValueError("applicant surname contradicts the male patronymic")
    return gender


class GeneratedIncidentFacts(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=180)
    training_description: str = Field(min_length=1, max_length=2_000)
    initial_utterance: str = Field(min_length=1, max_length=10_000)
    description: str = Field(min_length=1, max_length=10_000)
    applicant_full_name: str = Field(min_length=1, max_length=255)
    reported_address: str = Field(min_length=1, max_length=2_000)
    incident_address: str = Field(min_length=1, max_length=2_000)
    victims_count: int = Field(ge=0, le=100)
    difficulty: int = Field(ge=1, le=4)

    @field_validator(
        "title",
        "training_description",
        "initial_utterance",
        "description",
        "applicant_full_name",
        "reported_address",
        "incident_address",
    )
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("generated text must not be blank")
        return normalized

    @model_validator(mode="after")
    def validate_incident_consistency(self) -> "GeneratedIncidentFacts":
        if self.incident_address.casefold() not in self.description.casefold():
            raise ValueError(
                "description must contain incident_address verbatim"
            )
        if "пострад" not in self.description.casefold():
            raise ValueError(
                "description must explicitly state whether there are victims"
            )
        applicant_gender(self.applicant_full_name)
        if not self.incident_address.casefold().startswith("г. москва,"):
            raise ValueError("incident_address must start with 'г. Москва,'")
        if self.reported_address != self.incident_address:
            raise ValueError(
                "reported_address must equal incident_address in generated templates"
            )
        forbidden_training_markers = (
            "классификац",
            "classifier",
            "response_scenario",
            "сценарию 13_",
            "служба mosgaz",
            "служба police",
            "служба mch",
            "служба ambulance",
        )
        training_description = self.training_description.casefold()
        if any(
            marker in training_description
            for marker in forbidden_training_markers
        ) or re.search(r"\b\d{6,8}\b", training_description):
            raise ValueError(
                "training_description must not expose classifier metadata"
            )
        initial_utterance = self.initial_utterance.casefold()
        non_emergency_request_markers = (
            "получить справк",
            "нужна справк",
            "куда обратиться",
            "как получить",
            "как быстро можно прийти",
        )
        if any(marker in initial_utterance for marker in non_emergency_request_markers):
            raise ValueError(
                "initial_utterance must report an incident, not request information"
            )
        if re.search(r"\b\d+\s*[-–]\s*\d+\b", self.description):
            raise ValueError("description contains an unexplained numeric range")
        return self


class TemplateGenerationClient:
    def __init__(
        self,
        settings: Settings,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.settings = settings
        self._client = client or httpx.AsyncClient(
            base_url=settings.dialogue_llm_base_url.rstrip("/"),
            trust_env=False,
            timeout=httpx.Timeout(
                settings.template_generation_timeout_seconds,
                connect=10.0,
            ),
            headers=(
                {"Authorization": f"Bearer {settings.dialogue_llm_api_key}"}
                if settings.dialogue_llm_api_key
                else None
            ),
        )
        self._owns_client = client is None

    async def generate(
        self,
        *,
        classifier_record: dict[str, Any],
        dds_service_codes: list[str],
        automatic_phone_number: str,
        required_incident_address: str,
        required_applicant_gender: ApplicantGender,
    ) -> GeneratedIncidentFacts:
        classifier_context = {
            key: classifier_record.get(key)
            for key in (
                "classifier_number",
                "statistics_group",
                "feature_1",
                "feature_2",
                "feature_3",
                "additional_features",
                "final_incident_type",
                "ekp35_incident_type",
                "response_scenario",
                "primary_service",
            )
        }
        classifier_text = " ".join(
            str(classifier_record.get(key) or "").casefold()
            for key in (
                "statistics_group",
                "feature_1",
                "feature_2",
                "feature_3",
                "final_incident_type",
            )
        )
        location_instruction = ""
        if "на улице" in classifier_text:
            location_instruction = (
                "Место происшествия строго на улице. Не упоминай квартиру, "
                "помещение, кухню или подъезд."
            )
        elif "кухн" in classifier_text:
            location_instruction = "Место происшествия строго на кухне."
        elif "частн" in classifier_text and "дом" in classifier_text:
            location_instruction = "Место происшествия строго в частном доме."
        if classifier_record.get("primary_service") == "AMBULANCE":
            victims_instruction = (
                "Это медицинское происшествие: укажи минимум одного пострадавшего "
                "и victims_count не меньше 1. Не пиши, что пострадавших нет."
            )
        elif "без пострадав" in classifier_text:
            victims_instruction = (
                "По классификатору пострадавших нет: victims_count должен быть 0."
            )
        else:
            victims_instruction = (
                "victims_count должен точно соответствовать описанию происшествия."
            )
        system_prompt = (
            "Ты создаёшь реалистичный, но полностью синтетический учебный случай "
            "для российской Системы-112. Не меняй заданную классификацию и не "
            "добавляй другие службы. Сформируй обстоятельства, которые однозначно "
            "соответствуют классификации и выбранным ДДС. Адрес и ФИО должны быть "
            "вымышленными, без утверждений о реальном происшествии. description — "
            "краткая запись поля «Со слов заявителя» из 2–4 предложений. Первое "
            "предложение должно начинаться строго с «По адресу: », после чего "
            "дословно укажи incident_address и поставь точку. Далее опиши суть, "
            "наличие или отсутствие пострадавших и только важные обстоятельства. "
            "Не описывай "
            "прибытие полиции, бригады, расчёта или иное уже выполненное реагирование. "
            "Не добавляй признаки, которых нет в классификаторе. Все временные и "
            "количественные признаки обязаны точно соответствовать классификатору. "
            "Прямо назови в description тип происшествия и определяющие признаки "
            "из final_incident_type и feature_1–feature_3; не подменяй их похожей "
            "ситуацией. "
            "training_description — одно-два предложения о задаче обучаемого без "
            "номеров, кодов и внутренних терминов классификатора или сценария "
            "реагирования. ФИО записывай в порядке «Фамилия Имя Отчество». "
            "initial_utterance — короткая естественная первая реплика экстренного "
            "звонка: заявитель сообщает о происшествии, а не просит справку, "
            "консультацию или документы. description пиши связным текстом, не "
            "перечисляй поля классификатора и не вставляй диапазоны из этой "
            "инструкции. difficulty "
            "выбери от 1 до 4. Верни только JSON со строго следующими полями: title, "
            "training_description, initial_utterance, description, applicant_full_name, "
            "reported_address, incident_address, victims_count, difficulty. Не добавляй "
            "телефонные номера в JSON. Используй в точности эти имена ключей, "
            "не переводи и не переименовывай их. Все девять ключей обязательны:\n"
            '{"title":"...","training_description":"...",'
            '"initial_utterance":"...","description":"...",'
            '"applicant_full_name":"...","reported_address":"...",'
            '"incident_address":"...","victims_count":0,"difficulty":2}'
        )
        user_prompt = (
            "Запись классификатора:\n"
            f"{json.dumps(classifier_context, ensure_ascii=False)}\n\n"
            f"Выбранные ДДС: {', '.join(dds_service_codes)}\n"
            f"Системный синтетический АОН: {automatic_phone_number}\n"
            f"Обязательный адрес: {required_incident_address}\n"
            f"Ограничение места: {location_instruction or 'нет дополнительных'}\n"
            f"Пострадавшие: {victims_instruction}\n"
            "Заявитель — "
            f"{'мужчина' if required_applicant_gender == 'male' else 'женщина'}. "
            "Сгенерируй соответствующие имя, фамилию и отчество; "
            "отчество и фамилия не должны противоречить полу.\n"
            "Запиши обязательный адрес без изменений одновременно в "
            "reported_address и incident_address. description начни в точности с: "
            f"По адресу: {required_incident_address}."
        )
        try:
            request_payload = {
                "model": self.settings.dialogue_llm_model,
                "temperature": 0.2,
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "generated_incident_facts",
                        "strict": True,
                        "schema": GeneratedIncidentFacts.model_json_schema(),
                    },
                },
                "reasoning_effort": "low",
                "chat_template_kwargs": {"reasoning_effort": "low"},
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            }
            incident_type = str(classifier_record["final_incident_type"]).strip()
            last_validation_error: ValueError | None = None
            for _ in range(3):
                response = await self._client.post(
                    "/chat/completions", json=request_payload
                )
                if response.status_code == 400:
                    request_payload["response_format"] = {"type": "json_object"}
                    response = await self._client.post(
                        "/chat/completions", json=request_payload
                    )
                response.raise_for_status()
                response_payload = response.json()
                content = response_payload["choices"][0]["message"]["content"]
                if not isinstance(content, str) or not content.strip():
                    raise ValueError("empty completion content")
                try:
                    generated = _parse_json_object(content)
                    generated["title"] = incident_type
                    generated["training_description"] = (
                        "Отработайте приём сообщения по происшествию "
                        f"«{incident_type}», заполнение карточки и передачу "
                        "информации в выбранную ДДС."
                    )
                    facts = GeneratedIncidentFacts.model_validate(generated)
                    if applicant_gender(facts.applicant_full_name) != required_applicant_gender:
                        raise ValueError(
                            "applicant_full_name does not match the required gender"
                        )
                    return facts
                except ValueError as exc:
                    last_validation_error = exc
                    request_payload["messages"].extend(
                        (
                            {"role": "assistant", "content": content},
                            {
                                "role": "user",
                                "content": (
                                    "Ответ не прошёл проверку: "
                                    f"{str(exc)[:800]}. Исправь только ошибки и "
                                    "снова верни полный JSON."
                                ),
                            },
                        )
                    )
            raise last_validation_error or ValueError(
                "generated response failed validation"
            )
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            raise TemplateGenerationError(
                f"Template generation request failed: {exc}"
            ) from exc

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()


def _parse_json_object(content: str) -> dict[str, Any]:
    normalized = content.strip()
    if normalized.startswith("```"):
        lines = normalized.splitlines()
        lines = lines[1:] if lines and lines[0].startswith("```") else lines
        lines = lines[:-1] if lines and lines[-1].strip() == "```" else lines
        normalized = "\n".join(lines).strip()
    try:
        value = json.loads(normalized)
    except json.JSONDecodeError:
        start = normalized.find("{")
        end = normalized.rfind("}")
        if start < 0 or end <= start:
            raise
        value = json.loads(normalized[start : end + 1])
    if not isinstance(value, dict):
        raise ValueError("LLM response must be a JSON object")
    return value
