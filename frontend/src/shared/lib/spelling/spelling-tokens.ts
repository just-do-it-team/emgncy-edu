export interface SpellingToken {
  word: string;
  start: number;
  end: number;
}

export interface TextPart {
  text: string;
  misspelled: boolean;
}

const WORD = /[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g;
const MIN_WORD_LENGTH = 3;

function normalized(word: string): string {
  return word.toLocaleLowerCase("ru").replace(/ё/g, "е");
}

/** Слова из эталона и классификатора: их написание заведомо верное, даже если словаря нет. */
export function knownWords(texts: string[]): Set<string> {
  return new Set(texts.flatMap((text) => [...text.matchAll(WORD)].map((match) => normalized(match[0]))));
}

/**
 * Слова, которые стоит проверять по словарю. С заглавной буквы — имена, фамилии, названия улиц и
 * аббревиатуры: словарь их почти не знает, и такая «ошибка» была бы ложной, поэтому они пропускаются
 * вместе с началом предложения. Короткие слова и слова из эталона тоже не проверяются.
 */
export function spellingCandidates(text: string, known: ReadonlySet<string>): SpellingToken[] {
  return [...text.matchAll(WORD)].flatMap((match) => {
    const word = match[0];
    const first = word.charAt(0);

    if (word.length < MIN_WORD_LENGTH || first !== first.toLocaleLowerCase("ru") || known.has(normalized(word))) return [];

    return [{ word, start: match.index, end: match.index + word.length }];
  });
}

export function splitByMisspelled(text: string, tokens: SpellingToken[], misspelled: ReadonlyMap<string, string[]>): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;

  for (const token of tokens) {
    if (!misspelled.has(token.word)) continue;
    if (token.start > cursor) parts.push({ text: text.slice(cursor, token.start), misspelled: false });
    parts.push({ text: token.word, misspelled: true });
    cursor = token.end;
  }

  if (cursor < text.length) parts.push({ text: text.slice(cursor), misspelled: false });

  return parts;
}
