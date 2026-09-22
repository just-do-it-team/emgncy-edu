import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

const reference = readFileSync(
  new URL(
    "../src/entities/incident/data/incident-classifier.json",
    import.meta.url,
  ),
  "utf8",
);
const source = readFileSync(
  new URL("../src/entities/incident/model/classifier.ts", import.meta.url),
  "utf8",
).replace(
  'import source from "../data/incident-classifier.json?raw";',
  `const source = ${JSON.stringify(reference)};`,
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
  },
});
const classifier = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const {
  classifierRecords,
  getFeatureOptions,
  getClassificationMatches,
  resolveClassification,
  resolveServices,
} = classifier;
const fire = resolveClassification("пожар в жилом доме", [
  "жилой дом",
  "квартира",
  "открытое пламя",
]);
const names = (record, flags) =>
  resolveServices(record, flags).map((service) => service.name);

test("all visible classifier records are reachable through dependent criteria", () => {
  for (const record of classifierRecords) {
    for (let level = 0; level < 3; level++) {
      assert.ok(
        getFeatureOptions(record.group, record.features, level).includes(
          record.features[level],
        ),
        String(record.id),
      );
    }
    assert.equal(
      resolveClassification(record.group, record.features, record.id)?.id,
      record.id,
    );
  }
  assert.ok(
    classifierRecords.every(
      (row) => !row.features.includes("Не отображается оператору 112"),
    ),
  );
});

test("incomplete or incompatible criteria never select a record", () => {
  assert.equal(
    resolveClassification("пожар в жилом доме", [null, null, null]),
    undefined,
  );
  assert.equal(
    resolveClassification("пожар в жилом доме", [
      "жилой дом",
      "квартира",
      "unknown",
    ]),
    undefined,
  );
  assert.deepEqual(resolveServices(undefined, { casualties: true }), []);
});

test("apartment fire uses exact reference and additional service conditions", () => {
  assert.equal(fire.id, 1050101);
  assert.ok(names(fire, {}).includes("Служба 101"));
  assert.ok(!names(fire, {}).includes("Служба 103"));
  assert.ok(names(fire, { casualties: true }).includes("Служба 103"));
  assert.ok(
    !names(fire, { casualties: true, absent: true }).includes("Служба 103"),
  );
  assert.ok(!names(fire, {}).includes("Служба 104"));
  assert.ok(names(fire, { gas: true }).includes("Служба 104"));
});

test("ambiguous text requires an explicit final type", () => {
  const record = classifierRecords.find((row) => row.id === 24120100);
  assert.equal(
    getClassificationMatches(record.group, record.features).length,
    2,
  );
  assert.equal(resolveClassification(record.group, record.features), undefined);
  assert.equal(
    resolveClassification(record.group, record.features, 24120200)?.name,
    "БВС Регион",
  );
});

test("services are unique and non-notification instructions never become automatic routes", () => {
  const flags = Object.fromEntries(
    classifier.routingFlags.map(([key]) => [key, true]),
  );
  for (const record of classifierRecords) {
    for (const state of [{}, flags]) {
      const services = resolveServices(record, state);
      assert.equal(
        new Set(services.map((service) => service.name)).size,
        services.length,
      );
      assert.ok(
        services.every((service) =>
          service.reasons.every(
            (reason) =>
              !/нет реагирования|без оповещения|по согласованию/i.test(reason),
          ),
        ),
      );
    }
  }
});

test("changing type cannot retain criteria from previous group", () => {
  assert.equal(resolveClassification("БПЛА", fire.features), undefined);
});
