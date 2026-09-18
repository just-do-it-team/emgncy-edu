import type { Incident } from "../model/incident";

// Демонстрационные данные до подключения бэкенда. Пустой массив показывает
// состояние без карточек, с заголовками списка и нулевым счетчиком.
export const demoIncidents: Incident[] = [
  {
    id: "36814845",
    operator: 0,
    workstation: 4,
    createdAt: "2026-09-17T11:12:43",
    type: "101",
    hasCasualties: false,
    address: "Москва , (ТАО, Вороновское) , Троицкий административный округ",
    serviceStatus: "Добавлена",
    description: "Пожар в квартире",
    descriptionCreatedAt: "2026-09-17T11:13:19",
    author: "УМЦ О. п.",
    emergency: true,
    details: {
      applicantName: "",
      automaticNumber: "",
      providedNumber: "",
      locationPhone: "",
      addressTitle: "Россия, Москва, (ТАО, Вороновское)",
      district: "Троицкий административный округ",
      ambulanceRefused: false,
      trapped: false,
      urgent: true,
      category:
        "Дом . Открытое пламя / Дым (дом), Запах гари (дом) . Дом многоквартирный . квартира . Есть угроза людям . Есть газификация .",
      classification: "пожар: квартира ;",
      externalClassification: "",
      services: [
        "Служба 101",
        "Служба 104",
        "Служба 102",
        "Деп. ЖКХ",
        "ЦЭМП",
        "ЦОДД",
        "Мос.Без.",
        "Мослифт",
      ].map((name) => ({
        name,
        time: "11:14",
        status: "Добавлена",
        highlighted: name === "Деп. ЖКХ",
      })),
    },
  },
  {
    id: "36814844",
    operator: 0,
    workstation: 4,
    createdAt: "2026-09-17T11:11:01",
    type: "",
    hasCasualties: false,
    address: "",
    serviceStatus: "Добавлена",
    description: "ТЕСТ 1",
    descriptionCreatedAt: "2026-09-17T11:11:37",
    author: "УМЦ О. п.",
    emergency: true,
  },
];
