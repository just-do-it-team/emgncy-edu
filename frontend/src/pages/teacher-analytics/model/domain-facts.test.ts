import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ActionEvent, ActionEventBody, JsonObject } from "@/shared/api";
import { addressFacts, serviceFacts, stageFacts } from "./domain-facts.ts";

const STUDENT = "11ba0c06-3acc-40b5-aca1-0472fe466cc5";
const START = Date.parse("2026-09-29T12:47:30+03:00");

function event(
  seconds: number,
  body: ActionEventBody,
  cardId = "card-1",
  actor: string | null = STUDENT,
): ActionEvent {
  return {
    id: `${cardId}-${seconds}-${body.kind}`,
    actionType: body.kind,
    occurredAt: new Date(START + seconds * 1000).toISOString(),
    callOffsetMs: null,
    actorUserId: actor,
    incidentCardId: cardId,
    entityId: null,
    ...body,
  };
}

const status = (to: string) =>
  ({
    kind: "service_status_changed",
    serviceId: "svc-102",
    from: null,
    to,
    comment: "Наряд № 2",
    unitNumber: "2",
  }) as const;

describe("факты попытки для аналитики", () => {
  it("этапы ДДС считаются от раскрытия карточки обучаемым", () => {
    const actions = [
      event(
        0,
        { kind: "card_created", releasedByScenario: true },
        "card-1",
        null,
      ),
      event(15, { kind: "card_opened", serviceId: "svc-102", onTime: true }),
      event(45, {
        kind: "service_decision",
        serviceId: "svc-102",
        decision: "ACCEPTED",
        comment: "Принята",
        onTime: true,
      }),
      event(75, status("RESPONSE_STARTED")),
      event(195, status("ARRIVED")),
      event(200, status("ARRIVED")),
      event(
        20,
        { kind: "card_opened", serviceId: "svc-102", onTime: true },
        "card-2",
        "другой обучаемый",
      ),
    ];

    assert.deepEqual(stageFacts(actions, STUDENT), [
      { stage: "accepted", ms: 30_000 },
      { stage: "responseStarted", ms: 60_000 },
      { stage: "arrived", ms: 180_000 },
    ]);
  });

  it("адрес — только там, где эталон его задаёт; ошибка — расхождение по адресу со слов заявителя", () => {
    const call = (
      reported: string | null,
      discrepancies: {
        path: string;
        expected: string;
        actual: string | null;
      }[],
    ) => {
      const card: JsonObject =
        reported === null ? {} : { reported_address: reported };

      return {
        expectedResult: { card },
        automaticResult: {
          score: 50,
          passed: false,
          evaluatedAt: null,
          discrepancies: discrepancies.map((item) => ({
            ...item,
            reason: "value_mismatch",
          })),
        },
      };
    };

    assert.deepEqual(
      addressFacts([
        call("г. Москва, ул. Дубининская, д. 5", [
          {
            path: "card.reported_address",
            expected: "г. Москва, ул. Дубининская, д. 5",
            actual: "г. Москва, ул. Дубнинская, д. 5",
          },
          {
            path: "card.incident_address",
            expected: "г. Москва, ул. Дубининская, д. 5, подъезд 2",
            actual: null,
          },
        ]),
        call("г. Москва, ул. Примерная, д. 7", []),
        call(null, []),
      ]),
      {
        checks: 2,
        mismatches: [
          {
            expected: "г. Москва, ул. Дубининская, д. 5",
            actual: "г. Москва, ул. Дубнинская, д. 5",
          },
        ],
      },
    );
  });

  it("службы эталона против оповещённых; незавершённый звонок не считается", () => {
    const expectedResult = {
      card: {
        services: ["102", "103"],
        classification: { final_incident_type: "ДТП с пострадавшими" },
      },
    };

    assert.deepEqual(
      serviceFacts([
        { expectedResult, currentState: { services: ["102"] } },
        { expectedResult, currentState: null },
      ]),
      [
        {
          incidentType: "ДТП с пострадавшими",
          serviceCode: "102",
          missed: false,
        },
        {
          incidentType: "ДТП с пострадавшими",
          serviceCode: "103",
          missed: true,
        },
      ],
    );
  });
});
