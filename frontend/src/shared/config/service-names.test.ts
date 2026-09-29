import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serviceDisplayName, serviceWithCode } from "./service-names.ts";

describe("названия служб", () => {
  it("профильные службы ЕКП — названием классификатора вместо «Служба NNN»", () => {
    assert.equal(serviceDisplayName("101", "Служба 101"), "Пожарная охрана");
    assert.equal(serviceDisplayName("102", "Служба 102"), "Полиция");
    assert.equal(serviceDisplayName("103", null), "Скорая медицинская помощь");
    assert.equal(serviceDisplayName("104", "Служба 104"), "Аварийная газовая служба");
  });

  it("остальные службы — названием справочника", () => {
    assert.equal(serviceDisplayName("ods", "ОДС ПСЦ"), "ОДС ПСЦ");
    assert.equal(serviceDisplayName("105", null), "Служба 105");
  });

  it("код рядом с названием не дублируется", () => {
    assert.equal(serviceWithCode("101", "Служба 101"), "101 · Пожарная охрана");
    assert.equal(serviceWithCode("105", "Служба 105"), "Служба 105");
    assert.equal(serviceWithCode("ods", "ОДС ПСЦ"), "ods · ОДС ПСЦ");
  });
});
