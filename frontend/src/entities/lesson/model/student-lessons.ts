export type TrainingMode = "ARM112" | "DDS";

export const trainingModeLabels: Record<TrainingMode, string> = {
  ARM112: "Оператор 112",
  DDS: "ДДС",
};

export interface StudentLesson {
  id: string;
  name: string;
  mode: TrainingMode;
  description: string;
  duration: number;
  difficulty: string;
}

// Назначения для демонстрации интерфейса, не связанные с серверными попытками.
export const studentLessons: StudentLesson[] = [
  {
    id: "112-fire",
    name: "Приём сообщения о пожаре",
    mode: "ARM112",
    description:
      "Уточните адрес, заполните сведения о заявителе и классифицируйте происшествие.",
    duration: 15,
    difficulty: "Базовый",
  },
  {
    id: "112-traffic",
    name: "Дорожно-транспортное происшествие",
    mode: "ARM112",
    description:
      "Заполните карточку ДТП и определите службы по признакам происшествия.",
    duration: 20,
    difficulty: "Средний",
  },
  {
    id: "dds-response",
    name: "Приём карточки и организация реагирования",
    mode: "DDS",
    description:
      "Откройте поступившую карточку, примите её и внесите статусы реагирования.",
    duration: 15,
    difficulty: "Базовый",
  },
];
