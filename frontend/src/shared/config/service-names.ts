const EKP_SERVICE_NAMES: Record<string, string> = {
  "101": "Пожарная охрана",
  "102": "Полиция",
  "103": "Скорая медицинская помощь",
  "104": "Аварийная газовая служба",
};

const SERVICE_PLACEHOLDER = /^Служба\s+(\d+)$/;

/**
 * Отображаемое название службы. Справочник сервера называет профильные службы «Служба 101»,
 * поэтому для кодов ЕКП берётся название из классификатора, а у остальных служб — название
 * справочника как есть.
 */
export function serviceDisplayName(code: string, directoryName: string | null): string {
  const placeholderCode = directoryName?.trim().match(SERVICE_PLACEHOLDER)?.[1];
  const known = EKP_SERVICE_NAMES[code] ?? (placeholderCode ? EKP_SERVICE_NAMES[placeholderCode] : undefined);

  if (known) return known;

  return directoryName?.trim() || `Служба ${code}`;
}

/** «101 · Пожарная охрана»; код не дублируется, если он уже есть в названии. */
export function serviceWithCode(code: string, directoryName: string | null): string {
  const name = serviceDisplayName(code, directoryName);

  return name.includes(code) ? name : `${code} · ${name}`;
}
