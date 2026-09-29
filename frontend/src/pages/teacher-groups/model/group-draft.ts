const MAX_NAME_LENGTH = 255;

export interface GroupFieldsValues {
  name: string;
  description: string;
}

export function validateGroupName(value: string): string | null {
  if (value.trim() === "") return "Введите название группы.";
  if (value.trim().length > MAX_NAME_LENGTH) return `Не длиннее ${MAX_NAME_LENGTH} символов.`;

  return null;
}

export function descriptionOrNull(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}
