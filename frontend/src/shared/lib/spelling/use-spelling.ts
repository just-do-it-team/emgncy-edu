import { useQuery } from "@tanstack/react-query";
import { checkWords } from "./spelling-checker";

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export const spellingKeys = {
  all: ["spelling"] as const,
  check: (fingerprint: string) => [...spellingKeys.all, fingerprint] as const,
};

function fingerprint(words: string[]): string {
  let hash = FNV_OFFSET;

  for (const char of words.join("\n")) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), FNV_PRIME) >>> 0;

  return `${words.length}:${hash.toString(36)}`;
}

/** Ключ кэша — отпечаток набора слов, а не сами слова: введённый текст может содержать данные заявителя. */
export function useSpelling(words: string[]) {
  const unique = [...new Set(words)].sort();

  return useQuery({
    queryKey: spellingKeys.check(fingerprint(unique)),
    queryFn: () => checkWords(unique),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: false,
    meta: { showGlobalError: false },
  });
}
