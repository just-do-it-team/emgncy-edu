import {
  classifierRecords,
  resolveClassification,
  type Incident,
} from "@/entities/incident";
import {
  statusLabels,
  type ApiCard,
  type CardListItem,
  type CardPatch,
  type EventKind,
  type OperatorClassification,
} from "@/entities/training";
import { emptyOperatorDraft, type OperatorCardDraft } from "./operator-cards";

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}
export function draftFromCard(card: ApiCard): OperatorCardDraft {
  const draft = structuredClone(emptyOperatorDraft);
  // API addresses are complete strings, without the demo form's default prefix.
  draft.address.country = "";
  draft.address.subject = "";
  draft.address.descriptive =
    card.incident_address ?? card.reported_address ?? "";
  draft.description = card.description;
  draft.questions = card.questionnaire?.questions ?? "";
  draft.answers = card.questionnaire?.answers ?? "";
  const record = classifierRecords.find(
    (item) =>
      item.id === card.classification?.record_id &&
      item.codes.every(
        (code, index) =>
          code ===
          [
            card.classification?.group_code,
            card.classification?.feature_1_code,
            card.classification?.feature_2_code,
            card.classification?.feature_3_code,
          ][index],
      ),
  );
  if (record) {
    draft.group = record.group;
    draft.features = [...record.features];
    draft.recordId = record.id;
    draft.flags = card.classification?.routing_flags ?? {};
    draft.excludedServices = card.classification?.excluded_service_codes ?? [];
  }
  return draft;
}

export function classificationFromDraft(
  draft: OperatorCardDraft,
): OperatorClassification {
  const record = resolveClassification(
    draft.group,
    draft.features,
    draft.recordId,
  );
  if (!record)
    throw new Error("Выберите тип происшествия и определяющие признаки.");
  return {
    record_id: record.id,
    group_code: record.codes[0],
    feature_1_code: record.codes[1],
    feature_2_code: record.codes[2],
    feature_3_code: record.codes[3],
    final_incident_type: record.name,
    routing_flags: Object.fromEntries(
      Object.entries(draft.flags).filter(([, selected]) => selected),
    ),
    excluded_service_codes: draft.excludedServices,
  };
}
export function patchFromDraft(
  card: ApiCard,
  draft: OperatorCardDraft,
): CardPatch {
  const addressParts = [
    draft.address.country,
    draft.address.subject,
    draft.address.settlement,
    draft.address.object,
    draft.address.district,
    draft.address.street,
    draft.address.house && `д. ${draft.address.house}`,
    draft.address.building && `корп. ${draft.address.building}`,
    draft.address.structure && `стр. ${draft.address.structure}`,
    draft.address.apartment && `кв. ${draft.address.apartment}`,
  ].filter(Boolean);
  return {
    description: draft.description,
    incident_address: [...addressParts, draft.address.descriptive]
      .filter(Boolean)
      .join(", "),
    questionnaire:
      card.questionnaire === null &&
      draft.questions === "" &&
      draft.answers === ""
        ? null
        : { questions: draft.questions, answers: draft.answers },
    classification: classificationFromDraft(draft),
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
      card.classification?.final_incident_type ??
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
      classification: card.classification,
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
