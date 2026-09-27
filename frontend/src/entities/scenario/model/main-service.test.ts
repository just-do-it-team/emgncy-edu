import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { primaryServiceCode, restoredMainService, withMainService } from "./main-service.ts";

describe("главная служба по классификатору", () => {
  it("газ: 104 из справочника встаёт первой, хотя маршруты начинаются со 101", () => {
    const routed = ["101", "ODS_PSC", "MOSOBLGAZ", "GKU_NTU"];
    const main = primaryServiceCode("MOSGAZ");

    assert.deepEqual(withMainService(routed, main), ["104", "101", "ODS_PSC", "MOSOBLGAZ", "GKU_NTU"]);
    assert.equal(restoredMainService(routed, main), "104");
  });

  it("правонарушение: 102 не пропадает, когда признак убрал его из маршрутов", () => {
    const routed = ["103", "ZODD", "ROSGVARDIA"];
    const main = primaryServiceCode("Police");

    assert.deepEqual(withMainService(routed, main), ["102", "103", "ZODD", "ROSGVARDIA"]);
    assert.equal(restoredMainService(routed, main), "102");
  });

  it("нет доступа: 101 не пропадает", () => {
    const routed = ["102", "103", "ZEMP"];

    assert.deepEqual(withMainService(routed, primaryServiceCode("MCHS")), ["101", "102", "103", "ZEMP"]);
  });

  it("обычный случай: главная уже первая — список не меняется, пометки нет", () => {
    const routed = ["101", "102", "MOSOBLGAZ", "GKH"];

    assert.deepEqual(withMainService(routed, "101"), routed);
    assert.equal(restoredMainService(routed, "101"), null);
  });

  it("главная не первая — переставляется без дублей", () => {
    assert.deepEqual(withMainService(["101", "104", "101"], "104"), ["104", "101"]);
  });

  it("главной в справочнике нет — список как есть", () => {
    assert.deepEqual(withMainService(["GKH", "OEK"], primaryServiceCode(null)), ["GKH", "OEK"]);
    assert.equal(primaryServiceCode("METRO, MZD"), "METRO");
    assert.equal(primaryServiceCode("МСР"), null);
  });
});
