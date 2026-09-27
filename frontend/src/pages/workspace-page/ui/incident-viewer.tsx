import type { ReactNode } from "react";
import { Box, Group, Text, Title } from "@mantine/core";
import { Pencil, PhoneOff, X, Zap } from "lucide-react";
import { MdCall, MdCallEnd, MdMessage, MdWarning } from "react-icons/md";
import { ActionIcon, Button } from "@/shared/ui";
import type { Incident, IncidentService } from "@/entities/incident";
import classes from "./incident-viewer.module.scss";
import { ServiceResponse } from "./service-response";

interface IncidentViewerProps {
  incident: Incident | null;
  onClose: () => void;
  onServiceChange: (service: IncidentService) => void;
  serverServices?: ReactNode;
  extraContent?: ReactNode;
  ddsMode?: boolean;
}

function PhoneField({ label, value }: { label: string; value?: string }) {
  return (
    <div className={classes.phoneField}>
      <div className={classes.phoneActions}>
        <ActionIcon
          className={classes.phoneIcon}
          aria-label={`Позвонить: ${label}`}
        >
          <MdCall size={22} />
        </ActionIcon>
        <ActionIcon
          className={classes.phoneIcon}
          aria-label={`Сообщения: ${label}`}
        >
          <MdMessage size={18} />
        </ActionIcon>
      </div>
      <Box className={classes.phoneValue}>
        <Text className={classes.phoneLabel}>{label}</Text>
        <Text size="sm">{value}</Text>
      </Box>
    </div>
  );
}

export function IncidentViewer({
  incident,
  onClose,
  onServiceChange,
  serverServices,
  extraContent,
  ddsMode = false,
}: IncidentViewerProps) {
  if (!incident) return null;
  return (
    <IncidentViewerContent
      key={incident.id}
      incident={incident}
      onClose={onClose}
      onServiceChange={onServiceChange}
      serverServices={serverServices}
      extraContent={extraContent}
      ddsMode={ddsMode}
    />
  );
}

