import { useState } from "react";
import { Button } from "@mantine/core";
import { Check, FileText, Phone, X } from "lucide-react";
import { classifierRecords } from "@/entities/incident";
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
  onEdit,
  onClose,
}: {
  card: ApiCard;
  ctx: LaunchContext;
  directory: EmergencyService[];
  onEdit?: () => void;
  onClose: () => void;
}) {
  const [showAudio, setShowAudio] = useState(false);
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

  return (
    <article
      className={classes.card}
      aria-label={`Карточка происшествия ${card.card_number}`}
    >
      <header className={classes.topbar}>
        <div className={classes.connection}>
          <Phone size={25} aria-hidden="true" />
          <div>
            <span>Не подключен</span>
            <button
              type="button"
              onClick={() => setShowAudio((value) => !value)}
            >
              Записи звонков
            </button>
          </div>
        </div>
        {[
          ["АОН", card.automatic_phone_number],
          ["Предоставленный", card.provided_phone_number],
          ["Телефон на место", card.location_phone_number],
        ].map(([label, value]) => (
          <div className={classes.phone} key={label}>
            <span>{label}</span>
            <strong>{display(value)}</strong>
          </div>
        ))}
        <div className={classes.number}>
          <strong>Происшествие {card.card_number}</strong>
          <span>
            Сохр.{" "}
            {Number.isNaN(savedAt.getTime())
              ? "—"
              : savedAtFormatter.format(savedAt)}
          </span>
          <small>{operatorName ? `Опер. ${operatorName}, ` : ""}АРМ 000</small>
        </div>
        <div className={classes.viewActions}>
          <span className={classes.activeView}>Просмотр</span>
          {onEdit && (
            <Button variant="default" onClick={onEdit}>
              Дополнение
            </Button>
          )}
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
          <section className={classes.address} aria-label="Адрес происшествия">
            <strong>
              {display(card.incident_address ?? card.reported_address)}
            </strong>
          </section>
          <section
            className={classes.notes}
            aria-label="Дополнительные сведения"
          >
            {card.questionnaire?.answers && <p>{card.questionnaire.answers}</p>}
          </section>
        </div>
        <div className={classes.rightColumn}>
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
          <section className={classes.incident}>
            <h2>Происшествие {card.card_number}</h2>
            <p>{display(card.description)}</p>
          </section>
          <div className={classes.classification}>
            Класс:{" "}
            <strong>
              {display(
                record?.group ?? card.classification?.final_incident_type,
              )}
            </strong>
          </div>
          <div className={classes.classification}>
            [ВИС] Класс: {display(record?.externalName)}
          </div>
        </div>
      </div>

      <footer className={classes.footer}>
        <div className={classes.services}>
          <span className={classes.servicesLabel}>Службы:</span>
          {services.length ? (
            services.map((service) => (
              <div className={classes.service} key={service.id}>
                <strong>
                  {serviceNames.get(service.service_id) ?? "Служба"}
                </strong>
                <small>
                  {statusLabels[service.current_status] ??
                    service.current_status}
                </small>
              </div>
            ))
          ) : (
            <span className={classes.noServices}>Не добавлены</span>
          )}
        </div>
        <div className={classes.footerActions}>
          <span className={classes.status}>
            <Check size={18} aria-hidden="true" />
            {card.current_status === "PROCESSED"
              ? "отработана"
              : (statusLabels[card.current_status] ?? card.current_status)}
          </span>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label="Дополнить карточку"
            >
              <FileText size={22} />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Закрыть карточку">
            <X size={24} />
          </button>
        </div>
      </footer>
    </article>
  );
}
