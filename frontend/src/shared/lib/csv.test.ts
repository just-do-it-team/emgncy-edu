import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toCsv } from "./csv.ts";

describe("CSV", () => {
  it("BOM, разделитель «;», CRLF и экранирование кавычек и разделителя", () => {
    const csv = toCsv(["Обучаемый", "Балл"], [["Иванов; Валентин", "80,5"], ['Группа «4» "А"', "—"]]);

    assert.equal(csv, '﻿Обучаемый;Балл\r\n"Иванов; Валентин";80,5\r\n"Группа «4» ""А""";—\r\n');
  });
});
