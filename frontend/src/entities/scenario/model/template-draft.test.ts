import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OperatorClassificationDto } from "@/shared/api";
import { emptyAddress, formatAddress } from "./address.ts";
import {
  emptyTemplateDraft,
  expectedFromJson,
  expectedResultBody,
  templateCreateBody,
  type TemplateDraft,
} from "./expected-draft.ts";
import { invalidTransitionIndex, isStatusAllowedFor, nextStatuses } from "./response-status.ts";
import { knownServerMessage } from "./server-failure.ts";
import { rerouteServices, serviceDiff } from "./services-diff.ts";
import { hasErrors, validateTemplateDraft, type ValidationContext } from "./template-validation.ts";

const classification: OperatorClassificationDto = {
  record_id: 13020201,
  group_code: 13,
  feature_1_code: 2,
  feature_2_code: 2,
  feature_3_code: 1,
  final_incident_type: "Запах бытового газа в квартире",
  routing_flags: {},
  excluded_service_codes: [],
};

const context: ValidationContext = {
  recordExists: (recordId) => recordId === 13020201,
  activeServices: new Set(["101", "103", "104"]),
};

function filledDraft(variant: TemplateDraft["variant"]): TemplateDraft {
  const draft = emptyTemplateDraft(variant);

  return {
    ...draft,
    name: "Запах газа в квартире",
    initialUtterance: "Алло, в подъезде пахнет газом!",
    expected: {
      ...draft.expected,
      recordId: 13020201,
      services: ["104"],
      history: { "104": [{ status: "RECEIVED", comment: "", unitNumber: "" }, { status: "ACCEPTED", comment: "", unitNumber: "12" }] },
      fields: {
        ...draft.expected.fields,
        description: "Запах газа на лестничной площадке",
        automaticPhoneNumber: "+79161263471",
        incidentAddress: { ...emptyAddress, street: "Ленинский проспект", house: "14", apartment: "58" },
      },
    },
  };
}

describe("formatAddress", () => {
  it("собирает адрес так же, как АРМ обучаемого", () => {
    assert.equal(
      formatAddress({ ...emptyAddress, street: "ул. Берзарина", house: "21", building: "1", apartment: "68" }),
      "Москва, ул. Берзарина, д. 21, корп. 1, кв. 68",
    );
  });

  it("пустые части пропускаются, описательный адрес — в конце", () => {
    assert.equal(
      formatAddress({ ...emptyAddress, subject: "", descriptive: "напротив Большого Нижнего пруда" }),
      "напротив Большого Нижнего пруда",
    );
  });
});

