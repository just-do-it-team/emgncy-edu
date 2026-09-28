import { classifierRecords, resolveServices, type ClassifierRecord } from "@/entities/incident";
import {
  defaultTrigger,
  emptyAddress,
  emptyCardFields,
  emptyExpected,
  emptyScenarioDraft,
  primaryServiceCode,
  scenarioCreateBody,
  withMainService,
  workspaceDefaults,
  type AddressDraft,
  type ScenarioDraft,
  type ScenarioItemDraft,
  type StatusStepDraft,
} from "@/entities/scenario";
import type {
  OperatorClassificationDto,
  ScenarioGenerationDto,
  ScenarioGenerationRequestDto,
} from "@/shared/api";

const MOCK_DELAY_MS = 2500;
const MOCK_MODEL = "gpt-oss-20b";
const SUGGESTED_DIFFICULTY_BY_COUNT = [1, 2, 2, 3, 3, 4] as const;
const MOCK_DURATION_SECONDS = 900;
const MOCK_SERVICE_CODES = new Set(["101", "102", "103", "104", "ZEMP"]);

const applicants = [
  "Смирнова Ольга Петровна",
  "Кузнецов Андрей Викторович",
  "Воробьёва Наталья Игоревна",
  "Лебедев Сергей Михайлович",
  "Фёдорова Марина Алексеевна",
];

const addresses: Pick<AddressDraft, "street" | "house" | "building" | "apartment">[] = [
  { street: "улица Дубининская", house: "57", building: "2", apartment: "41" },
  { street: "Ленинский проспект", house: "41", building: "", apartment: "58" },
  { street: "улица Профсоюзная", house: "92", building: "", apartment: "113" },
  { street: "Варшавское шоссе", house: "125", building: "1", apartment: "7" },
  { street: "улица Бутлерова", house: "14", building: "", apartment: "26" },
];

const phones = ["+79161234567", "+79035550142", "+79267771830", "+79852224419", "+79998887766"];

function capitalized(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function pick<T>(list: readonly T[], index: number): T {
  const value = list[index % list.length];

  if (value === undefined) throw new Error("Пустой список для мока");

  return value;
}

function recordsFor(request: ScenarioGenerationRequestDto): ClassifierRecord[] {
  const exact = classifierRecords.find((record) => record.id === request.record_id);
  const group = classifierRecords.filter((record) => record.group === request.classification_group);

  return exact ? [exact] : group.length > 0 ? group : classifierRecords;
}

function classificationOf(record: ClassifierRecord): OperatorClassificationDto {
  const [groupCode, feature1, feature2, feature3] = record.codes;

  return {
    record_id: record.id,
    group_code: groupCode,
    feature_1_code: feature1,
    feature_2_code: feature2,
    feature_3_code: feature3,
    final_incident_type: record.name,
    routing_flags: {},
    excluded_service_codes: [],
  };
}

function servicesFor(record: ClassifierRecord, positions: (string | null)[]): string[] {
  const routed = resolveServices(record, {}).map((service) => service.code).filter((code) => code !== "");
  const dispatchers = positions.filter((position): position is string => position !== null);

  return [...new Set([...withMainService(routed, primaryServiceCode(record.primaryService)), ...dispatchers])].filter(
    (code) => MOCK_SERVICE_CODES.has(code),
  );
}

const notifiedServiceSteps: StatusStepDraft[] = [{ status: "ACCEPTED", comment: "Принято к сведению", unitNumber: "" }];

const dispatcherSteps: StatusStepDraft[] = [
  { status: "ACCEPTED", comment: "Принято по компетенции, высылаем подразделение", unitNumber: "" },
  { status: "RESPONSE_STARTED", comment: "Подразделение выехало", unitNumber: "" },
  { status: "ARRIVED", comment: "Прибыли на место, проводят разведку", unitNumber: "" },
];

function mockItem(request: ScenarioGenerationRequestDto, record: ClassifierRecord, index: number): ScenarioItemDraft {
  const dispatcher = request.required_participant_positions.some((position) => position !== null);
  const address = { ...emptyAddress, ...pick(addresses, index) };
  const notes = request.notes === null ? "" : ` ${capitalized(request.notes)}.`;
  const services = servicesFor(record, request.required_participant_positions);
  const expected = {
    ...emptyExpected("INLINE"),
    recordId: record.id,
    services,
    fields: {
      ...emptyCardFields,
      description: `${capitalized(record.name)}. Заявитель сообщает со слов очевидцев, просит срочно направить помощь.${notes}`,
      applicantFullName: pick(applicants, index),
      automaticPhoneNumber: pick(phones, index),
      providedPhoneNumber: pick(phones, index),
      reportedAddress: address,
      incidentAddress: address,
      victimsCount: index % 2 === 0 ? 0 : 1,
    },
    history: dispatcher
      ? Object.fromEntries(
          services.map((code) => [
            code,
            request.required_participant_positions.includes(code) ? dispatcherSteps : notifiedServiceSteps,
          ]),
        )
      : {},
  };

  return {
    key: `card-${index + 1}`,
    itemType: "INCIDENT_CARD",
    trigger: defaultTrigger(index),
    source: {
      kind: "INLINE",
      variant: dispatcher ? "cardDds" : "card112",
      card: { sourceType: "CALL", initialSameAsExpected: true, initial: expected.fields },
      expected,
    },
  };
}

function mockDraft(request: ScenarioGenerationRequestDto, records: ClassifierRecord[], difficulty: number): ScenarioDraft {
  const [first] = records;
  const items = Array.from({ length: request.item_count }, (_, index) => mockItem(request, pick(records, index), index));

  return {
    ...emptyScenarioDraft,
    ...workspaceDefaults(request.workspace_mode),
    name: `${capitalized(first?.name ?? request.classification_group)} — учебный сценарий`,
    description: [
      `Сценарий из ${request.item_count} элементов по группе «${request.classification_group}».`,
      request.notes === null ? null : `Особенности: ${request.notes}.`,
    ]
      .filter(Boolean)
      .join(" "),
    difficulty,
    requiredPositions: request.required_participant_positions,
    items,
  };
}

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Генерация отменена", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function generateScenarioMock(
  request: ScenarioGenerationRequestDto,
  signal: AbortSignal | undefined,
): Promise<ScenarioGenerationDto> {
  await wait(MOCK_DELAY_MS, signal);

  const records = recordsFor(request);
  const difficulty =
    request.difficulty ?? pick(SUGGESTED_DIFFICULTY_BY_COUNT, Math.max(request.item_count - 1, 0));
  const body = scenarioCreateBody(
    mockDraft(request, records, difficulty),
    (recordId) => {
      const record = classifierRecords.find((candidate) => candidate.id === recordId);

      return record ? classificationOf(record) : null;
    },
    MOCK_DURATION_SECONDS,
    request.teacher_id,
  );

  return {
    scenario: {
      name: body.name,
      description: body.description,
      difficulty: body.difficulty,
      estimated_duration_seconds: body.estimated_duration_seconds,
      passing_score: body.passing_score,
      workspace_mode: body.workspace_mode,
      completion_policy: body.completion_policy,
      min_participants: body.min_participants,
      max_participants: body.max_participants,
      required_participant_positions: body.required_participant_positions,
      definition: body.definition,
    },
    generation: { model: MOCK_MODEL, generated_at: new Date().toISOString(), difficulty_suggested: request.difficulty === null },
  };
}
