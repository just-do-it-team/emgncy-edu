export interface CharSpan {
  text: string;
  changed: boolean;
}

const MIN_READABLE_LENGTH = 3;

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && !/\s/.test(character);
}

export function charSpans(value: string, reference: string): CharSpan[] {
  if (value === reference) return [{ text: value, changed: false }];

  const limit = Math.min(value.length, reference.length);

  let prefix = 0;
  while (prefix < limit && value[prefix] === reference[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < limit - prefix &&
    value[value.length - 1 - suffix] === reference[reference.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  let start = prefix;
  let end = value.length - suffix;

  if (end - start < MIN_READABLE_LENGTH) {
    if (start > 0 && isWordCharacter(value[start - 1])) start -= 1;
    if (end < value.length && isWordCharacter(value[end])) end += 1;
  }

  const spans: CharSpan[] = [];

  if (start > 0) spans.push({ text: value.slice(0, start), changed: false });
  if (end > start) spans.push({ text: value.slice(start, end), changed: true });
  if (end < value.length) spans.push({ text: value.slice(end), changed: false });

  return spans.length > 0 ? spans : [{ text: value, changed: false }];
}
