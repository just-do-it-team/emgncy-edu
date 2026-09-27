import type { ScenarioSourceType } from "@/shared/api";

export const checkModeLegend: Record<ScenarioSourceType, string> = {
  TEMPLATE:
    "В шаблоне режим «не проверяется» недоступен: сервер хранит пустое поле шаблона как требование «должно быть пустым».",
  INLINE:
    "Во встроенной карточке режим «должно быть пустым» недоступен: сервер не хранит пустые поля встроенной карточки, и они не проверяются.",
};
