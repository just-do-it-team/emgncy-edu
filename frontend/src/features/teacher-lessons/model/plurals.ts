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

export function completedAttemptsPhrase(count: number): string {
  return `по ${count} ${completedAttempts[pluralRules.select(count)] ?? "завершённым попыткам"}`;
}

export function participantsPhrase(count: number): string {
  return `${count} ${participants[pluralRules.select(count)] ?? "участников"}`;
}
