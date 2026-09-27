const pluralRules = new Intl.PluralRules("ru");

const completedAttempts: Partial<Record<Intl.LDMLPluralRule, string>> = {
  one: "завершённой попытке",
  few: "завершённым попыткам",
  many: "завершённым попыткам",
};

const participants: Partial<Record<Intl.LDMLPluralRule, string>> = {
  one: "участник",
  few: "участника",
  many: "участников",
};

const cards: Partial<Record<Intl.LDMLPluralRule, string>> = {
  one: "карточка",
  few: "карточки",
  many: "карточек",
};

export function cardsPhrase(count: number): string {
  return `${count} ${cards[pluralRules.select(count)] ?? "карточки"}`;
}

export function completedAttemptsPhrase(count: number): string {
  return `по ${count} ${completedAttempts[pluralRules.select(count)] ?? "завершённым попыткам"}`;
}

export function participantsPhrase(count: number): string {
  return `${count} ${participants[pluralRules.select(count)] ?? "участников"}`;
}
