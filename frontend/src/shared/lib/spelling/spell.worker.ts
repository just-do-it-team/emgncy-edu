import nspell from "nspell";

interface CheckRequest {
  id: number;
  words: string[];
}

const MAX_SUGGESTIONS = 3;

const dictionaryUrls = {
  aff: new URL("../../../../node_modules/dictionary-ru/index.aff", import.meta.url).href,
  dic: new URL("../../../../node_modules/dictionary-ru/index.dic", import.meta.url).href,
};

async function loadChecker() {
  const [aff, dic] = await Promise.all([
    fetch(dictionaryUrls.aff).then((response) => response.text()),
    fetch(dictionaryUrls.dic).then((response) => response.text()),
  ]);

  return nspell(aff, dic);
}

let checker: ReturnType<typeof nspell> | null = null;

self.addEventListener("message", (event: MessageEvent<CheckRequest>) => {
  const { id, words } = event.data;

  void (async () => {
    try {
      checker ??= await loadChecker();

      const spell = checker;
      const misspelled = words
        .filter((word) => !spell.correct(word) && !spell.correct(word.toLocaleLowerCase("ru")))
        .map((word) => [word, spell.suggest(word).slice(0, MAX_SUGGESTIONS)] as const);

      self.postMessage({ id, misspelled });
    } catch {
      self.postMessage({ id, failed: true });
    }
  })();
});
