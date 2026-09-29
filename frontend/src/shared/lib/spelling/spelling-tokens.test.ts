import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { knownWords, splitByMisspelled, spellingCandidates } from "./spelling-tokens.ts";

describe("орфография: что проверять", () => {
  it("слова с заглавной, короткие и слова из эталона пропускаются", () => {
    const known = knownWords(["ул. Лобачевского, отёк языка"]);
    const tokens = spellingCandidates("Петрова: у женшины отек языка, ДТП на ул. Лобачевского", known);

    assert.deepEqual(
      tokens.map((token) => token.word),
      ["женшины"],
    );
  });

  it("подсветка режет текст по словам с ошибкой", () => {
    const text = "у женшины отек";
    const tokens = spellingCandidates(text, new Set());
    const parts = splitByMisspelled(text, tokens, new Map([["женшины", ["женщины"]]]));

    assert.deepEqual(parts, [
      { text: "у ", misspelled: false },
      { text: "женшины", misspelled: true },
      { text: " отек", misspelled: false },
    ]);
  });
});
