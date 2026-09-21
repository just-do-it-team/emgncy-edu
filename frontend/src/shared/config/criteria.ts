export type CriterionCode = "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7";

export const criterionCodes: CriterionCode[] = ["C1", "C2", "C3", "C4", "C5", "C6", "C7"];

export const criterionLabels: Record<CriterionCode, string> = {
  C1: "Классификация",
  C2: "Службы",
  C3: "Полнота",
  C4: "Адрес",
  C5: "Тайминг",
  C6: "Грамматика",
  C7: "Статусы реагирования",
};
