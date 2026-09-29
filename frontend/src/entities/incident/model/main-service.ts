import type { RoutedService } from "./classifier";

const serviceCodeByPrimary: Record<string, string> = {
  MCHS: "101",
  Police: "102",
  AMBULANCE: "103",
  MOSGAZ: "104",
  MZD: "RZD",
  "Dep.tszn": "DEP_TSZN",
};

export const MAIN_SERVICE_REASON = "главная служба типа происшествия";

/** Код главной службы по полю справочника: если служб несколько, главная — первая. */
export function primaryServiceCode(primary: string | null): string | null {
  const [first] = (primary ?? "").split(",").map((part) => part.trim());

  if (!first) return null;

  return serviceCodeByPrimary[first] ?? (/^[A-Z0-9_]+$/.test(first) ? first : null);
}

/**
 * Главная служба типа происшествия всегда в списке оповещения и первой. Маршруты справочника
 * с обстоятельствами («Правонарушение», «Пострадавшие», «Газификация», «Нет доступа») взаимно
 * исключают ветки служб и могут убрать главную — её пропуск критическая ошибка, поэтому она
 * возвращается независимо от маршрутов. Если служба уже есть среди маршрутов, сохраняются её
 * причины; дублей нет.
 */
export function withMainServiceFirst(services: RoutedService[], main: RoutedService | null): RoutedService[] {
  if (main === null) return services;

  const routed = services.find((service) => service.code === main.code);

  return [routed ?? main, ...services.filter((service) => service.code !== main.code)];
}
