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
import {
  apiError,
  trainingApi,
  type ApiCard,
  type CardFeatures,
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
import { ServerClassification } from "./server-classification";
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
    refetchInterval: 5000,
    meta: { showGlobalError: false },
  });
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
  const [features, setFeatures] = useState<CardFeatures>(
    () =>
      initial.features ?? {
        event_kind_id: 0,
        first_order_feature_id: null,
        second_order_feature_id: null,
        third_order_feature_id: null,
        feature_schema_id: null,
        additional_features: {},
      },
  );
  const [busy, setBusy] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    if (!features.event_kind_id) throw new Error("Выберите тип происшествия.");
    const required = schema.data?.additional_features_schema.required;
    if (
      Array.isArray(required) &&
      required.some(
        (key) =>
          typeof key === "string" &&
          [undefined, null, ""].includes(
            features.additional_features[key] as undefined | null | string,
          ),
      )
    )
      throw new Error("Заполните обязательные дополнительные признаки.");
    setBusy(true);
    setError(null);
    let coreSaved = false;
    try {
      const updated = await trainingApi.patch(
        ctx,
        card,
        patchFromDraft(card, draft),
      );
      setCard(updated);
      coreSaved = true;
      await trainingApi.features(ctx, updated, {
        ...features,
        feature_schema_id: schema.data?.feature_schema_id ?? null,
      });
      const fresh = await trainingApi.card(ctx, card.id);
      setCard(fresh);
      setFeatures(fresh.features ?? features);
      await onChanged();
    } catch (err) {
      setNeedsRefresh(true);
      throw new Error(
        (coreSaved
          ? "Основные поля сохранены. Сохранение признаков или проверка результата не завершены. "
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
  const services = (
    <ServerServices
      ctx={ctx}
      card={card}
      directory={directory}
      readOnly={disabled}
      onStatus={status}
      onAdd={ctx.mode === "ARM112" ? addService : undefined}
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
        serverServices={services}
        extraContent={info}
      />
    );
  return (
    <Modal
      opened
      onClose={() => {
        if (!busy) onClose();
      }}
      fullScreen
      padding={0}
      withCloseButton={false}
      closeOnEscape={!busy}
      transitionProps={{ duration: 0 }}
    >
      {info}
      <OperatorCard
        entry={operatorEntry}
        isNew={false}
        onSave={save}
        onClose={() => {
          if (!busy) onClose();
        }}
        remote={{
          readOnly,
          canSave:
            !disabled &&
            !!features.event_kind_id &&
            !schema.isFetching &&
            !schema.isError,
          services,
          classification: (
            <ServerClassification
              features={features}
              onChange={setFeatures}
              kinds={kinds.filter(
                (k) => k.event_type_id === card.event_type_id,
              )}
              schema={schema.data}
              schemaError={schema.error}
              schemaPending={schema.isFetching}
            />
          ),
        }}
      />
    </Modal>
  );
}
