import type { Incident } from "@/entities/incident";
import {
  statusLabels,
  type ApiCard,
  type CardListItem,
  type CardPatch,
  type EventKind,
} from "@/entities/training";
import { emptyOperatorDraft, type OperatorCardDraft } from "./operator-cards";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function string(value: unknown) {
  return typeof value === "string" ? value : "";
}
export function draftFromCard(card: ApiCard): OperatorCardDraft {
  const saved = object(card.questionnaire?.operator112);
  const address = object(saved.address);
  const draft = structuredClone(emptyOperatorDraft);
  for (const key of [
    "applicant",
    "victim",
    "applicantStatus",
    "aon",
    "providedPhone",
    "locationPhone",
  ] as const)
    draft[key] = string(saved[key]);
  for (const key of Object.keys(
    draft.address,
  ) as (keyof typeof draft.address)[]) {
    if (typeof address[key] === "string")
      draft.address[key] = string(address[key]);
  }
  if (!Object.keys(address).length)
    draft.address.descriptive =
      card.incident_address ?? card.reported_address ?? "";
  draft.description = card.description;
  return draft;
}
export function patchFromDraft(
  card: ApiCard,
  draft: OperatorCardDraft,
): CardPatch {
  const a = draft.address;
  const incident_address = [
    a.country,
    a.subject,
    a.settlement,
    a.object,
    a.okrug,
    a.district,
    a.street,
    a.house && `д. ${a.house}`,
    a.building && `корп. ${a.building}`,
    a.structure && `стр. ${a.structure}`,
    a.apartment && `кв. ${a.apartment}`,
    a.entrance && `подъезд ${a.entrance}`,
    a.floor && `этаж ${a.floor}`,
    a.descriptive,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    description: draft.description,
    incident_address,
    questionnaire: {
      ...card.questionnaire,
      operator112: {
        ...object(card.questionnaire?.operator112),
        applicant: draft.applicant,
        victim: draft.victim,
        applicantStatus: draft.applicantStatus,
        aon: draft.aon,
        providedPhone: draft.providedPhone,
        locationPhone: draft.locationPhone,
        address: { ...a },
      },
    },
  };
}
export function listIncident(
  card: CardListItem,
  kinds: EventKind[],
  positionCode: string | null,
): Incident {
  const own = card.services_summary.find(
    (s) => s.service_code === positionCode,
  );
  const status = string(own?.status) || card.current_status;
  return {
    id: card.card_number,
    serverId: card.card_id,
    operator: null,
    workstation: null,
    createdAt: card.registered_at,
    type:
      kinds.find((k) => k.id === card.event_kind_id)?.name ??
      "Не классифицировано",
    hasCasualties: card.victims_count === null ? null : card.victims_count > 0,
    address: card.incident_address ?? "—",
    serviceStatus: statusLabels[status] ?? status,
    description: "Открыть карточку",
    descriptionCreatedAt: card.registered_at,
    author: "",
    emergency: false,
  };
}
export function cardIncident(
  card: ApiCard,
  kinds: EventKind[],
  positionCode: string | null,
): Incident {
  const draft = draftFromCard(card);
  const incident = listIncident(
    {
      card_id: card.id,
      card_number: card.card_number,
      workspace_id: card.workspace_id,
      event_type_id: card.event_type_id,
      event_kind_id: card.features?.event_kind_id ?? null,
      incident_address: card.incident_address,
      victims_count: card.victims_count,
      current_status: card.current_status,
      registered_at: card.registered_at,
      version: card.version,
      services_summary: [],
      features_summary: {},
    },
    kinds,
    positionCode,
  );
  return {
    ...incident,
    description: card.description,
    details: {
      applicantName: draft.applicant,
      automaticNumber: draft.aon,
      providedNumber: draft.providedPhone,
      locationPhone: draft.locationPhone,
      addressTitle: card.incident_address ?? "",
      district: draft.address.district,
      ambulanceRefused: false,
      trapped: false,
      urgent: false,
      category: "",
      classification: incident.type,
      externalClassification: "",
      services: [],
    },
  };
}
