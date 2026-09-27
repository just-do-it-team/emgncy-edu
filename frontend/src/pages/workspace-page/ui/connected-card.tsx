import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Loader, Stack, Text } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  resolveClassification,
  resolveServices,
  type Incident,
} from "@/entities/incident";
import {
  apiError,
  notifyTrainingError,
  trainingApi,
  trainingKeys,
  type ApiCard,
  type CardService,
  type EmergencyService,
  type EventKind,
  type LaunchContext,
} from "@/entities/training";
import {
  cardIncident,
  draftFromCard,
  patchFromDraft,
} from "../model/api-card-adapter";
import type { OperatorCardDraft } from "../model/operator-cards";
import { OperatorCard } from "./operator-card";
import { IncidentViewer } from "./incident-viewer";
import { ServerServices } from "./server-services";
import { DdsServices } from "./dds-services";
import { ServerCardStatus } from "./server-card-status";
import { CardAudio } from "./card-audio";
import { ProcessedCardView } from "./processed-card-view";

type Props = {
  ctx: LaunchContext;
  cardId: string;
  kinds: EventKind[];
  directory: EmergencyService[];
  readOnly: boolean;
  summary?: Incident;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onSyncStateChange: (state: CardSyncState) => void;
};
export type CardSyncState = {
  cardId: string;
  message: string | null;
  busy: boolean;
  refresh: () => void;
};
export function ConnectedCard(props: Props) {
  const { cardId, ctx, onClose, onSyncStateChange } = props;
  const queryClient = useQueryClient();
  const [editingProcessed, setEditingProcessed] = useState(false);
  const queryKey = trainingKeys.card(ctx, cardId);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => trainingApi.card(ctx, cardId, signal),
    refetchInterval: ctx.mode === "DDS" ? 5000 : false,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    meta: { showGlobalError: false },
  });
  const { refetch } = query;
  const retryLoad = useCallback(() => {
    void refetch();
  }, [refetch]);
  useEffect(() => {
    if (query.data) return;
    onSyncStateChange({
      cardId,
      message: query.isError ? "Не удалось загрузить карточку." : null,
      busy: query.isFetching,
      refresh: retryLoad,
    });
  }, [
    cardId,
    onSyncStateChange,
    query.data,
    query.error,
    query.isError,
    query.isFetching,
    retryLoad,
  ]);
  useEffect(() => {
    if (
      !query.data ||
      ctx.mode !== "ARM112" ||
      query.data.current_status !== "PROCESSED" ||
      editingProcessed
    )
      return;
    onSyncStateChange({
      cardId,
      message: null,
      busy: query.isFetching,
      refresh: retryLoad,
    });
  }, [
    cardId,
    ctx.mode,
    editingProcessed,
    onSyncStateChange,
    query.data,
    query.isFetching,
    retryLoad,
  ]);
  if (!query.data)
    return (
      <Stack p="md" align="flex-start">
        {query.isFetching && <Loader size="sm" />}
        <Button variant="default" onClick={onClose}>
          К списку карточек
        </Button>
      </Stack>
    );
  if (
    props.ctx.mode === "ARM112" &&
    query.data.current_status === "PROCESSED"
  ) {
    if (!editingProcessed)
      return (
        <ProcessedCardView
          card={query.data}
          ctx={props.ctx}
          directory={props.directory}
          onEdit={props.readOnly ? undefined : () => setEditingProcessed(true)}
          onClose={props.onClose}
        />
      );
    return (
      <CardEditor
        {...props}
        initial={query.data}
        startEditing
        onClose={() => setEditingProcessed(false)}
        onSaved={(card) => {
          queryClient.setQueryData(queryKey, card);
          setEditingProcessed(false);
        }}
      />
    );
  }
  return <CardEditor {...props} initial={query.data} />;
}
function CardEditor({
  ctx,
  initial,
  kinds,
  directory,
  readOnly,
  summary,
  onClose,
  onChanged,
  onSyncStateChange,
  onSaved,
  startEditing = false,
}: Props & {
  initial: ApiCard;
  onSaved?: (card: ApiCard) => void;
  startEditing?: boolean;
}) {
  const [card, setCard] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const outdated = initial.version > card.version;
  const disabled = readOnly || busy || needsRefresh || outdated;
  useEffect(() => {
    if (ctx.mode === "DDS" && initial.version > card.version && !busy) {
      setCard(initial);
      setNeedsRefresh(false);
    }
  }, [busy, card.version, ctx.mode, initial]);
  async function loadUpdatedCard(previousVersion: number) {
    for (let attempt = 0; attempt < 7; attempt++) {
      const fresh = await trainingApi.card(ctx, card.id);
      if (fresh.version > previousVersion) return fresh;
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    }
    throw new Error(
      "Карточка сохранена, но обновлённая версия ещё недоступна. Обновите данные с сервера.",
    );
  }
  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const fresh = await trainingApi.card(ctx, card.id);
      setCard(fresh);
      setNeedsRefresh(false);
      await onChanged();
    } catch (err) {
      setNeedsRefresh(true);
      notifyTrainingError(err);
    } finally {
      setBusy(false);
    }
  }, [card.id, ctx, onChanged]);
  useEffect(() => {
    if (ctx.mode !== "DDS" || !needsRefresh || busy) return;
    const timer = window.setTimeout(() => void reload(), 5000);
    return () => window.clearTimeout(timer);
  }, [busy, ctx.mode, needsRefresh, reload]);
  const syncMessage =
    ctx.mode === "DDS"
      ? null
      : readOnly
        ? "Карточка доступна только для просмотра."
        : needsRefresh
          ? "Перед следующей записью обновите карточку."
          : outdated
            ? "На сервере появилась новая версия карточки. Обновите данные перед записью."
            : null;
  useEffect(() => {
    onSyncStateChange({
      cardId: card.id,
      message: syncMessage,
      busy,
      refresh: () => void reload(),
    });
  }, [busy, card.id, onSyncStateChange, reload, syncMessage]);
  async function save(draft: OperatorCardDraft) {
    if (disabled) throw new Error("Сначала обновите карточку.");
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
    const activeServices = new Map(
      directory
        .filter((service) => service.is_active)
        .map((service) => [service.code, service]),
    );
    const unavailable = routed.filter(
      (service) => !activeServices.has(service.code),
    );
    if (unavailable.length)
      throw new Error(
        `В справочнике API нет служб: ${unavailable.map((service) => service.name).join(", ")}.`,
      );
    setBusy(true);
    let coreSaved = false;
    try {
      let updated = await trainingApi.patch(
        ctx,
        card,
        patchFromDraft(card, draft),
      );
      setCard(updated);
      coreSaved = true;
      for (const service of routed) {
        const serviceId = activeServices.get(service.code)!.id;
        if (
          updated.services.some(
            (item) => item.service_id === serviceId && item.is_active,
          )
        )
          continue;
        await trainingApi.addService(ctx, updated, serviceId);
        updated = await trainingApi.card(ctx, card.id);
        setCard(updated);
      }
      const fresh = await trainingApi.card(ctx, card.id);
      setCard(fresh);
      await onChanged();
      onSaved?.(fresh);
    } catch (err) {
      setNeedsRefresh(true);
      throw new Error(
        (coreSaved
          ? "Поля карточки сохранены, но добавление служб или проверка результата не завершены. "
          : "") + apiError(err),
      );
    } finally {
      setBusy(false);
    }
  }
  async function status(service: CardService, next: string, comment: string) {
    if (disabled) throw new Error("Сначала обновите карточку.");
    setBusy(true);
    try {
      await trainingApi.serviceStatus(ctx, card, service.id, next, comment);
      setCard(await loadUpdatedCard(card.version));
      await onChanged();
    } catch (err) {
      setNeedsRefresh(true);
      throw err;
    } finally {
      setBusy(false);
    }
  }
  async function addService(serviceId: string) {
    if (disabled) throw new Error("Сначала обновите карточку.");
    setBusy(true);
    try {
      await trainingApi.addService(ctx, card, serviceId);
      setCard(await trainingApi.card(ctx, card.id));
      await onChanged();
    } catch (err) {
      setNeedsRefresh(true);
      throw err;
    } finally {
      setBusy(false);
    }
  }
  async function cardStatus(status: string, reason: string) {
    if (disabled) throw new Error("Сначала обновите карточку.");
    setBusy(true);
    try {
      setCard(await trainingApi.cardStatus(ctx, card, status, reason));
      await onChanged();
    } catch (err) {
      setNeedsRefresh(true);
      throw err;
    } finally {
      setBusy(false);
    }
  }
  const services = (expanded = true) => (
    <ServerServices
      ctx={ctx}
      card={card}
      directory={directory}
      readOnly={disabled}
      onStatus={status}
      onAdd={ctx.mode === "ARM112" ? addService : undefined}
      expanded={expanded}
    />
  );
  const info = (
    <Stack p="sm" gap="xs">
      <Text size="xs" c="dimmed">
        Карточка № {card.card_number} · версия {card.version}
      </Text>
      <ServerCardStatus
        ctx={ctx}
        card={card}
        readOnly={disabled}
        onChange={cardStatus}
      />
      <CardAudio ctx={ctx} cardId={card.id} />
      {ctx.mode === "DDS" && (
        <Stack gap="xs" aria-label="Анкета">
          <Text fw={600}>Анкета</Text>
          {card.questionnaire === null ? (
            <Text size="sm">Анкета не заполнена</Text>
          ) : (
            <>
              <Text size="sm" fw={500}>
                Вопросы
              </Text>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {card.questionnaire.questions || "—"}
              </Text>
              <Text size="sm" fw={500}>
                Ответы
              </Text>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {card.questionnaire.answers || "—"}
              </Text>
            </>
          )}
        </Stack>
      )}
    </Stack>
  );
  const incident = {
    ...cardIncident(card, kinds, ctx.positionCode),
    type: ctx.positionCode ?? card.classification?.final_incident_type ?? "",
    operator: summary?.operator ?? null,
    workstation: summary?.workstation ?? null,
    author: summary?.author ?? "",
    descriptionCreatedAt: summary?.descriptionCreatedAt ?? card.registered_at,
  };
  const operatorEntry = useMemo(
    () => ({
      incident: cardIncident(card, kinds, ctx.positionCode),
      draft: draftFromCard(card),
    }),
    [card, kinds, ctx.positionCode],
  );
  if (ctx.mode === "DDS")
    return (
      <IncidentViewer
        incident={incident}
        ddsMode
        onClose={() => {
          if (!busy) onClose();
        }}
        onServiceChange={() => {}}
        serverServices={
          <DdsServices
            ctx={ctx}
            card={card}
            directory={directory}
            readOnly={disabled}
            onStatus={status}
          />
        }
      />
    );
  return (
    <>
      <OperatorCard
        entry={operatorEntry}
        isNew={false}
        startEditing={startEditing}
        embedded
        onSave={save}
        onClose={() => {
          if (!busy) onClose();
        }}
        remote={{
          readOnly,
          canSave: !disabled,
          services,
          serviceCount: card.services.filter(
            (service) => service.is_active && service.is_visible,
          ).length,
        }}
      />
      <details>
        <summary>Состояние учебной карточки и запись звонка</summary>
        {info}
      </details>
    </>
  );
}
