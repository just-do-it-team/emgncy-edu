import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ScenarioListItem, ScenarioTemplate } from "@/shared/api";
import { activeUsages, groupTemplates, templateUsages } from "./template-library.ts";

function template(id: string, templateKey: string, version: number, kind: ScenarioTemplate["kind"] = "card"): ScenarioTemplate {
  return {
    id,
    templateKey,
    kind,
    variant: kind === "call" ? "call" : "card112",
    version,
    name: `Шаблон ${templateKey} v${version}`,
    description: null,
    difficulty: 1,
    isActive: true,
    createdBy: "teacher",
    createdAt: "2026-09-20T10:00:00+03:00",
    initialCard: null,
    initialCall: null,
    expectedResult: {},
    recordId: null,
    services: [],
  };
}

function scenario(id: string, status: ScenarioListItem["status"], templateIds: string[]): ScenarioListItem {
  return {
    id,
    name: `Сценарий ${id}`,
    difficulty: 1,
    status,
    createdBy: "teacher",
    updatedAt: "2026-09-21T10:00:00+03:00",
    itemsCount: templateIds.length,
    composition: { itemTypes: [], procedural: false },
    templateIds,
  };
}

describe("groupTemplates", () => {
  it("версии одного ключа собираются в одну запись, последняя — с наибольшим номером", () => {
    const entries = groupTemplates([template("a1", "a", 1), template("a3", "a", 3), template("a2", "a", 2)]);

    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.latest.id, "a3");
    assert.deepEqual(
      entries[0]?.versions.map((item) => item.version),
      [3, 2, 1],
    );
  });

  it("одинаковый ключ у карточки и звонка — разные шаблоны", () => {
    assert.equal(groupTemplates([template("c", "k", 1, "card"), template("z", "k", 1, "call")]).length, 2);
  });
});

describe("templateUsages", () => {
  const [entry] = groupTemplates([template("a1", "a", 1), template("a2", "a", 2)]);

  it("ссылка на старую версию отмечена устаревшей, архивные сценарии не блокируют деактивацию", () => {
    assert.ok(entry);

    const usages = templateUsages(entry, [
      scenario("s1", "PUBLISHED", ["a1"]),
      scenario("s2", "DRAFT", ["a2", "a2"]),
      scenario("s3", "ARCHIVED", ["a1"]),
      scenario("s4", "DRAFT", ["other"]),
    ]);

    assert.deepEqual(
      usages.map((usage) => [usage.scenarioId, usage.version, usage.outdated]),
      [
        ["s1", 1, true],
        ["s2", 2, false],
        ["s3", 1, true],
      ],
    );
    assert.deepEqual(
      activeUsages(usages).map((usage) => usage.scenarioId),
      ["s1", "s2"],
    );
  });
});
