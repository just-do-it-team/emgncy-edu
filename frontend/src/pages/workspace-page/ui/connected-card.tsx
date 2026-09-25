import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { resolveClassification, resolveServices } from "@/entities/incident";
import {
  apiError,
  trainingApi,
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
import { ServerCardStatus } from "./server-card-status";
import { CardAudio } from "./card-audio";

type Props = {
  ctx: LaunchContext;
  cardId: string;
  kinds: EventKind[];
  directory: EmergencyService[];
  readOnly: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
};
export function ConnectedCard(props: Props) {
  const query = useQuery({
    queryKey: [
      "student-api",
      props.ctx.userId,
      props.ctx.workspaceId,
      "card",
      props.cardId,
    ],
    queryFn: ({ signal }) => trainingApi.card(props.ctx, props.cardId, signal),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    meta: { showGlobalError: false },
  });
  if (!query.data && props.ctx.mode === "ARM112")
    return (
      <Stack p="md">
        {query.isPending ? (
          <Loader size="sm" />
        ) : (
          <Alert color="red">
            {apiError(query.error)}{" "}
            <Button onClick={() => void query.refetch()}>Повторить</Button>
          </Alert>
        )}
        <Button variant="default" onClick={props.onClose}>
          К списку карточек
        </Button>
      </Stack>
    );
  if (!query.data)
    return (
      <Modal opened onClose={props.onClose} title="Загрузка карточки">
        {query.isPending ? (
          <Loader size="sm" />
        ) : (
          <Alert color="red">
            {apiError(query.error)}{" "}
            <Button onClick={() => void query.refetch()}>Повторить</Button>
          </Alert>
        )}
      </Modal>
    );
  return <CardEditor {...props} initial={query.data} />;
}
function CardEditor({
  ctx,
  initial,
  kinds,
  directory,
  readOnly,
  onClose,
  onChanged,
}: Props & { initial: ApiCard }) {
  const [card, setCard] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outdated = initial.version > card.version;
  const disabled = readOnly || busy || needsRefresh || outdated;
  async function reload() {
    setBusy(true);
    setError(null);
    try {
      const fresh = await trainingApi.card(ctx, card.id);
      setCard(fresh);
      setNeedsRefresh(false);
      await onChanged();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }
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
    setError(null);
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
      setCard(await trainingApi.card(ctx, card.id));
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
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          Карточка № {card.card_number} · версия {card.version}
        </Text>
        <Button
          size="xs"
          variant="default"
          loading={busy}
          onClick={() => void reload()}
        >
          Обновить данные с сервера
        </Button>
      </Group>
      {outdated && (
        <Alert color="yellow">
          На сервере появилась новая версия карточки. Обновите данные перед
          записью; незавершённая форма сохранится.
        </Alert>
      )}
      {needsRefresh && (
        <Alert color="yellow">
          Перед следующей записью обновите данные с сервера. Введённые поля
          формы и выбранные признаки останутся в форме; проверьте их перед
          повторным сохранением.
        </Alert>
      )}
      {error && <Alert color="red">{error}</Alert>}
      {readOnly && (
        <Alert color="blue">
          Просмотр: занятие завершено или состояние сессии недоступно.
        </Alert>
      )}
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
  const incident = cardIncident(card, kinds, ctx.positionCode);
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
        onClose={() => {
          if (!busy) onClose();
        }}
        onServiceChange={() => {}}
        serverServices={services()}
        extraContent={info}
      />
    );
  return (
    <>
      <OperatorCard
        entry={operatorEntry}
        isNew={false}
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
