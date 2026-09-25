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
import {
  Bell,
  ChevronUp,
  Globe2,
  Hand,
  Languages,
  Link2,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Timer,
  X,
} from "lucide-react";
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
import type { EmergencyService } from "@/entities/training";
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
  house: "Дом/Вл",
  building: "Корпус",
  structure: "Стр/соор",
  apartment: "Квартира/офис",
  entrance: "Подъезд",
  floor: "Этаж",
  code: "Код",
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
    <div className={classes.timer} aria-label="Таймер карточки">
      <strong>
        {String(Math.floor(seconds / 60)).padStart(2, "0")}:
        {String(seconds % 60).padStart(2, "0")}
      </strong>
      <span>
        <span>минут</span>
        <span>секунд</span>
      </span>
    </div>
  );
}

export function OperatorCard({
  entry,
  isNew,
  onSave,
  onClose,
  remote,
  incomingCall,
}: {
  entry: OperatorCardEntry;
  isNew: boolean;
  onSave: (draft: OperatorCardDraft) => void | Promise<void>;
  remote?: {
    classification: ReactNode;
    services: ReactNode;
    readOnly: boolean;
    canSave: boolean;
    lockFields?: boolean;
  };
  incomingCall?: {
    callerNumber?: string | null;
    status: string;
    error: string | null;
    audioBusy: boolean;
    onRetry: () => void;
    ended: boolean;
    onEnd: () => void;
    warning?: string;
    directory: EmergencyService[];
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
        (remote && !incomingCall) || value.trim()
          ? null
          : "Укажите ФИО заявителя",
      address: {
        street: (value, values) =>
          (remote && !incomingCall) ||
          value.trim() ||
          values.address.descriptive.trim()
            ? null
            : "Укажите улицу или описательный адрес",
        house: (value, values) =>
          (remote && !incomingCall) ||
          value.trim() ||
          values.address.descriptive.trim()
            ? null
            : "Укажите дом или описательный адрес",
        descriptive: (value) =>
          remote && !incomingCall && !value.trim()
            ? "Укажите адрес происшествия"
            : null,
      },
      description: (value) =>
        value.trim() ? null : "Опишите происшествие со слов заявителя",
      group: (_, values) =>
        (remote && !incomingCall) ||
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
  const [expandedServices, setExpandedServices] = useState(false);
  const [manualService, setManualService] = useState<string | null>(null);
  const [manualServiceIds, setManualServiceIds] = useState<string[]>([]);
  const [serviceSearch, setServiceSearch] = useState("");
  const directory = useServiceDirectory(!remote);
  const values = form.values;
  const record = resolveClassification(
    values.group,
    values.features,
    values.recordId,
  );
  const matches = getClassificationMatches(values.group, values.features);
  const services = resolveServices(record, values.flags);
  const unavailableServices = incomingCall
    ? services.filter(
        (routed) =>
          !incomingCall.directory.some(
            (service) => service.is_active && service.code === routed.code,
          ),
      )
    : [];
  const allServices = [
    ...services.map((service) => ({ ...service, manual: false })),
    ...values.manualServices
      .map((idOrName) => ({
        idOrName,
        name:
          incomingCall?.directory.find((service) => service.id === idOrName)
            ?.name ?? idOrName,
      }))
      .filter(({ name }) => !services.some((service) => service.name === name))
      .map(({ idOrName, name }) => ({
        idOrName,
        name,
        reasons: ["Добавлена вручную"],
        manual: true,
      })),
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
    <div
      className={`${classes.card} ${incomingCall || remote ? classes.incomingCard : ""}`}
    >
      {saveError && (
        <Alert color="red" m="sm">
          {saveError}
        </Alert>
      )}
      {incomingCall?.warning && (
        <Alert color="yellow" m="sm">
          {incomingCall.warning}
        </Alert>
      )}
      {unavailableServices.length > 0 && (
        <Alert color="red" m="sm">
          В справочнике API нет служб:{" "}
          {unavailableServices.map((item) => item.name).join(", ")}. Сохранение
          карточки пока невозможно.
        </Alert>
      )}
      <fieldset
        disabled={!editing || saving || remote?.readOnly || remote?.lockFields}
        className={classes.cardFields}
      >
        <header
          className={classes.topbar}
          data-remote={remote && !incomingCall ? true : undefined}
          data-incoming={incomingCall ? true : undefined}
        >
          <div className={classes.callState}>
            {incomingCall ? (
              <Button
                color={incomingCall.ended ? "gray" : "red"}
                className={classes.hangup}
                aria-label="Завершить разговор"
                disabled={
                  incomingCall.ended || saving || incomingCall.audioBusy
                }
                onClick={incomingCall.onEnd}
              >
                <Phone size={25} />
              </Button>
            ) : (
              <Phone size={25} />
            )}
            <div className={classes.callDetails}>
              <span>
                {incomingCall && !incomingCall.ended
                  ? incomingCall.status
                  : "Отключение"}
              </span>
              <div className={classes.callButtons}>
                <button type="button">записи звонков</button>
                <button type="button">список SMS</button>
              </div>
              {incomingCall?.error && (
                <>
                  <Text size="xs" c="red" lineClamp={2}>
                    {incomingCall.error}
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={incomingCall.onRetry}
                  >
                    Повторить подключение
                  </Button>
                </>
              )}
            </div>
          </div>
          {(
            [
              ["АОН", "aon"],
              ["предоставленный", "providedPhone"],
              ["телефон на место", "locationPhone"],
            ] as const
          ).map(([label, field]) => (
            <div className={classes.phoneField} key={field}>
              <div className={classes.phoneActions}>
                <Phone size={22} />
                <MessageSquare size={17} />
              </div>
              <div className={classes.phoneInput}>
                <div className={classes.phoneLabel}>
                  {label}
                  <Globe2 size={13} />
                </div>
                <TextInput
                  aria-label={label}
                  placeholder="+7 (   )   - -"
                  {...form.getInputProps(field)}
                  readOnly={
                    (field === "aon" && !!incomingCall) ||
                    (!!remote && !incomingCall)
                  }
                />
              </div>
            </div>
          ))}
          <div className={classes.cardNumber}>
            <strong>Происшествие {entry.incident.id}</strong>
            <span>
              Сохр. {new Date(entry.incident.createdAt).toLocaleString("ru-RU")}
            </span>
            <small>Опер., АРМ 4, УМЦ О п</small>
          </div>
          <ElapsedTime />
        </header>
        <div className={classes.columns}>
          <div className={classes.leftColumn}>
            <section
              className={classes.panel}
              aria-label="Заявитель и пострадавший"
            >
              <div className={classes.applicantRow}>
                <TextInput
                  aria-label="Фамилия и имя заявителя"
                  placeholder="Фамилия и имя заявителя"
                  {...form.getInputProps("applicant")}
                  readOnly={!!remote && !incomingCall}
                />
                <Select
                  aria-label="Статус заявителя"
                  placeholder="выберите статус"
                  data={[
                    "Пострадавший",
                    "Очевидец",
                    "Родственник",
                    "Участник",
                    "Ребёнок",
                  ]}
                  {...form.getInputProps("applicantStatus")}
                  disabled={!!remote && !incomingCall}
                />
                <TextInput
                  aria-label="ФИО пострадавшего"
                  placeholder=""
                  {...form.getInputProps("victim")}
                  readOnly={!!remote && !incomingCall}
                />
                <button
                  type="button"
                  className={classes.translateButton}
                  aria-label="Перевод"
                >
                  <Languages size={19} />
                </button>
              </div>
            </section>
            <section
              className={`${classes.panel} ${classes.addressPanel}`}
              aria-label="Адрес происшествия"
            >
              <div className={classes.sectionTitle}>
                Адрес: <MapPin size={14} />
              </div>
              <div className={classes.addressSummary}>
                {[
                  values.address.subject,
                  values.address.settlement,
                  values.address.street,
                  values.address.house && `д. ${values.address.house}`,
                ]
                  .filter(Boolean)
                  .join(", ") ||
                  values.address.descriptive ||
                  "Москва"}
                <button
                  type="button"
                  aria-label="Очистить строку адреса"
                  onClick={() =>
                    form.setFieldValue("address", { ...emptyAddress })
                  }
                >
                  <X size={18} />
                </button>
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
                label="Описательный адрес"
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
                  очистить адрес
                </Button>
              </Group>
            </section>
            <section className={`${classes.panel} ${classes.description}`}>
              <Textarea
                label="Описание со слов заявителя"
                placeholder="введите"
                minRows={5}
                autosize
                maxLength={1999}
                {...form.getInputProps("description")}
              />
              <Text size="xs" ta="right" mt={4} c="dimmed">
                {values.description.length} / 1999
              </Text>
            </section>
            {remote && !incomingCall && (
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
            <section className={classes.panel} aria-label="Основные признаки">
              <Group gap="xs">
                {routingFlags.slice(0, 3).map(([key, label]) => (
                  <Button
                    className={classes.statusButton}
                    color="povBlue"
                    key={key}
                    variant={values.flags[key] ? "filled" : "default"}
                    aria-pressed={!!values.flags[key]}
                    onClick={() => {
                      if (!remote || incomingCall)
                        form.setFieldValue(`flags.${key}`, !values.flags[key]);
                    }}
                  >
                    {key === "casualties"
                      ? "Пострадавшие"
                      : key === "absent"
                        ? "Нет на месте/ Отказ от скорой"
                        : key === "noAccess"
                          ? "Нет доступа/ Заблокированные"
                          : label}
                  </Button>
                ))}
                <span className={classes.statusDivider} />
                <button type="button" className={classes.warningButton}>
                  нет контакта
                </button>
                <button type="button" className={classes.warningButton}>
                  срыв звонка
                </button>
              </Group>
            </section>
            {remote && !incomingCall ? (
              <section
                className={`${classes.panel} ${classes.trainingClassification}`}
              >
                <div className={classes.remoteTypeTitle}>
                  добавить тип происшествия
                </div>
                {remote.classification}
              </section>
            ) : (
              <>
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
                    <Group gap="xs" mt="md" className={classes.quickTypes}>
                      {[
                        "Дорожно-транспортные происшествия с пострадавшими",
                        "Ошибочно набран номер",
                        "104",
                        "Человек в опасности",
                        "Отмена вызова",
                        "Тестовый вызов",
                        "Передача дежурства",
                        "Консультация",
                        "Вызов на иностранном языке",
                        "Справка-101",
                      ].map((group) => (
                        <Button
                          key={group}
                          size="xs"
                          variant="default"
                          onClick={() => {
                            if (classifierGroups.includes(group))
                              changeGroup(group);
                            else if (group === "Консультация")
                              changeGroup("Справочно-консультационная помощь");
                          }}
                        >
                          {group.startsWith("Дорожно") ? "ДТП" : group}
                        </Button>
                      ))}
                    </Group>
                  )}
                  {!values.group && (
                    <Text size="xs" mt="sm">
                      Значимые типы происшествий:
                    </Text>
                  )}
                </section>
                {incomingCall && values.group && (
                  <div className={classes.selectedIncidentType}>
                    <span>{values.group}</span>
                  </div>
                )}
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
                {record && !incomingCall && (
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
            {remote && incomingCall && values.group && (
              <section
                className={`${classes.panel} ${classes.trainingClassification}`}
                aria-label="Классификация учебной карточки"
              >
                {remote.classification}
              </section>
            )}
          </div>
        </div>
      </fieldset>
      <footer className={classes.footer}>
        <strong>Службы:</strong>
        {(!remote || incomingCall) && (
          <Button
            className={classes.addService}
            variant="outline"
            color="white"
            px={10}
            aria-label="Добавить службу"
            disabled={!editing || remote?.readOnly || remote?.lockFields}
            onClick={() => {
              setManualServiceIds(
                values.manualServices.filter(
                  (id) =>
                    !incomingCall ||
                    incomingCall.directory.some(
                      (service) =>
                        service.id === id &&
                        service.is_active &&
                        !services.some(
                          (routed) => routed.code === service.code,
                        ),
                    ),
                ),
              );
              setServiceSearch("");
              setAddingService(true);
            }}
          >
            <Plus size={23} />
          </Button>
        )}
        {remote && !incomingCall ? (
          <div
            className={`${classes.services} ${expandedServices ? classes.expandedServices : ""}`}
          >
            {remote.services}
          </div>
        ) : (
          <>
            <div
              className={`${classes.services} ${expandedServices ? classes.expandedServices : ""}`}
              aria-live="polite"
            >
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
                    {service.manual && editing && !remote?.lockFields && (
                      <button
                        type="button"
                        aria-label={`Убрать службу ${service.name}`}
                        onClick={() =>
                          form.setFieldValue(
                            "manualServices",
                            values.manualServices.filter(
                              (name) =>
                                name !==
                                ("idOrName" in service
                                  ? service.idOrName
                                  : service.name),
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
            </div>
          </>
        )}
        <div className={classes.footerActions}>
          {!editing && !remote?.readOnly && (
            <button
              type="button"
              className={classes.footerIcon}
              aria-label="Дополнить карточку"
              title="Дополнить карточку"
              onClick={() => setEditing(true)}
            >
              <Pencil size={21} />
            </button>
          )}
          {(allServices.length > 3 || (remote && !incomingCall)) && (
            <button
              type="button"
              className={classes.footerIcon}
              aria-label="Показать службы"
              aria-expanded={expandedServices}
              onClick={() => setExpandedServices(!expandedServices)}
            >
              <ChevronUp size={22} />
            </button>
          )}
          <Button
            className={classes.saveButton}
            variant="outline"
            color="white"
            onClick={() => void save()}
            loading={saving}
            disabled={
              !editing ||
              remote?.readOnly ||
              (remote && !remote.canSave) ||
              (!!incomingCall && !incomingCall.ended)
            }
          >
            сохранить
          </Button>
          <button
            type="button"
            className={classes.footerIcon}
            aria-label="Связать карточку"
          >
            <Link2 size={22} />
          </button>
          <button
            type="button"
            className={classes.footerIcon}
            aria-label="Таймер"
          >
            <Timer size={22} />
          </button>
          <button
            type="button"
            className={classes.footerIcon}
            aria-label="Сигнал"
          >
            <Hand size={22} />
          </button>
          <button
            type="button"
            className={classes.footerIcon}
            aria-label="Уведомления"
          >
            <Bell size={22} />
          </button>
          <button
            type="button"
            className={classes.footerIcon}
            aria-label="Сообщения"
          >
            <MessageSquare size={22} />
          </button>
          <Button
            variant="outline"
            color="white"
            px={10}
            aria-label="Закрыть карточку"
            title="Вернуться к списку карточек"
            disabled={saving}
            onClick={onClose}
          >
            <X size={24} />
          </Button>
        </div>
      </footer>
      <Modal
        opened={addingService}
        onClose={() => setAddingService(false)}
        title="Добавьте службы"
        centered
        size="md"
        classNames={{
          content: classes.serviceModal,
          title: classes.serviceModalTitle,
          body: classes.serviceModalBody,
        }}
      >
        <Stack>
          {incomingCall ? (
            <>
              <TextInput
                aria-label="Поиск служб"
                placeholder="Поиск ..."
                value={serviceSearch}
                onChange={(event) =>
                  setServiceSearch(event.currentTarget.value)
                }
              />
              <div className={classes.serviceOptions}>
                {incomingCall.directory
                  .filter(
                    (service) =>
                      service.is_active &&
                      !services.some(
                        (routed) => routed.code === service.code,
                      ) &&
                      service.name
                        .toLocaleLowerCase("ru")
                        .includes(serviceSearch.toLocaleLowerCase("ru")),
                  )
                  .map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      aria-pressed={manualServiceIds.includes(service.id)}
                      className={
                        manualServiceIds.includes(service.id)
                          ? classes.selectedServiceOption
                          : ""
                      }
                      onClick={() =>
                        setManualServiceIds((current) =>
                          current.includes(service.id)
                            ? current.filter((id) => id !== service.id)
                            : [...current, service.id],
                        )
                      }
                    >
                      {service.name}
                    </button>
                  ))}
              </div>
            </>
          ) : directory.isError ? (
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
            className={classes.serviceModalSave}
            disabled={!incomingCall && (!manualService || directory.isError)}
            onClick={() => {
              if (incomingCall) {
                form.setFieldValue("manualServices", manualServiceIds);
              } else if (manualService) {
                form.setFieldValue("manualServices", [
                  ...values.manualServices,
                  manualService,
                ]);
              }
              setManualService(null);
              setAddingService(false);
            }}
          >
            {incomingCall ? "Сохранить и закрыть" : "Добавить"}
          </Button>
        </Stack>
      </Modal>
    </div>
  );
}