describe("служба 103", () => {
  it("«Не принята» и «Отказ от выполнения работ» недоступны только для 103", () => {
    assert.equal(isStatusAllowedFor("103", "REJECTED"), false);
    assert.equal(isStatusAllowedFor("103", "WORK_REFUSED"), false);
    assert.equal(isStatusAllowedFor("103", "WORK_COMPLETED"), true);
    assert.equal(isStatusAllowedFor("104", "REJECTED"), true);
  });

  it("такая цепочка в эталоне — ошибка, а не предупреждение", () => {
    const draft = filledDraft("cardDds");
    const withAmbulance: TemplateDraft = {
      ...draft,
      expected: {
        ...draft.expected,
        services: ["104", "103"],
        history: {
          ...draft.expected.history,
          "103": [
            { status: "RECEIVED", comment: "", unitNumber: "" },
            { status: "REJECTED", comment: "Не по профилю", unitNumber: "" },
          ],
        },
      },
    };
    const issues = validateTemplateDraft(withAmbulance, context);

    assert.ok(issues.some((issue) => issue.path === "expected.history.103.1.status" && issue.severity === "error"));
  });

  it("422 сервера по правилу 103 и по неопубликованному шаблону — по-русски", () => {
    const rule = "; use WORK_COMPLETED with the no-brigade result";

    assert.match(
      knownServerMessage(`card template.expected_result: service 103 cannot use REJECTED or WORK_REFUSED${rule}`) ?? "",
      /^Эталон: служба 103/,
    );
    assert.match(
      knownServerMessage(`scenario item card-2.expected_result: service 103 cannot use REJECTED or WORK_REFUSED${rule}`) ?? "",
      /^Элемент card-2:/,
    );
    assert.match(
      knownServerMessage(`template 5b0c.expected_result: service 103 cannot use REJECTED or WORK_REFUSED${rule}`) ?? "",
      /Создайте новую версию шаблона/,
    );
    assert.match(knownServerMessage("Inactive or missing card template: 5b0c") ?? "", /черновик ИИ/);
    assert.equal(knownServerMessage("Something else"), null);
  });

  it("409 публикации черновика ИИ — по-русски, с полями по-русски", () => {
    assert.match(
      knownServerMessage("Every AI-generated template section must be confirmed or edited before publication") ?? "",
      /проверены не все секции/,
    );
    assert.equal(
      knownServerMessage("Generated 112 and DDS templates differ in shared fields: incident_address, victims_count"),
      "Звонок 112 и карточки ДДС из одной генерации должны совпадать в общих полях: адрес происшествия, пострадавшие. Исправьте черновики, чтобы значения совпали, и опубликуйте снова.",
    );
  });
});

describe("автомат статусов реагирования", () => {
  it("из «Не принята» — только «Принята»", () => {
    assert.deepEqual(nextStatuses(["RECEIVED", "REJECTED"]), ["ACCEPTED"]);
  });

  it("терминальные статусы закрывают цепочку", () => {
    assert.deepEqual(nextStatuses(["ACCEPTED", "WORK_REFUSED"]), []);
  });

  it("недопустимый переход находится по индексу", () => {
    assert.equal(invalidTransitionIndex(["RECEIVED", "ACCEPTED"]), null);
    assert.equal(invalidTransitionIndex(["ACCEPTED", "ARRIVED"]), 1);
  });
});

describe("автоподбор служб", () => {
  it("ручные отличия считаются от автоподбора", () => {
    assert.deepEqual(serviceDiff(["101", "103"], ["101", "104"]), { added: ["104"], removed: ["103"] });
  });

  it("при смене флагов ручные добавления и удаления сохраняются", () => {
    assert.deepEqual(rerouteServices(["101", "103"], ["101", "103", "ZEMP"], ["101", "104"]), ["101", "ZEMP", "104"]);
  });
});

