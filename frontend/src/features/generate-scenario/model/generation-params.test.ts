import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyGenerationParams,
  generationFailure,
  generationRequestBody,
  validateGenerationParams,
  type GenerationParams,
} from "./generation-params.ts";

const teacherId = "6a8c0e2b-4d6f-4a1c-9e3b-5d7f9b1d3f28";

const params = (fields: Partial<GenerationParams>): GenerationParams => ({
  ...emptyGenerationParams,
  group: "Пожар",
  ...fields,
});

describe("запрос генерации сценария", () => {
  it("оператор 112, сложность предлагает ИИ, особенности обрезаны", () => {
    assert.deepEqual(generationRequestBody(params({ notes: "  заявитель путает адрес  " }), teacherId, "gen-1"), {
      teacher_id: teacherId,
      classification_group: "Пожар",
      record_id: null,
      difficulty: null,
      workspace_mode: "INDIVIDUAL",
      required_participant_positions: [null],
      item_count: 3,
      notes: "заявитель путает адрес",
      request_id: "gen-1",
    });
  });

  it("ДДС службы с выбранным типом и сложностью", () => {
    const body = generationRequestBody(
      params({ audience: "DDS", dispatcherCode: "101", recordId: 1050101, difficulty: "3", itemCount: 2 }),
      teacherId,
      "gen-2",
    );

    assert.equal(body.workspace_mode, "INDIVIDUAL");
    assert.deepEqual(body.required_participant_positions, ["101"]);
    assert.equal(body.record_id, 1050101);
    assert.equal(body.difficulty, 3);
    assert.equal(body.notes, null);
  });

  it("общее рабочее место: оператор 112 и службы", () => {
    const body = generationRequestBody(
      params({ audience: "SHARED", sharedCodes: ["101", "103"], sharedWithOperator: true }),
      teacherId,
      "gen-3",
    );

    assert.equal(body.workspace_mode, "SHARED");
    assert.deepEqual(body.required_participant_positions, [null, "101", "103"]);
  });

  it("проверка параметров", () => {
    assert.deepEqual(validateGenerationParams(params({})), {});
    assert.ok(validateGenerationParams({ ...emptyGenerationParams }).group);
    assert.ok(validateGenerationParams(params({ audience: "DDS" })).dispatcherCode);
    assert.ok(validateGenerationParams(params({ audience: "SHARED", sharedCodes: ["101"], sharedWithOperator: false })).sharedCodes);
    assert.ok(validateGenerationParams(params({ itemCount: 11 })).itemCount);
  });
});

describe("недоступность генерации", () => {
  it("нет ручки, не реализовано, сеть — недоступно; отмена — не ошибка", () => {
    assert.equal(generationFailure(404, false), "unavailable");
    assert.equal(generationFailure(501, false), "unavailable");
    assert.equal(generationFailure(undefined, false), "unavailable");
    assert.equal(generationFailure(undefined, true), "cancelled");
    assert.equal(generationFailure(422, false), "rejected");
    assert.equal(generationFailure(500, false), "failed");
  });
});
