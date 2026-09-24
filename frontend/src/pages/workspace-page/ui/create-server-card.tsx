import { useState } from "react";
import axios from "axios";
import { Modal, NumberInput, Select, Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { resolveClassification, resolveServices } from "@/entities/incident";
import {
  apiError,
  trainingApi,
  type ApiCard,
  type CardFeatures,
  type EmergencyService,
  type EventKind,
  type LaunchContext,
  type ReferenceOption,
} from "@/entities/training";
import {
  createOperatorCard,
  type OperatorCardDraft,
} from "../model/operator-cards";
import { validateAdditionalFeatures } from "../model/additional-features";
import { OperatorCard } from "./operator-card";
import { ServerClassification } from "./server-classification";
import { useIncomingCallAudio } from "./use-incoming-call-audio";

const emptyFeatures: CardFeatures = {
  event_kind_id: 0,
  first_order_feature_id: null,
  second_order_feature_id: null,
  third_order_feature_id: null,
  feature_schema_id: null,
  additional_features: {},
};

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
  opened = true,
  ctx,
  types,
  kinds,
  directory,
  readOnly,
  callId = null,
  callerNumber,
  onClose,
  onCreated,
  onBusyChange,
}: {
  opened?: boolean;
  ctx: LaunchContext;
  types: ReferenceOption[];
  kinds: EventKind[];
  directory: EmergencyService[];
  readOnly: boolean;
  callId?: string | null;
  callerNumber?: string | null;
  onClose: () => void;
  onCreated: (card: ApiCard) => Promise<void> | void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [entry] = useState(() => {
    const next = createOperatorCard();
    next.incident.id = "новая";
    next.draft.aon = callerNumber ?? "";
    return next;
  });
  const [typeId, setTypeId] = useState<string | null>(null);
  const [features, setFeatures] = useState<CardFeatures>(emptyFeatures);
  const [victims, setVictims] = useState<string | number>("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [persistedCard, setPersistedCard] = useState<ApiCard | null>(null);
  const [callEnded, setCallEnded] = useState(false);
  const callAudio = useIncomingCallAudio(
    ctx,
    callId,
    opened && !!callId && !callEnded && !readOnly,
  );
  const schema = useQuery({
    queryKey: [
      "student-api",
      "reference",
      "schema",
      features.event_kind_id,
      features.first_order_feature_id,
      features.second_order_feature_id,
      features.third_order_feature_id,
    ],
    queryFn: ({ signal }) => trainingApi.schema(features, signal),
    enabled: features.event_kind_id > 0,
    staleTime: 300000,
    meta: { showGlobalError: false },
  });

  async function create(draft: OperatorCardDraft) {
    if (busy || readOnly || uncertain || (callId && !callEnded))
      throw new Error("Завершите разговор перед сохранением карточки.");
    const record = resolveClassification(
      draft.group,
      draft.features,
      draft.recordId,
    );
    if (callId && !record)
      throw new Error("Выберите тип происшествия и определяющие признаки.");
    if (
      !typeId ||
      !features.event_kind_id ||
      schema.isFetching ||
      schema.isError
    )
      throw new Error("Выберите категорию и тип учебной карточки.");
    const validationError = validateAdditionalFeatures(
      schema.data?.additional_features_schema,
      features.additional_features,
    );
    if (validationError) throw new Error(validationError);
    if (
      victims !== "" &&
      (typeof victims !== "number" ||
        !Number.isSafeInteger(victims) ||
        victims < 0)
    )
      throw new Error("Количество пострадавших должно быть целым числом.");

    const routed = resolveServices(record, draft.flags);
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
            event_type_id: Number(typeId),
            description: draft.description,
            incident_address: incidentAddress(draft),
            questionnaire:
              draft.questions || draft.answers
                ? { questions: draft.questions, answers: draft.answers }
                : null,
            victims_count: victims === "" ? null : Number(victims),
            features: {
              ...features,
              feature_schema_id: schema.data?.feature_schema_id ?? null,
            },
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

  return (
    <Modal
      opened={opened}
      keepMounted
      fullScreen={!!callId}
      size="xl"
      padding={0}
      withCloseButton={false}
      closeOnEscape={false}
      closeOnClickOutside={false}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <OperatorCard
        entry={entry}
        isNew
        onSave={create}
        onClose={onClose}
        remote={{
          readOnly: readOnly || uncertain,
          lockFields: busy || !!persistedCard,
          canSave:
            !busy &&
            (!callId || callEnded) &&
            !!typeId &&
            !!features.event_kind_id &&
            !schema.isFetching &&
            !schema.isError,
          services: null,
          classification: (
            <Stack gap="sm">
              <Select
                label="Категория учебной карточки"
                required
                data={types.map((type) => ({
                  value: String(type.id),
                  label: type.name,
                }))}
                value={typeId}
                onChange={(id) => {
                  setTypeId(id);
                  setFeatures(emptyFeatures);
                }}
              />
              <NumberInput
                label="Количество пострадавших"
                min={0}
                allowDecimal={false}
                value={victims}
                onChange={setVictims}
              />
              {typeId && (
                <ServerClassification
                  features={features}
                  onChange={setFeatures}
                  kinds={kinds.filter(
                    (kind) => kind.event_type_id === Number(typeId),
                  )}
                  schema={schema.data}
                  schemaError={schema.error}
                  schemaPending={schema.isFetching}
                  showServiceNote={false}
                />
              )}
            </Stack>
          ),
        }}
        incomingCall={
          callId
            ? {
                callerNumber,
                status: callAudio.status,
                error: callAudio.error,
                audioBusy: callAudio.busy,
                onRetry: callAudio.retry,
                ended: callEnded,
                onEnd: () => setCallEnded(true),
                warning: uncertain
                  ? "Результат создания неизвестен. Закройте карточку и проверьте список перед повторным созданием."
                  : undefined,
                directory,
              }
            : undefined
        }
      />
    </Modal>
  );
}