describe("тело шаблона", () => {
  it("шаблон: пустое поле уходит как null — «должно быть пустым»", () => {
    const request = templateCreateBody(filledDraft("call"), {
      classification,
      userId: "teacher",
      templateKey: null,
      version: 1,
    });

    assert.equal(request.kind, "call");
    const card = request.body.expected_result.card;

    assert.ok(card && typeof card === "object" && !Array.isArray(card));
    assert.equal(card.applicant_full_name, null);
    assert.equal(card.incident_address, "Москва, Ленинский проспект, д. 14, кв. 58");
    assert.deepEqual(card.service_statuses, { "104": "ADDED" });
    assert.equal(request.body.expected_result.service_status_history, null);
    assert.deepEqual(request.kind === "call" && request.body.initial_call, {
      initial_utterance: "Алло, в подъезде пахнет газом!",
      automatic_phone_number: "+79161263471",
    });
  });

  it("карточка ДДС: статусы служб берутся из последнего статуса цепочки", () => {
    const request = templateCreateBody(filledDraft("cardDds"), {
      classification,
      userId: "teacher",
      templateKey: "key",
      version: 3,
    });
    const expected = request.body.expected_result;
    const card = expected.card;

    assert.ok(card && typeof card === "object" && !Array.isArray(card));
    assert.deepEqual(card.service_statuses, { "104": "ACCEPTED" });
    assert.deepEqual(expected.service_status_history, {
      "104": [
        { status: "RECEIVED", comment: null, unit_number: null },
        { status: "ACCEPTED", comment: null, unit_number: "12" },
      ],
    });
    assert.equal(request.body.template_key, "key");
    assert.equal(request.body.version, 3);
    assert.ok(request.kind === "card" && request.body.initial_card.source_type === "CALL");
  });

  it("встроенная карточка: непроверяемые поля не отправляются вовсе", () => {
    const draft = filledDraft("card112");
    const body = expectedResultBody(
      { ...draft.expected, modes: { ...draft.expected.modes, applicant_full_name: "not_checked" } },
      "INLINE",
      false,
      classification,
    );
    const card = body.card;

    assert.ok(card && typeof card === "object" && !Array.isArray(card));
    assert.equal("applicant_full_name" in card, false);
    assert.equal("service_status_history" in body, false);
  });

  it("эталон из ответа сервера читается обратно без потерь", () => {
    const draft = filledDraft("cardDds");
    const body = expectedResultBody(draft.expected, "TEMPLATE", true, classification);
    const parsed = expectedFromJson(body, "TEMPLATE");

    assert.equal(parsed.recordId, 13020201);
    assert.equal(parsed.modes.applicant_full_name, "must_be_empty");
    assert.equal(parsed.modes.incident_address, "checked");
    assert.equal(formatAddress(parsed.fields.incidentAddress), "Москва, Ленинский проспект, д. 14, кв. 58");
    assert.deepEqual(parsed.history["104"]?.map((step) => step.status), ["RECEIVED", "ACCEPTED"]);
  });
});

describe("проверка черновика шаблона", () => {
  it("заполненный шаблон без ошибок", () => {
    assert.equal(hasErrors(validateTemplateDraft(filledDraft("cardDds"), context)), false);
  });

  it("без названия, типа и первой реплики — ошибки с путями полей", () => {
    const paths = validateTemplateDraft(emptyTemplateDraft("call"), context)
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.path);

    assert.ok(paths.includes("name"));
    assert.ok(paths.includes("initialUtterance"));
    assert.ok(paths.includes("expected.recordId"));
  });

  it("«не проверяется» в шаблоне невыразимо — ошибка", () => {
    const draft = filledDraft("call");
    const issues = validateTemplateDraft(
      { ...draft, expected: { ...draft.expected, modes: { ...draft.expected.modes, applicant_full_name: "not_checked" } } },
      context,
    );

    assert.ok(issues.some((issue) => issue.path === "expected.fields.applicantFullName" && issue.severity === "error"));
  });

  it("отказ без комментария и неактивная служба — ошибки", () => {
    const draft = filledDraft("cardDds");
    const issues = validateTemplateDraft(
      {
        ...draft,
        expected: {
          ...draft.expected,
          services: ["104", "GORMOST"],
          history: {
            "104": [{ status: "REJECTED", comment: " ", unitNumber: "" }],
            GORMOST: [{ status: "RECEIVED", comment: "", unitNumber: "" }],
          },
        },
      },
      context,
    );
    const paths = issues.filter((issue) => issue.severity === "error").map((issue) => issue.path);

    assert.ok(paths.includes("expected.history.104.0.comment"));
    assert.ok(paths.includes("expected.services"));
  });

  it("проверка адреса со слов заявителя — предупреждение, что АРМ его не заполняет", () => {
    const draft = filledDraft("call");
    const issues = validateTemplateDraft(
      {
        ...draft,
        expected: {
          ...draft.expected,
          modes: { ...draft.expected.modes, reported_address: "checked" },
          fields: { ...draft.expected.fields, reportedAddress: { ...emptyAddress, street: "Ленинский проспект" } },
        },
      },
      context,
    );

    assert.ok(issues.some((issue) => issue.path === "expected.fields.reportedAddress.street" && issue.severity === "warning"));
  });
});
