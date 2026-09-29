import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RoutedService } from "./classifier";
import { MAIN_SERVICE_REASON, primaryServiceCode, withMainServiceFirst } from "./main-service.ts";

const service = (code: string): RoutedService => ({ code, name: `Служба ${code}`, reasons: ["маршрут"] });
const main = (primary: string): RoutedService | null => {
  const code = primaryServiceCode(primary);

  return code === null ? null : { code, name: `Служба ${code}`, reasons: [MAIN_SERVICE_REASON] };
};
const codes = (services: RoutedService[]) => services.map((item) => item.code);

describe("главная служба в resolveServices", () => {
  it("газификация: 104 из справочника встаёт первой, хотя маршруты начинаются со 101", () => {
    const result = withMainServiceFirst([service("101"), service("ODS_PSC"), service("MOSOBLGAZ")], main("MOSGAZ"));

    assert.deepEqual(codes(result), ["104", "101", "ODS_PSC", "MOSOBLGAZ"]);
    assert.deepEqual(result[0]?.reasons, [MAIN_SERVICE_REASON]);
  });

  it("правонарушение или пострадавшие убрали маршрут 102 — главная 102 остаётся", () => {
    assert.deepEqual(codes(withMainServiceFirst([service("103"), service("ZODD")], main("Police"))), ["102", "103", "ZODD"]);
  });

  it("нет доступа убрал маршрут 101 — главная 101 остаётся", () => {
    assert.deepEqual(codes(withMainServiceFirst([service("102"), service("103")], main("MCHS"))), ["101", "102", "103"]);
  });

  it("обычный случай: главная уже в маршрутах — встаёт первой без дублей и сохраняет причины маршрута", () => {
    const result = withMainServiceFirst([service("101"), service("104"), service("GKH")], main("MOSGAZ"));

    assert.deepEqual(codes(result), ["104", "101", "GKH"]);
    assert.deepEqual(result[0]?.reasons, ["маршрут"]);
  });

  it("главной в справочнике нет — список как есть", () => {
    const routed = [service("GKH"), service("OEK")];

    assert.deepEqual(withMainServiceFirst(routed, main("МСР")), routed);
    assert.equal(primaryServiceCode("METRO, MZD"), "METRO");
  });
});
