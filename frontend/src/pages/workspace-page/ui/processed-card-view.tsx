import { useState } from "react";
import { Button, Tooltip } from "@mantine/core";
import {
  Bell,
  ChevronUp,
  ChevronsUpDown,
  CircleHelp,
  Globe2,
  Hand,
  Link2,
  MapPin,
  MessageSquare,
  MessageSquareWarning,
  Plus,
  Phone,
  PhoneCall,
  Printer,
  Timer,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import { classifierRecords, type Incident } from "@/entities/incident";
import { useSessionStore } from "@/entities/session";
import {
  statusLabels,
  type ApiCard,
  type EmergencyService,
  type LaunchContext,
} from "@/entities/training";
import { CardAudio } from "./card-audio";
import classes from "./processed-card-view.module.scss";

const savedAtFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function display(value: string | null | undefined) {
  return value?.trim() || "—";
}

export function ProcessedCardView({
  card,
  ctx,
  directory,
  summary,
  onEdit,
  onClose,
}: {
  card: ApiCard;
  ctx: LaunchContext;
  directory: EmergencyService[];
  summary?: Incident;
  onEdit?: () => void;
  onClose: () => void;
}) {
  const [showAudio, setShowAudio] = useState(false);
  const [expandedServices, setExpandedServices] = useState(false);
  const profile = useSessionStore((state) => state.profile);
  const record = classifierRecords.find(
    (item) => item.id === card.classification?.record_id,
  );
  const flags = card.classification?.routing_flags ?? {};
  const services = card.services.filter(
    (service) => service.is_active && service.is_visible,
  );
  const serviceNames = new Map(
    directory.map((service) => [service.id, service.name]),
  );
  const savedAt = new Date(card.registered_at);
  const operatorName =
    card.operator_id && card.operator_id === profile?.userId
      ? profile.displayName
      : null;
  const shortNumber = card.card_number.slice(0, 8);
  const classificationLabel = [
    ...new Set(
      [record?.group, card.classification?.final_incident_type].filter(
        (value): value is string => !!value,
      ),
    ),
  ].join("; ");

  return (
    <article
      className={classes.card}
      aria-label={`Карточка происшествия ${shortNumber}`}
    >
      <header className={classes.topbar}>
        <div className={classes.connection}>
          <span className={classes.connectionIcon} aria-hidden="true">
            <Phone size={25} fill="currentColor" strokeWidth={1.5} />
          </span>
          <div className={classes.connectionBody}>
            <span>Не подключен</span>
            <div className={classes.connectionActions}>
              <button
                type="button"
                onClick={() => setShowAudio((value) => !value)}
                aria-expanded={showAudio}
              >
                Записи звонков
              </button>
              <button
                type="button"
                disabled
                title="SMS в учебном режиме недоступны"
              >
                Список SMS
              </button>
            </div>
          </div>
        </div>
        {[
          ["АОН", card.automatic_phone_number],
          ["Предоставленный", card.provided_phone_number],
          ["Телефон на место", card.location_phone_number],
        ].map(([label, value], index) => (
          <div className={classes.phone} key={label}>
            <div className={classes.phoneRail} aria-hidden="true">
              <Phone size={19} fill="currentColor" strokeWidth={1.5} />
              <span className={classes.messageIcon}>
                <MessageSquare size={22} fill="#30383e" stroke="#30383e" />
                <span>•••</span>
              </span>
            </div>
            <div className={classes.phoneContent}>
              <div className={classes.phoneHeading}>
                <span>{label}</span>
                <span className={classes.phoneHeadingIcons} aria-hidden="true">
                  {index === 0 && (
                    <>
                      <CircleHelp size={15} />
                      <MapPin size={15} />
                    </>
                  )}
                  <Globe2 size={16} />
                </span>
              </div>
              <strong title={value ?? undefined}>{display(value)}</strong>
              {index > 0 && <span className={classes.aonTag}>АОН</span>}
            </div>
          </div>
        ))}
        <div className={classes.number}>
          <strong title={card.card_number}>Происшествие {shortNumber}</strong>
          <span className={classes.signalMark} aria-hidden="true" />
          <span>
            Сохр.{" "}
            {Number.isNaN(savedAt.getTime())
              ? "—"
              : savedAtFormatter.format(savedAt)}
          </span>
          <small>
            Опер. {summary?.operator ?? operatorName ?? "—"}, АРМ{" "}
            {summary?.workstation ?? "—"}
          </small>
        </div>
        <div className={classes.viewActions}>
          <span className={classes.activeView}>Просмотр</span>
          <Button variant="default" onClick={onEdit} disabled={!onEdit}>
            Дополнение
          </Button>
        </div>
      </header>

      {showAudio && (
        <section className={classes.audio} aria-label="Записи звонков">
          <CardAudio ctx={ctx} cardId={card.id} defaultOpened />
        </section>
      )}

      <div className={classes.columns}>
        <div className={classes.leftColumn}>
          <section className={classes.applicant} aria-label="Заявитель">
            <strong>{display(card.applicant_full_name)}</strong>
          </section>
          <section className={classes.subscriber} aria-label="Данные абонента">
            <span>Данные абонента</span>
            <p>
              {Number.isNaN(savedAt.getTime())
                ? "—"
                : savedAtFormatter.format(savedAt)}
            </p>
            <p>Заявитель: {display(card.applicant_full_name)}</p>
            {card.reported_address && (
              <p>Адрес со слов заявителя: {card.reported_address}</p>
            )}
          </section>
          <section className={classes.address} aria-label="Адрес происшествия">
            <strong>
              {display(card.incident_address ?? card.reported_address)}
            </strong>
            <MapPin size={18} aria-hidden="true" />
          </section>
          <section
            className={classes.notes}
            aria-label="Дополнительные сведения"
          >
            <p>{display(card.description)}</p>
            {card.questionnaire?.questions && (
              <p>Вопросы: {card.questionnaire.questions}</p>
            )}
            {card.questionnaire?.answers && (
              <p>Ответы: {card.questionnaire.answers}</p>
            )}
          </section>
        </div>
        <div className={classes.rightColumn}>
          <div className={classes.summaryRow}>
            <div className={classes.summary}>
              <span>
                Пострадавшие:{" "}
                {card.victims_count === null
                  ? flags.casualties
                    ? "да"
                    : "нет"
                  : card.victims_count || "нет"}
              </span>
              <span>Отказ от скорой: —</span>
              <span>Заблокированные: {flags.noAccess ? "да" : "нет"}</span>
            </div>
            <div className={classes.summaryActions} aria-hidden="true">
              <span className={classes.flagBadge}>
                ЧС <Zap size={16} fill="currentColor" />
              </span>
              <span className={classes.flagBadge}>
                ЧП
                <span className={classes.warningIcon}>
                  <TriangleAlert size={18} fill="#30383e" stroke="#30383e" />
                  <b>!</b>
                </span>
              </span>
              <span>
                <Printer size={16} />
              </span>
            </div>
          </div>
          <div className={classes.classification}>
            Класс: <strong>{display(classificationLabel)}</strong>
          </div>
          <div className={classes.classification}>
            [ВИС] Класс: {display(record?.externalName)}
          </div>
        </div>
      </div>

      <footer className={classes.footer}>
        <div className={classes.serviceArea}>
          <span className={classes.servicesLabel}>Службы:</span>
          <div className={classes.services} aria-live="polite">
            {services.length ? (
              (expandedServices ? services : services.slice(0, 8)).map(
                (service) => {
                  const name = serviceNames.get(service.service_id) ?? "Служба";
                  const addedAt = new Date(service.added_at);
                  const time = Number.isNaN(addedAt.getTime())
                    ? ""
                    : addedAt.toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                  const status =
                    statusLabels[service.current_status] ??
                    service.current_status;
                  return (
                    <Tooltip key={service.id} label={name} multiline maw={320}>
                      <div className={classes.service}>
                        <span
                          className={classes.serviceIcons}
                          aria-hidden="true"
                        >
                          <PhoneCall size={16} />
                          <ChevronUp size={16} />
                        </span>
                        <strong>{name}</strong>
                        <small title={`${time} ${status}`.trim()}>
                          {time && `${time} · `}
                          {status}
                        </small>
                      </div>
                    </Tooltip>
                  );
                },
              )
            ) : (
              <span className={classes.noServices}>Не добавлены</span>
            )}
          </div>
          {services.length > 8 && (
            <button
              type="button"
              className={classes.serviceToggle}
              aria-label={
                expandedServices ? "Свернуть службы" : "Показать все службы"
              }
              aria-expanded={expandedServices}
              onClick={() => setExpandedServices((value) => !value)}
            >
              <ChevronsUpDown size={22} />
            </button>
          )}
        </div>
        <div className={classes.footerActions}>
          <span className={classes.status}>
            {card.current_status === "PROCESSED"
              ? "отработана"
              : (statusLabels[card.current_status] ?? card.current_status)}
          </span>
          <span className={classes.footerIcon} data-map aria-hidden="true">
            <MapPin size={22} />
          </span>
          <span
            className={`${classes.footerIcon} ${classes.linkIcon}`}
            aria-hidden="true"
          >
            <Link2 size={22} />
            <Plus size={12} />
          </span>
          <span className={classes.footerIcon} aria-hidden="true">
            <Timer size={22} />
          </span>
          <span className={classes.footerIcon} aria-hidden="true">
            <Hand size={22} />
          </span>
          <span className={classes.footerIcon} aria-hidden="true">
            <Bell size={22} />
          </span>
          <span className={classes.footerIcon} aria-hidden="true">
            <MessageSquareWarning size={22} />
          </span>
          <button type="button" onClick={onClose} aria-label="Закрыть карточку">
            <X size={24} />
          </button>
        </div>
      </footer>
    </article>
  );
}
