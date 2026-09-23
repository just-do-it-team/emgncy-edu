import { useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { Phone, Plus, Save, X } from "lucide-react";
import {
  classifierGroups,
  classifierRecords,
  getFeatureOptions,
  getClassificationMatches,
  resolveClassification,
  resolveServices,
  routingFlags,
  useServiceDirectory,
} from "@/entities/incident";
import classes from "./operator-card.module.scss";
import {
  emptyAddress,
  type OperatorCardEntry,
  type OperatorCardDraft,
} from "../model/operator-cards";

const addressLabels = {
  country: "Страна",
  subject: "Субъект",
  settlement: "Населённый пункт",
  object: "Объект",
  okrug: "Округ",
  district: "Район",
  street: "Улица",
  house: "Дом / владение",
  building: "Корпус",
  structure: "Строение / сооружение",
  apartment: "Квартира / офис",
  entrance: "Подъезд",
  floor: "Этаж",
  code: "Код домофона",
};

function ElapsedTime() {
  const [startedAt] = useState(Date.now);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return (
    <div className={classes.timer} aria-label="Время заполнения">
      <strong>
        {String(Math.floor(seconds / 60)).padStart(2, "0")}:
        {String(seconds % 60).padStart(2, "0")}
      </strong>
      <span>время заполнения</span>
    </div>
  );
}

export function OperatorCard({
  entry,
  isNew,
  onSave,
  onClose,
  remote,
}: {
  entry: OperatorCardEntry;
  isNew: boolean;
  onSave: (draft: OperatorCardDraft) => void | Promise<void>;
  remote?: {
    classification: ReactNode;
    services: ReactNode;
    readOnly: boolean;
    canSave: boolean;
  };
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = useForm<OperatorCardDraft>({
    initialValues: structuredClone(entry.draft),
    validate: {
      applicant: (value) =>
        remote || value.trim() ? null : "Укажите ФИО заявителя",
      address: {
        street: (value, values) =>
          remote || value.trim() || values.address.descriptive.trim()
            ? null
            : "Укажите улицу или описательный адрес",
        house: (value, values) =>
          remote || value.trim() || values.address.descriptive.trim()
            ? null
            : "Укажите дом или описательный адрес",
        descriptive: (value) =>
          remote && !value.trim() ? "Укажите адрес происшествия" : null,
      },
      description: (value) =>
        value.trim() ? null : "Опишите происшествие со слов заявителя",
      group: (_, values) =>
        remote ||
        resolveClassification(values.group, values.features, values.recordId)
          ? null
          : "Выберите тип и все определяющие признаки",
    },
  });
  const setFormValues = form.setValues;
  useEffect(() => {
    if (!editing) setFormValues(structuredClone(entry.draft));
  }, [entry.draft, editing, setFormValues]);
  const [addingService, setAddingService] = useState(false);
  const [manualService, setManualService] = useState<string | null>(null);
  const directory = useServiceDirectory(!remote);
  const values = form.values;
  const record = resolveClassification(
    values.group,
    values.features,
    values.recordId,
  );
  const matches = getClassificationMatches(values.group, values.features);
  const services = resolveServices(record, values.flags);
  const allServices = [
    ...services.map((service) => ({ ...service, manual: false })),
    ...values.manualServices
      .filter((name) => !services.some((service) => service.name === name))
      .map((name) => ({ name, reasons: ["Добавлена вручную"], manual: true })),
  ];
  const [search, setSearch] = useState("");
  const normalizedSearch = search
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .trim();
  const groups = classifierGroups.filter(
    (group) =>
      !normalizedSearch ||
      classifierRecords.some(
        (row) =>
          row.group === group &&
          [
            row.group,
            row.name,
            ...row.features,
            row.group.startsWith("Дорожно-транспорт") ? "ДТП" : "",
          ]
            .join(" ")
            .toLocaleLowerCase("ru")
            .replace(/ё/g, "е")
            .includes(normalizedSearch),
      ),
  );

  function changeGroup(group: string | null) {
    form.setFieldValue("group", group ?? "");
    form.setFieldValue("features", [null, null, null]);
    form.setFieldValue("flags", {});
    form.setFieldValue("recordId", null);
    setSearch("");
  }

  async function save() {
    if (saving || form.validate().hasErrors) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(structuredClone(values));
      setEditing(false);
      notifications.show({
        title: "Учебная карточка сохранена",
        message: remote
          ? "Изменения сохранены на сервере."
          : "Данные сохранены в памяти до перезагрузки страницы. Службы не оповещаются.",
        color: "povBlue",
      });
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить карточку.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={classes.card}>
      <Group justify="space-between" className={classes.cardToolbar}>
        <Text size="sm" fw={600}>
          Карточка {entry.incident.id} · {editing ? "Заполнение" : "Просмотр"}
        </Text>
        <Group gap="xs">
          {!editing && !remote?.readOnly && (
            <Button
              size="xs"
              variant="default"
              onClick={() => setEditing(true)}
            >
              Дополнить карточку
            </Button>
          )}
          <Button
            size="xs"
            variant="default"
            onClick={onClose}
            disabled={saving}
            leftSection={<X size={16} />}
          >
            К списку карточек
          </Button>
        </Group>
      </Group>
      {saveError && (
        <Alert color="red" m="sm">
          {saveError}
        </Alert>
      )}
      <fieldset
        disabled={!editing || saving || remote?.readOnly}
        className={classes.cardFields}
      >
        <header
          className={classes.topbar}
          data-remote={remote ? true : undefined}
        >
          <div className={classes.callState}>
            <Phone size={25} />
            <div>
              <strong>Учебный вызов</strong>
              <Text size="xs" c="dimmed" mt={5}>
                Голосовой диалог пока недоступен
              </Text>
            </div>
          </div>
          {!remote && (
            <>
              <TextInput
                label="АОН"
                placeholder="+7 (___) ___-__-__"
                {...form.getInputProps("aon")}
              />
              <TextInput
                label="Предоставленный телефон"
                placeholder="+7 (___) ___-__-__"
                {...form.getInputProps("providedPhone")}
              />
              <TextInput
                label="Телефон на место"
                placeholder="+7 (___) ___-__-__"
                {...form.getInputProps("locationPhone")}
              />
            </>
          )}
          <div className={classes.cardNumber}>
            <strong>Карточка 112</strong>
            <span>Происшествие {entry.incident.id}</span>
            <small>Оператор 112 · АРМ 4</small>
          </div>
          {editing ? (
            <ElapsedTime />
          ) : (
            <div className={classes.viewState}>Просмотр</div>
          )}
        </header>
        <div className={classes.columns}>
          <div className={classes.leftColumn}>
            {!remote && (
              <section
                className={classes.panel}
                aria-label="Заявитель и пострадавший"
              >
                <div className={classes.applicantRow}>
                  <TextInput
                    label="ФИО заявителя"
                    placeholder="Фамилия, имя, отчество"
                    {...form.getInputProps("applicant")}
                  />
                  <Select
                    label="Статус заявителя"
                    placeholder="Выберите статус"
                    data={[
                      "Пострадавший",
                      "Очевидец",
                      "Родственник",
                      "Участник",
                      "Ребёнок",
                    ]}
                    {...form.getInputProps("applicantStatus")}
                  />
                </div>
                <TextInput
                  mt="xs"
                  label="ФИО пострадавшего"
                  placeholder="Если отличается от заявителя"
                  {...form.getInputProps("victim")}
                />
              </section>
            )}
            {remote ? (
              <section
                className={classes.panel}
                aria-label="Адрес происшествия"
              >
                <Textarea
                  label="Адрес происшествия"
                  placeholder="Населённый пункт, улица, дом, ориентиры"
                  minRows={2}
                  autosize
                  {...form.getInputProps("address.descriptive")}
                />
              </section>
            ) : (
              <section
                className={classes.panel}
                aria-label="Адрес происшествия"
              >
                <div className={classes.sectionTitle}>Адрес происшествия</div>
                <div className={classes.addressSummary}>
                  {[
                    values.address.subject,
                    values.address.settlement,
                    values.address.street,
                    values.address.house && `д. ${values.address.house}`,
                  ]
                    .filter(Boolean)
                    .join(", ") || "Адрес не указан"}
                </div>
                <div className={classes.addressGrid}>
                  {Object.entries(addressLabels).map(([key, label]) => (
                    <TextInput
                      key={key}
                      label={label}
                      className={
                        key === "street" || key === "object"
                          ? classes.wideField
                          : undefined
                      }
                      {...form.getInputProps(`address.${key}`)}
                    />
                  ))}
                </div>
                <Textarea
                  label="Описательный адрес / ориентиры"
                  mt="sm"
                  minRows={2}
                  autosize
                  {...form.getInputProps("address.descriptive")}
                />
                <Group justify="flex-end" mt="xs">
                  <Button
                    size="compact-xs"
                    variant="default"
                    onClick={() =>
                      form.setFieldValue("address", { ...emptyAddress })
                    }
                  >
                    Очистить адрес
                  </Button>
                </Group>
              </section>
            )}
            <section className={`${classes.panel} ${classes.description}`}>
              <Textarea
                label="Описание со слов заявителя"
                placeholder="Что произошло?"
                minRows={5}
                autosize
                maxLength={1999}
                {...form.getInputProps("description")}
              />
              <Text size="xs" ta="right" mt={4} c="dimmed">
                {values.description.length} / 1999
              </Text>
            </section>
            {remote && (
              <section className={classes.panel} aria-label="Анкета">
                <div className={classes.sectionTitle}>Анкета</div>
                <Textarea
                  label="Вопросы"
                  minRows={3}
                  autosize
                  {...form.getInputProps("questions")}
                />
                <Textarea
                  label="Ответы"
                  mt="sm"
                  minRows={3}
                  autosize
                  {...form.getInputProps("answers")}
                />
              </section>
            )}
          </div>
          <div className={classes.rightColumn}>
            {remote ? (
              remote.classification
            ) : (
              <>
                <section
                  className={classes.panel}
                  aria-label="Основные признаки"
                >
                  <Group gap="xs">
                    {routingFlags.slice(0, 3).map(([key, label]) => (
                      <Button
                        color="povBlue"
                        key={key}
                        variant={values.flags[key] ? "filled" : "default"}
                        aria-pressed={!!values.flags[key]}
                        onClick={() =>
                          form.setFieldValue(`flags.${key}`, !values.flags[key])
                        }
                      >
                        {label}
                      </Button>
                    ))}
                  </Group>
                </section>
                <section className={classes.panel}>
                  <Select
                    label="Введите тип происшествия"
                    placeholder="ЧТО СЛУЧИЛОСЬ?"
                    searchable
                    clearable
                    data={groups}
                    value={values.group || null}
                    searchValue={search}
                    onSearchChange={setSearch}
                    filter={({ options }) => options}
                    onChange={changeGroup}
                    maxDropdownHeight={320}
                    nothingFoundMessage="Тип не найден. Попробуйте другое слово."
                    error={form.errors.group}
                  />
                  {!values.group && (
                    <Group gap="xs" mt="md">
                      {[
                        "пожар в жилом доме",
                        "Дорожно-транспортные происшествия с пострадавшими",
                        "Запах газа в помещении (в доме, в квартире)",
                        "Человек в опасности",
                      ].map((group) => (
                        <Button
                          key={group}
                          size="xs"
                          variant="default"
                          onClick={() => changeGroup(group)}
                        >
                          {group.startsWith("Дорожно") ? "ДТП" : group}
                        </Button>
                      ))}
                    </Group>
                  )}
                </section>
                {values.group && (
                  <section
                    className={classes.criteria}
                    aria-label="Критерии происшествия"
                  >
                    <h2>{values.group}</h2>
                    {[0, 1, 2].map((level) => {
                      const options = getFeatureOptions(
                        values.group,
                        values.features,
                        level,
                      );
                      if (!options.some((option) => option !== null))
                        return null;
                      return (
                        <div key={level} className={classes.criterionRow}>
                          <span>Определяющий признак {level + 1}</span>
                          <div className={classes.options}>
                            {options.map((option) => (
                              <Button
                                color="povBlue"
                                key={option ?? "none"}
                                variant={
                                  values.features[level] === option
                                    ? "filled"
                                    : "default"
                                }
                                aria-pressed={values.features[level] === option}
                                onClick={() =>
                                  form.setFieldValue(
                                    "features",
                                    values.features.map((value, i) =>
                                      i < level
                                        ? value
                                        : i === level
                                          ? option
                                          : null,
                                    ),
                                  )
                                }
                              >
                                {option ?? "Не требуется"}
                              </Button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {matches.length > 1 && (
                      <Select
                        m="sm"
                        label="Уточните итоговый тип"
                        placeholder="Выберите тип"
                        data={matches.map((item) => ({
                          value: String(item.id),
                          label: item.name,
                        }))}
                        value={values.recordId ? String(values.recordId) : null}
                        onChange={(id) =>
                          form.setFieldValue("recordId", id ? Number(id) : null)
                        }
                      />
                    )}
                    {!record && (
                      <Text p="sm" size="sm" c="dimmed">
                        Выберите признаки, чтобы определить итоговый тип и
                        службы.
                      </Text>
                    )}
                    {record?.additional && (
                      <Text size="sm" p="sm">
                        Дополнительные сведения: {record.additional}
                      </Text>
                    )}
                    <div className={classes.flags}>
                      <Text size="sm" fw={600} mb="sm">
                        Дополнительные признаки для оповещения служб
                      </Text>
                      <div className={classes.flagGrid}>
                        {routingFlags.slice(3).map(([key, label]) => (
                          <Checkbox
                            key={key}
                            label={label}
                            checked={!!values.flags[key]}
                            onChange={(event) =>
                              form.setFieldValue(
                                `flags.${key}`,
                                event.currentTarget.checked,
                              )
                            }
                          />
                        ))}
                      </div>
                    </div>
                  </section>
                )}
                {record && (
                  <section className={classes.panel} aria-live="polite">
                    <Text size="sm">
                      Класс.: <strong>{record.name}</strong>
                    </Text>
                    <Text size="xs" c="dimmed" mt={5}>
                      [ВИС] Класс.: {record.externalName || "—"} · № {record.id}
                    </Text>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </fieldset>
      <footer className={classes.footer}>
        <strong>Службы:</strong>
        {remote ? (
          remote.services
        ) : (
          <>
            <div className={classes.services} aria-live="polite">
              {allServices.map((service) => (
                <Tooltip
                  key={service.name}
                  label={service.reasons.join("; ")}
                  multiline
                  maw={320}
                >
                  <div className={classes.service}>
                    <strong>{service.name}</strong>
                    <small>
                      {service.manual
                        ? "Добавлена вручную"
                        : editing
                          ? "Будет оповещена"
                          : "Добавлена"}
                    </small>
                    {service.manual && editing && (
                      <button
                        type="button"
                        aria-label={`Убрать службу ${service.name}`}
                        onClick={() =>
                          form.setFieldValue(
                            "manualServices",
                            values.manualServices.filter(
                              (name) => name !== service.name,
                            ),
                          )
                        }
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </Tooltip>
              ))}
              {!allServices.length && (
                <Text size="sm">
                  {record
                    ? "Для выбранных признаков автоматическое оповещение не предусмотрено"
                    : "Появятся после выбора критериев"}
                </Text>
              )}
            </div>
            <Button
              variant="outline"
              color="white"
              px={10}
              aria-label="Добавить службу"
              disabled={!editing}
              onClick={() => setAddingService(true)}
            >
              <Plus size={20} />
            </Button>
          </>
        )}
        <Button
          variant="outline"
          color="white"
          leftSection={<Save size={18} />}
          onClick={() => void save()}
          loading={saving}
          disabled={!editing || remote?.readOnly || (remote && !remote.canSave)}
        >
          Сохранить
        </Button>
      </footer>
      <Modal
        opened={addingService}
        onClose={() => setAddingService(false)}
        title="Добавить службу"
        centered
      >
        <Stack>
          {directory.isError ? (
            <Alert color="red" title="Не удалось загрузить справочник служб">
              <Button variant="subtle" onClick={() => directory.refetch()}>
                Повторить
              </Button>
            </Alert>
          ) : (
            <Select
              label="Служба"
              searchable
              placeholder={
                directory.isPending ? "Загрузка…" : "Выберите службу"
              }
              disabled={directory.isPending}
              data={(directory.data ?? []).filter(
                (name) => !allServices.some((service) => service.name === name),
              )}
              value={manualService}
              onChange={setManualService}
              nothingFoundMessage="Службы не найдены"
            />
          )}
          <Button
            disabled={!manualService || directory.isError}
            onClick={() => {
              if (manualService)
                form.setFieldValue("manualServices", [
                  ...values.manualServices,
                  manualService,
                ]);
              setManualService(null);
              setAddingService(false);
            }}
          >
            Добавить
          </Button>
        </Stack>
      </Modal>
    </div>
  );
}