function IncidentViewerContent({
  incident,
  onClose,
  onServiceChange,
  serverServices,
  extraContent,
  ddsMode,
}: {
  incident: Incident;
  onClose: () => void;
  onServiceChange: (service: IncidentService) => void;
  serverServices?: ReactNode;
  extraContent?: ReactNode;
  ddsMode: boolean;
}) {
  const details = incident.details;
  const createdAt = new Date(incident.createdAt);
  const descriptionCreatedAt = new Date(incident.descriptionCreatedAt);
  const yesNo = (value?: boolean | null) =>
    value == null ? "—" : value ? "да" : "нет";

  return (
    <div
      className={classes.viewer}
      data-dds={ddsMode || undefined}
      role="region"
      aria-label={`Происшествие ${incident.id}`}
    >
      <div className={classes.canvas}>
        <Box component="header" className={classes.topbar}>
          <div className={classes.callPanel}>
            <ActionIcon className={classes.hangup} aria-label="Завершить вызов">
              <MdCallEnd size={24} />
            </ActionIcon>
            <div className={classes.callState}>
              <Text className={classes.callLabel}>Отключение</Text>
              <Group gap={9} wrap="nowrap">
                <Button className={classes.recordings} disabled>
                  записи звонков
                </Button>
                <Button className={classes.sms}>список SMS</Button>
              </Group>
            </div>
          </div>
          <PhoneField label="АОН" value={details?.automaticNumber} />
          <PhoneField label="предоставленный" value={details?.providedNumber} />
          <PhoneField label="телефон на место" value={details?.locationPhone} />
          <div className={classes.summary} data-tour="card-header">
            <Title
              order={1}
              id="incident-title"
              className={classes.title}
              title={ddsMode ? `Происшествие ${incident.id}` : undefined}
            >
              Происшествие {ddsMode ? incident.id.slice(0, 8) : incident.id}
            </Title>
            <div>
              Сохр. {createdAt.toLocaleDateString("ru-RU")} в{" "}
              {createdAt.toLocaleTimeString("ru-RU", { hour12: false })}
            </div>
            <div>
              Опер. {incident.operator ?? "—"}, АРМ{" "}
              {incident.workstation ?? "—"}
              {incident.author ? `, ${incident.author}` : ""}
            </div>
          </div>
          <div className={classes.modeActions}>
            <Button className={classes.viewMode}>просмотр</Button>
            <Button className={classes.appendMode}>дополнение</Button>
          </div>
        </Box>

        <div className={classes.columns}>
          <section
            className={classes.leftColumn}
            aria-label="Заявитель и описание происшествия"
            data-tour="card-description"
          >
            <Box className={classes.applicant}>
              <span>ФИО заявителя</span>
              {details?.applicantName && (
                <Text size="sm">{details.applicantName}</Text>
              )}
            </Box>
            <Box className={classes.address}>
              <Group justify="space-between" wrap="nowrap" gap={8}>
                <strong>{details?.addressTitle || incident.address}</strong>
                <ActionIcon
                  className={classes.locationIcon}
                  aria-label="Местоположение происшествия"
                >
                  <PhoneOff size={15} fill="currentColor" />
                </ActionIcon>
              </Group>
              <div>{details?.district}</div>
            </Box>
            <Box className={classes.description}>
              <strong>
                {descriptionCreatedAt.toLocaleDateString("ru-RU")}{" "}
                {descriptionCreatedAt.toLocaleTimeString("ru-RU", {
                  hour12: false,
                })}
                {(incident.operator !== null || incident.author) && (
                  <>
                    {"　"}
                    {incident.operator ?? ""} {incident.author}
                  </>
                )}
              </strong>
              <div>{incident.description}</div>
            </Box>
          </section>

          <section
            className={classes.rightColumn}
            aria-label="Сведения о происшествии"
          >
            <div className={classes.factsRow}>
              <Group gap={10} className={classes.facts}>
                <span>Пострадавшие: {yesNo(incident.hasCasualties)}</span>
                <span>Отказ от скорой: {yesNo(details?.ambulanceRefused)}</span>
                <span>Заблокированные: {yesNo(details?.trapped)}</span>
              </Group>
              <Group gap={13} className={classes.incidentActions}>
                <Button
                  className={classes.emergency}
                  rightSection={<Zap size={16} fill="currentColor" />}
                >
                  ЧС
                </Button>
                <Button
                  className={classes.urgent}
                  data-active={details?.urgent || undefined}
                  rightSection={<MdWarning size={20} />}
                >
                  ЧП
                </Button>
                <ActionIcon
                  className={classes.edit}
                  aria-label="Редактировать происшествие"
                >
                  <Pencil size={19} fill="currentColor" />
                </ActionIcon>
              </Group>
            </div>
            <Box className={classes.category} data-tour="card-classification">
              <Button className={classes.categoryTitle} fullWidth>
                Происшествие{incident.type ? ` ${incident.type}` : ""}
              </Button>
              <div className={classes.categoryText}>{details?.category}</div>
            </Box>
            <Box className={classes.classification}>
              Класс.: <strong>{details?.classification}</strong>
            </Box>
            <Box className={classes.classification}>
              [ВИС] Класс.: {details?.externalClassification}
            </Box>
          </section>
        </div>
      </div>

      {extraContent}
      <Box component="footer" className={classes.footer}>
        <div className={classes.services} data-tour="card-services">
          <strong className={classes.servicesLabel}>Службы:</strong>
          {serverServices ??
            details?.services.map((service) => (
              <ServiceResponse
                key={service.name}
                service={service}
                onChange={onServiceChange}
              />
            ))}
        </div>
        <Group gap={5} wrap="nowrap" className={classes.footerActions}>
          <ActionIcon
            className={classes.footerIcon}
            aria-label="Сообщения по происшествию"
          >
            <MdMessage size={24} />
          </ActionIcon>
          <ActionIcon
            data-tour="card-close"
            className={classes.footerIcon}
            aria-label="Закрыть просмотр карточки"
            title="Закрыть просмотр карточки"
            onClick={onClose}
          >
            <X size={25} />
          </ActionIcon>
        </Group>
      </Box>
    </div>
  );
}
