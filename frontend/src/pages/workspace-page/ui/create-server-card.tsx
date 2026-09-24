import { useState } from "react";
import axios from "axios";
import {
  Alert,
  Button,
  Fieldset,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Textarea,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import {
  apiError,
  trainingApi,
  type ApiCard,
  type CardFeatures,
  type EventKind,
  type LaunchContext,
  type ReferenceOption,
} from "@/entities/training";
import { validateAdditionalFeatures } from "../model/additional-features";
import { ServerClassification } from "./server-classification";

const emptyFeatures: CardFeatures = {
  event_kind_id: 0,
  first_order_feature_id: null,
  second_order_feature_id: null,
  third_order_feature_id: null,
  feature_schema_id: null,
  additional_features: {},
};

export function CreateServerCard({
  ctx,
  types,
  kinds,
  readOnly,
  incomingCall = false,
  onClose,
  onCreated,
}: {
  ctx: LaunchContext;
  types: ReferenceOption[];
  kinds: EventKind[];
  readOnly: boolean;
  incomingCall?: boolean;
  onClose: () => void;
  onCreated: (card: ApiCard) => void;
}) {
  const [typeId, setTypeId] = useState<string | null>(null);
  const [features, setFeatures] = useState(emptyFeatures);
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState("");
  const [answers, setAnswers] = useState("");
  const [victims, setVictims] = useState<string | number>("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
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
  async function create() {
    if (
      busy ||
      readOnly ||
      uncertain ||
      !typeId ||
      !features.event_kind_id ||
      schema.isFetching ||
      schema.isError
    )
      return;
    const validationError = validateAdditionalFeatures(
      schema.data?.additional_features_schema,
      features.additional_features,
    );
    if (validationError || !address.trim() || !description.trim()) {
      setError(validationError ?? "Заполните адрес и описание происшествия.");
      return;
    }
    if (
      victims !== "" &&
      (typeof victims !== "number" ||
        !Number.isSafeInteger(victims) ||
        victims < 0)
    ) {
      setError(
        "Количество пострадавших должно быть целым неотрицательным числом.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const card = await trainingApi.createCard(ctx, {
        event_type_id: Number(typeId),
        description,
        incident_address: address,
        questionnaire: questions || answers ? { questions, answers } : null,
        victims_count: victims === "" ? null : Number(victims),
        features: {
          ...features,
          feature_schema_id: schema.data?.feature_schema_id ?? null,
        },
      });
      onCreated(card);
    } catch (err) {
      // Creating a card has no idempotency key: a timeout must not cause a second POST.
      setUncertain(
        axios.isAxiosError(err) &&
          (!err.response || err.response.status >= 500),
      );
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      opened
      title={
        incomingCall
          ? "Карточка входящего звонка"
          : "Новая карточка происшествия"
      }
      size="xl"
      fullScreen={incomingCall}
      onClose={() => {
        if (!busy) onClose();
      }}
      closeOnEscape={!busy}
      closeOnClickOutside={false}
    >
      <Stack>
        {error && <Alert color="red">{error}</Alert>}
        {uncertain && (
          <Alert color="yellow">
            Результат создания неизвестен. Закройте форму и обновите список
            карточек. Если карточка появилась, откройте её или выберите для
            привязки к звонку. Создавайте заново только после проверки списка.
          </Alert>
        )}
        <Fieldset disabled={busy || readOnly || uncertain}>
          <Stack>
            <Select
              label="Категория происшествия"
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
            <Textarea
              label="Адрес происшествия"
              required
              autosize
              value={address}
              onChange={(e) => setAddress(e.currentTarget.value)}
            />
            <Textarea
              label="Описание происшествия"
              required
              autosize
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
            />
            <NumberInput
              label="Количество пострадавших"
              min={0}
              allowDecimal={false}
              value={victims}
              onChange={setVictims}
            />
            <Textarea
              label="Вопросы"
              autosize
              value={questions}
              onChange={(e) => setQuestions(e.currentTarget.value)}
            />
            <Textarea
              label="Ответы"
              autosize
              value={answers}
              onChange={(e) => setAnswers(e.currentTarget.value)}
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
              />
            )}
          </Stack>
        </Fieldset>
        <Group justify="flex-end">
          <Button variant="default" disabled={busy} onClick={onClose}>
            Закрыть
          </Button>
          <Button
            loading={busy}
            disabled={
              readOnly ||
              uncertain ||
              !typeId ||
              !features.event_kind_id ||
              schema.isFetching ||
              schema.isError
            }
            onClick={() => void create()}
          >
            Создать карточку
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
