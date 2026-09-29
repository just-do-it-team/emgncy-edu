import type { ExpertReviewContext } from "@/shared/api";
import { knownWords, spellingCandidates, type SpellingToken } from "@/shared/lib";
import { referenceTexts, typedTexts, type TypedText } from "./typed-texts";

export interface SpellingField extends TypedText {
  tokens: SpellingToken[];
}

export function spellingFields(context: ExpertReviewContext, participantId: string | null): SpellingField[] {
  const known = knownWords(referenceTexts(context));

  return typedTexts(context, participantId).map((field) => ({ ...field, tokens: spellingCandidates(field.text, known) }));
}

export function spellingWords(fields: SpellingField[]): string[] {
  return fields.flatMap((field) => field.tokens.map((token) => token.word));
}

export function misspellingCount(fields: SpellingField[], misspelled: ReadonlyMap<string, string[]>): number {
  return fields.reduce((sum, field) => sum + field.tokens.filter((token) => misspelled.has(token.word)).length, 0);
}
