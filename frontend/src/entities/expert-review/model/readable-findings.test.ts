import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EmergencyService, ExpertReviewCardDto } from "@/shared/api";
import { discrepancyLabel, discrepancyValue } from "./discrepancy-labels.ts";
import { dds102AttemptContext } from "./fixtures/dds102-attempt.fixture.ts";
import {
  findingGroups,
  outboundVerdictLines,
  type ClassifierEntry,
  type ClassifierNames,
  type FindingSource,
} from "./readable-findings.ts";

const records = new Map<number, ClassifierEntry>([
  [2010000, { name: "ДТП без пострадавших", group: "ДТП", features: ["ДТП без пострадавших", null, null] }],
  [
    15050300,
    {
      name: "Кража",
      group: "Кража, грабеж, разбой",
      features: ["Кража, грабеж, разбой", "Кража: Гараж, огранизация, Автомашина, личное имущество, документы", null],
    },
  ],
  [15020200, { name: "Вскрыта автомашина", group: "Вскрыта /открыто", features: ["Вскрыта", "Автомашина", null] }],
]);

const names: ClassifierNames = {
  recordOf: (recordId) => records.get(recordId),
  flagLabel: (key) => (key === "offence" ? "Правонарушение" : undefined),
};

const services = new Map<string, EmergencyService>([["svc-102", { code: "102", name: "Полиция" }]]);

function toSource(dto: ExpertReviewCardDto): FindingSource {
  return {
    key: dto.scenario_card_key,
    expectedResult: dto.expected_result,
    currentState: dto.current_state,
    discrepancies: dto.automatic_result?.discrepancies ?? [],
  };
}

const groups = findingGroups(dds102AttemptContext.cards.map(toSource), names);

function renderedTexts(): string[] {
  return groups.flatMap((group) => [
    group.title,
    ...group.discrepancies.flatMap((discrepancy) => [
      discrepancyLabel(discrepancy.path, services),
      discrepancyValue(discrepancy.path, discrepancy.expected),
      discrepancyValue(discrepancy.path, discrepancy.actual),
    ]),
    ...(group.verdict === null ? [] : outboundVerdictLines(group.verdict)),
  ]);
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const TECHNICAL = /gpt-oss|sequence_no|workspace|actor_user|audio_message|training_session|incident_card|_id\b|attempts|\{|\}/;

describe("разбор попытки ДДС-102: читаемый вывод", () => {
  it("в выводе нет идентификаторов и служебных ключей", () => {
    for (const line of renderedTexts()) {
      assert.doesNotMatch(line, UUID, line);
      assert.doesNotMatch(line, TECHNICAL, line);
    }
  });

  it("классификация — названиями классификатора, одной строкой на тип", () => {
    const theft = groups[1];
    assert.ok(theft);
    const classification = theft.discrepancies.filter((item) => item.path.startsWith("card.classification."));

    assert.deepEqual(
      classification.map((item) => [discrepancyLabel(item.path, services), item.expected, item.actual]),
      [
        ["Тип происшествия", "Кража", "Вскрыта автомашина"],
        ["Признак 1 порядка", "Кража, грабеж, разбой", "Вскрыта"],
        [
          "Признак 2 порядка",
          "Кража: Гараж, огранизация, Автомашина, личное имущество, документы",
          "Автомашина",
        ],
      ],
    );
  });

  it("расхождения сгруппированы по карточкам без перемешивания и дублей", () => {
    assert.deepEqual(
      groups.map((group) => group.title),
      [
        "Карточка 1 — ДТП без пострадавших, г. Москва, ул. Тренировочная, д. 5",
        "Карточка 2 — Кража, г. Москва, ул. Примерная, д. 7",
      ],
    );

    const [accident, theft] = groups;
    assert.ok(accident && theft);
    assert.ok(accident.discrepancies.some((item) => item.path === "card.victims_count"));
    assert.ok(!theft.discrepancies.some((item) => item.path === "card.victims_count"));
    assert.equal(accident.verdict, null);

    for (const group of groups) {
      const paths = group.discrepancies.map((item) => item.path);
      assert.equal(new Set(paths).size, paths.length, group.title);
    }
  });

  it("вывод модели по докладу — по-человечески", () => {
    const verdict = groups[1]?.verdict;
    assert.ok(verdict);

    assert.deepEqual(outboundVerdictLines(verdict), [
      "Сходство с эталоном: 0,6 при пороге 0,8 — не зачтено",
      "Что сказал обучаемый: Здравствуйте. Э-э, по адресу: город Москва, улица Примерная, дом 7. Во дворе у заявителя",
      "Что должно было прозвучать: Кража сумки из припаркованного автомобиля по адресу: г. Москва, ул. Примерная, д. 7, двор.",
      "Не хватает: Кража сумки; из припаркованного автомобиля",
      "Противоречия: нет",
      "Пояснение: Адрес совпадает, но отсутствуют ключевые факты о краже сумки и припаркованном автомобиле.",
    ]);
  });

  it("служба — названием с кодом, статусы — русскими названиями", () => {
    assert.equal(discrepancyLabel("card.service_statuses.102", services), "Статус службы 102 · Полиция");
    assert.equal(discrepancyValue("card.service_statuses.102", "WORK_COMPLETED"), "Работы завершены");
  });

  it("неизвестный объект не выводится дампом", () => {
    assert.equal(
      discrepancyValue("card.unknown", { id: "4f1c", status: "ARRIVED", comment: "На месте", created_at: "2026" }),
      "Прибытие — На месте",
    );
    assert.equal(discrepancyValue("card.unknown", { model: "gpt-oss-20b", workspace_id: "x", sequence_no: 2 }), "—");
    assert.equal(
      discrepancyValue("card.unknown", { reported_address: "г. Москва, ул. Примерная, д. 7", attempts: 1 }),
      "адрес со слов заявителя: г. Москва, ул. Примерная, д. 7",
    );
  });
});
