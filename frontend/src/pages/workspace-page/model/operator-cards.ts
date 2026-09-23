import {
  demoIncidents,
  resolveClassification,
  resolveServices,
  type Incident,
  type RoutingFlags,
} from "@/entities/incident";

export const emptyAddress = {
  country: "Россия",
  subject: "Москва",
  settlement: "",
  object: "",
  okrug: "",
  district: "",
  street: "",
  house: "",
  building: "",
  structure: "",
  apartment: "",
  entrance: "",
  floor: "",
  code: "",
  descriptive: "",
};
export const emptyOperatorDraft = {
  applicant: "",
  victim: "",
  applicantStatus: "",
  aon: "",
  providedPhone: "",
  locationPhone: "",
  address: emptyAddress,
  description: "",
  questions: "",
  answers: "",
  group: "",
  features: [null, null, null] as (string | null)[],
  recordId: null as number | null,
  flags: {} as RoutingFlags,
  manualServices: [] as string[],
};
export type OperatorCardDraft = typeof emptyOperatorDraft;

export interface OperatorCardEntry {
  incident: Incident;
  draft: OperatorCardDraft;
}

export function createOperatorCard(): OperatorCardEntry {
  const now = new Date().toISOString();
  return {
    incident: {
      id: `У-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      operator: 0,
      workstation: 4,
      createdAt: now,
      type: "",
      hasCasualties: false,
      address: "",
      serviceStatus: "Новая",
      description: "",
      descriptionCreatedAt: now,
      author: "УМЦ О. п.",
      emergency: false,
    },
    draft: structuredClone(emptyOperatorDraft),
  };
}

export function saveOperatorCard(
  entry: OperatorCardEntry,
  draft: OperatorCardDraft,
): OperatorCardEntry {
  const record = resolveClassification(
    draft.group,
    draft.features,
    draft.recordId,
  );
  const address = [
    draft.address.country,
    draft.address.subject,
    draft.address.settlement,
    draft.address.street,
    draft.address.house && `д. ${draft.address.house}`,
    draft.address.building && `корп. ${draft.address.building}`,
    draft.address.apartment && `кв. ${draft.address.apartment}`,
    draft.address.descriptive,
  ]
    .filter(Boolean)
    .join(", ");
  const names = [
    ...new Set([
      ...resolveServices(record, draft.flags).map((service) => service.name),
      ...draft.manualServices,
    ]),
  ];
  return {
    draft: structuredClone(draft),
    incident: {
      ...entry.incident,
      type: record?.name ?? "",
      hasCasualties: !!draft.flags.casualties,
      address,
      description: draft.description,
      descriptionCreatedAt: new Date().toISOString(),
      serviceStatus: "Сохранена",
      details: {
        applicantName: draft.applicant,
        automaticNumber: draft.aon,
        providedNumber: draft.providedPhone,
        locationPhone: draft.locationPhone,
        addressTitle: address,
        district: draft.address.district,
        ambulanceRefused: false,
        trapped: !!draft.flags.noAccess,
        urgent: false,
        category: draft.features.filter(Boolean).join(" · "),
        classification: record?.name ?? "",
        externalClassification: record?.externalName ?? "",
        services: names.map((name) => ({
          name,
          time: new Date().toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          status: "Добавлена",
        })),
      },
    },
  };
}

const lessonCards = new Map<string, OperatorCardEntry[]>();

export function getOperatorCards(lessonId: string): OperatorCardEntry[] {
  if (!lessonCards.has(lessonId)) {
    const cards = demoIncidents.map((incident, index) => {
      const draft = structuredClone(emptyOperatorDraft);
      draft.description = incident.description;
      draft.address.descriptive = incident.address;
      if (index === 0) {
        draft.group = "пожар в жилом доме";
        draft.features = ["жилой дом", "квартира", "открытое пламя"];
        draft.flags = { threat: true, gas: true };
      }
      return { incident: structuredClone(incident), draft };
    });
    lessonCards.set(lessonId, cards);
  }
  return structuredClone(lessonCards.get(lessonId)!);
}

export function storeOperatorCards(
  lessonId: string,
  entries: OperatorCardEntry[],
) {
  lessonCards.set(lessonId, structuredClone(entries));
}
