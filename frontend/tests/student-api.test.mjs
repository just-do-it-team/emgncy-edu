import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import axios from "axios";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
function moduleUrl(text) {
  const { outputText } = ts.transpileModule(text, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  };
}
globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();
const connectionUrl = moduleUrl(
  source("src/entities/training/model/connection.ts")
    .replace(
      'from "zustand"',
      `from ${JSON.stringify(import.meta.resolve("zustand"))}`,
    )
    .replaceAll(
      "import.meta.env",
      "({VITE_ARM_API_URL: 'http://test.invalid'})",
    ),
);
const connection = await import(connectionUrl);
const rulesUrl = moduleUrl(source("src/entities/training/model/rules.ts"));
const rules = await import(rulesUrl);
const calls = [];
let responseData = {};
let responseStatus = 200;
axios.defaults.adapter = async (config) => {
  calls.push(config);
  if (responseStatus >= 400)
    throw new axios.AxiosError("test", "ERR_BAD_RESPONSE", config, null, {
      status: responseStatus,
      data: responseData,
      config,
      headers: {},
    });
  return {
    status: 200,
    statusText: "OK",
    data: responseData,
    config,
    headers: {},
  };
};
const apiUrl = moduleUrl(
  source("src/entities/training/api/training-api.ts")
    .replace(
      'from "axios"',
      `from ${JSON.stringify(import.meta.resolve("axios"))}`,
    )
    .replace(
      'from "../model/connection"',
      `from ${JSON.stringify(connectionUrl)}`,
    ),
);
const { trainingApi, apiError } = await import(apiUrl);
const unusedDemo = moduleUrl(
  "export const demoIncidents=[]; export const resolveClassification=()=>undefined; export const resolveServices=()=>[];",
);
const draftUrl = moduleUrl(
  source("src/pages/workspace-page/model/operator-cards.ts").replace(
    'from "@/entities/incident"',
    `from ${JSON.stringify(unusedDemo)}`,
  ),
);
const adapterUrl = moduleUrl(
  source("src/pages/workspace-page/model/api-card-adapter.ts")
    .replace('from "@/entities/training"', `from ${JSON.stringify(rulesUrl)}`)
    .replace('from "./operator-cards"', `from ${JSON.stringify(draftUrl)}`),
);
const adapter = await import(adapterUrl);
const { emptyOperatorDraft } = await import(draftUrl);
const userId = "00000000-0000-4000-8000-000000000001";
const ctx = {
  userId,
  sessionId: "00000000-0000-4000-8000-000000000002",
  workspaceId: "00000000-0000-4000-8000-000000000003",
  assignmentId: "assignment",
  mode: "DDS",
  positionCode: "101",
  title: "Учебная сессия",
};
const card = {
  id: "card",
  version: 7,
  questionnaire: { other: { preserve: true } },
  description: "Тест",
  incident_address: "Учебный адрес",
  reported_address: null,
};
const body = () => JSON.parse(calls.at(-1).data);

test("student list requests always carry explicit identity and workspace scope", async () => {
  await trainingApi.assignments(userId);
  assert.equal(calls.at(-1).params.participant_user_id, userId);
  await trainingApi.sessions(userId);
  assert.equal(calls.at(-1).params.participant_user_id, userId);
  await trainingApi.cards(ctx);
  assert.equal(calls.at(-1).url, `/workspaces/${ctx.workspaceId}/cards`);
  assert.equal(calls.at(-1).headers.get("X-User-Id"), userId);
  assert.equal(calls.at(-1).params.limit, 500);
  const count = calls.length;
  await assert.rejects(trainingApi.assignments(""));
  assert.equal(calls.length, count);
});

test("start key persists until success and context is isolated by user", async () => {
  const first = connection.startKey(userId, "assignment");
  assert.equal(connection.startKey(userId, "assignment").key, first.key);
  assert.notEqual(connection.startKey(userId, "other").key, first.key);
  await trainingApi.start(userId, "assignment", first.key);
  assert.equal(calls.at(-1).headers.get("Idempotency-Key"), first.key);
  assert.deepEqual(body(), { user_id: userId });
  connection.saveLaunchContext(ctx);
  assert.deepEqual(connection.loadLaunchContext(userId, ctx.sessionId), ctx);
  assert.equal(
    connection.loadLaunchContext("another-user", ctx.sessionId),
    null,
  );
  first.clear();
  assert.notEqual(connection.startKey(userId, "assignment").key, first.key);
});

test("all card writes use the supplied version and actor; no retry on conflict", async () => {
  await trainingApi.patch(ctx, card, {
    description: "Тест",
    incident_address: "Учебный адрес",
    questionnaire: {},
  });
  assert.equal(body().expected_version, 7);
  assert.equal(body().actor_id, userId);
  assert.ok(body().request_id);
  const features = {
    event_kind_id: 12,
    first_order_feature_id: 21,
    second_order_feature_id: null,
    third_order_feature_id: null,
    feature_schema_id: null,
    additional_features: {},
  };
  await trainingApi.features(ctx, { ...card, version: 8 }, features);
  assert.equal(body().expected_card_version, 8);
  assert.equal(body().event_kind_id, 12);
  await trainingApi.addService(ctx, { ...card, version: 9 }, "service-uuid");
  assert.equal(body().expected_card_version, 9);
  assert.equal(body().service_id, "service-uuid");
  await trainingApi.cardStatus(ctx, card, "PROCESSED", "Учебная обработка");
  assert.equal(body().expected_card_version, 7);
  responseStatus = 409;
  const count = calls.length;
  await assert.rejects(
    trainingApi.patch(ctx, card, {
      description: "Тест",
      incident_address: "",
      questionnaire: {},
    }),
  );
  assert.equal(calls.length, count + 1);
  responseStatus = 200;
});

