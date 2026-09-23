import type { AdditionalFeaturesSchema } from "@/entities/training";

export function validateAdditionalFeatures(
  schema: AdditionalFeaturesSchema | undefined,
  values: Record<string, unknown>,
): string | null {
  if (!schema) return null;
  const properties = schema.properties ?? {};
  for (const key of schema.required ?? []) {
    if (!Object.prototype.hasOwnProperty.call(values, key))
      return `Заполните признак «${properties[key]?.title ?? key}».`;
  }
  for (const [key, value] of Object.entries(values)) {
    const rule = properties[key];
    if (!rule) {
      if (schema.additionalProperties === false)
        return `Признак «${key}» больше не входит в схему. Удалите его перед сохранением.`;
      continue;
    }
    const valid =
      rule.type === "integer"
        ? typeof value === "number" && Number.isSafeInteger(value)
        : rule.type === "number"
          ? typeof value === "number" && Number.isFinite(value)
          : typeof value === rule.type;
    if (!valid || (rule.enum && !rule.enum.some((item) => item === value)))
      return `Проверьте тип и допустимое значение признака «${rule.title ?? key}».`;
  }
  return null;
}
