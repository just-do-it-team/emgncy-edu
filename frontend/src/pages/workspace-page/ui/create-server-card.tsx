import { useState } from "react";
import axios from "axios";
import { resolveClassification, resolveServices } from "@/entities/incident";
import {
  apiError,
  trainingApi,
  type ApiCard,
  type EmergencyService,
  type LaunchContext,
} from "@/entities/training";
import {
  type OperatorCardEntry,
  type OperatorCardDraft,
} from "../model/operator-cards";
import { classificationFromDraft } from "../model/api-card-adapter";
import { OperatorCard } from "./operator-card";

function incidentAddress(draft: OperatorCardDraft) {
  const address = draft.address;
  return [
    address.country,
    address.subject,
    address.settlement,
    address.object,
    address.district,
    address.street,
    address.house && `д. ${address.house}`,
    address.building && `корп. ${address.building}`,
    address.structure && `стр. ${address.structure}`,
    address.apartment && `кв. ${address.apartment}`,
    address.descriptive,
  ]
    .filter(Boolean)
    .join(", ");
}

export function CreateServerCard({
  opened,
  entry,
  ctx,
  directory,
  readOnly,
  callId = null,
  callerNumber,
  callEnded,
  onHangUp,
  onClose,
  onDraftChange,
  onCreated,
  onBusyChange,
}: {
  opened: boolean;
  entry: OperatorCardEntry;
  ctx: LaunchContext;
  directory: EmergencyService[];
  readOnly: boolean;
  callId?: string | null;
  callerNumber?: string | null;
  callEnded: boolean;
  onHangUp: () => void;
  onClose: () => void;
  onDraftChange: (draft: OperatorCardDraft) => void;
  onCreated: (card: ApiCard) => Promise<void> | void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [persistedCard, setPersistedCard] = useState<ApiCard | null>(null);

  async function create(draft: OperatorCardDraft) {
    if (busy || readOnly || uncertain || (callId && !callEnded))
      throw new Error("Завершите разговор перед сохранением карточки.");
    const record = resolveClassification(
      draft.group,
      draft.features,
      draft.recordId,
    );
    if (!record)
      throw new Error("Выберите тип происшествия и определяющие признаки.");

    const routed = resolveServices(record, draft.flags).filter(
      (service) => !draft.excludedServices.includes(service.code),
    );
    const byCode = new Map(
      directory
        .filter((service) => service.is_active)
        .map((service) => [service.code, service]),
    );
    const unavailable = routed.filter((service) => !byCode.has(service.code));
    if (unavailable.length)
      throw new Error(
        `В справочнике API нет служб: ${unavailable.map((service) => service.name).join(", ")}.`,
      );
    const manualIds = draft.manualServices;
    if (
      manualIds.some(
        (id) =>
          !directory.some((service) => service.id === id && service.is_active),
      )
    )
      throw new Error("Одна из добавленных вручную служб больше недоступна.");

    setBusy(true);
    onBusyChange(true);
    let createdCard: ApiCard | null = persistedCard;
    try {
      let card = persistedCard
        ? await trainingApi.card(ctx, persistedCard.id)
        : await trainingApi.createCard(ctx, {
            classification: classificationFromDraft(draft),
            description: draft.description,
            applicant_full_name: draft.applicant.trim() || null,
            automatic_phone_number: draft.aon.trim() || null,
            provided_phone_number: draft.providedPhone.trim() || null,
            location_phone_number: draft.locationPhone.trim() || null,
            incident_address: incidentAddress(draft),
            questionnaire:
              draft.questions || draft.answers
                ? { questions: draft.questions, answers: draft.answers }
                : null,
          });
      createdCard = card;
      setPersistedCard(card);
      if (callId) {
        const serviceIds = [
          ...new Set([
            ...routed.map((service) => byCode.get(service.code)!.id),
            ...manualIds,
          ]),
        ];
        for (const serviceId of serviceIds) {
          if (
            card.services.some(
              (service) =>
                service.service_id === serviceId && service.is_active,
            )
          )
            continue;
          await trainingApi.addService(ctx, card, serviceId);
          card = await trainingApi.card(ctx, card.id);
        }
        if (card.current_status !== "PROCESSED")
          card = await trainingApi.cardStatus(ctx, card, "PROCESSED", "");
      }
      await onCreated(card);
    } catch (error) {
      setUncertain(
        !createdCard &&
          axios.isAxiosError(error) &&
          (!error.response || error.response.status >= 500),
      );
      throw new Error(
        createdCard
          ? `Карточка № ${createdCard.card_number} создана, но сохранить её полностью не удалось. Повторите сохранение. ${apiError(error)}`
          : apiError(error),
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  if (!opened) return null;
  return (
    <OperatorCard
      entry={entry}
      isNew
      embedded
      onSave={create}
      onClose={onClose}
      onDraftChange={onDraftChange}
      remote={{
        readOnly: readOnly || uncertain,
        lockFields: busy || !!persistedCard,
        canSave: !busy && (!callId || callEnded),
        services: null,
      }}
      incomingCall={
        callId
          ? {
              callerNumber,
              ended: callEnded,
              onEnd: onHangUp,
              warning: uncertain
                ? "Результат создания неизвестен. Закройте карточку и проверьте список перед повторным созданием."
                : undefined,
              directory,
            }
          : undefined
      }
    />
  );
}