test("DDS acceptance uses student decision endpoint, later statuses use versioned endpoint", async () => {
  await trainingApi.serviceStatus(ctx, card, "service", "ACCEPTED", "");
  assert.equal(
    calls.at(-1).url,
    `/workspaces/${ctx.workspaceId}/cards/card/decision`,
  );
  assert.equal(body().decision, "ACCEPTED");
  await trainingApi.serviceStatus(ctx, card, "service", "RECEIVED", "");
  assert.equal(
    calls.at(-1).url,
    `/workspaces/${ctx.workspaceId}/cards/card/open`,
  );
  await trainingApi.serviceStatus(
    ctx,
    card,
    "service",
    "RESPONSE_STARTED",
    "Тест",
  );
  assert.equal(calls.at(-1).url, "/card-services/service/statuses");
  assert.equal(body().expected_card_version, 7);
  assert.equal(body().author_id, userId);
});

test("terminal states and service 103 cannot offer invalid refusal transitions", () => {
  assert.deepEqual(rules.allowedServiceStatuses("WORK_COMPLETED", "101"), []);
  assert.deepEqual(rules.allowedServiceStatuses("WORK_REFUSED", "102"), []);
  assert.deepEqual(rules.allowedServiceStatuses("ACCEPTED", "103"), [
    "RESPONSE_STARTED",
  ]);
  assert.deepEqual(rules.allowedServiceStatuses("RECEIVED", "103"), [
    "ACCEPTED",
  ]);
  assert.ok(
    rules.allowedServiceStatuses("RECEIVED", "101").includes("REJECTED"),
  );
});

test("launch availability respects status, policy, dates and attempts", () => {
  const assignment = {
    status: "ASSIGNED",
    launch_policy: "STUDENT_SELF_START",
    max_attempts: 2,
    available_from: null,
    due_at: null,
  };
  assert.equal(rules.assignmentBlocker(assignment, 0), null);
  assert.ok(rules.assignmentBlocker({ ...assignment, status: "COMPLETED" }, 0));
  assert.ok(
    rules.assignmentBlocker(
      { ...assignment, launch_policy: "TEACHER_START" },
      0,
    ),
  );
  assert.ok(rules.assignmentBlocker(assignment, 2));
  assert.ok(
    rules.assignmentBlocker(
      { ...assignment, available_from: "2030-01-01T00:00:00Z" },
      0,
      Date.parse("2026-01-01"),
    ),
  );
  assert.ok(
    rules.assignmentBlocker(
      { ...assignment, due_at: "2025-01-01T00:00:00Z" },
      0,
      Date.parse("2026-01-01"),
    ),
  );
});

test("operator form roundtrip preserves unrelated questionnaire data and full address", () => {
  const draft = structuredClone(emptyOperatorDraft);
  draft.applicant = "Учебный заявитель";
  draft.victim = "Учебный пострадавший";
  draft.description = "Учебное происшествие";
  draft.address = {
    ...draft.address,
    street: "Тестовая",
    house: "1",
    structure: "2",
    entrance: "3",
    floor: "4",
    code: "567",
  };
  const patch = adapter.patchFromDraft(card, draft);
  assert.deepEqual(patch.questionnaire.other, { preserve: true });
  assert.match(patch.incident_address, /стр\. 2/);
  assert.match(patch.incident_address, /подъезд 3/);
  assert.match(patch.incident_address, /этаж 4/);
  const restored = adapter.draftFromCard({ ...card, ...patch });
  assert.equal(restored.applicant, draft.applicant);
  assert.equal(restored.victim, draft.victim);
  assert.deepEqual(restored.address, draft.address);
  assert.equal(restored.description, draft.description);
  assert.equal(
    adapter.draftFromCard(card).address.descriptive,
    "Учебный адрес",
  );
});

test("metadata excludes expected answers from query data", async () => {
  responseData = {
    id: "scenario",
    name: "Учебное",
    definition: { expected_answers: "not for student" },
    difficulty: 1,
    cards_count: 1,
    estimated_duration_seconds: 60,
    description: "",
  };
  const result = await trainingApi.scenario("scenario", userId);
  assert.equal(result.name, "Учебное");
  assert.ok(!("definition" in result));
  responseData = {};
});

test("missing schema is distinct from transport/server failures", async () => {
  const features = {
    event_kind_id: 1,
    first_order_feature_id: null,
    second_order_feature_id: null,
    third_order_feature_id: null,
  };
  responseStatus = 404;
  assert.equal(await trainingApi.schema(features), null);
  responseStatus = 500;
  await assert.rejects(trainingApi.schema(features));
  responseStatus = 200;
});

test("history pagination and audio content retain identity", async () => {
  await trainingApi.history(userId, 20);
  assert.deepEqual(calls.at(-1).params, { limit: 20, offset: 20 });
  await trainingApi.audioContent(userId, "audio");
  assert.equal(calls.at(-1).responseType, "blob");
  assert.equal(calls.at(-1).headers.get("X-User-Id"), userId);
  await trainingApi.complete(ctx);
  assert.deepEqual(body(), { user_id: userId });
});

test("server errors are actionable and do not expose arbitrary response content", () => {
  const error = new axios.AxiosError(
    "test",
    "ERR_BAD_RESPONSE",
    undefined,
    null,
    { status: 500, data: { detail: "private payload" } },
  );
  assert.ok(!apiError(error).includes("private payload"));
  const conflict = new axios.AxiosError(
    "test",
    "ERR_BAD_RESPONSE",
    undefined,
    null,
    { status: 409, data: {} },
  );
  assert.match(apiError(conflict), /Обновите карточку/);
});
