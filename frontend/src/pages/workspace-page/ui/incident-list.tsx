import type { ReactNode } from "react";
import {
  Group,
  Table,
  Title,
  UnstyledButton,
  VisuallyHidden,
} from "@mantine/core";
import {
  ArrowDown,
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  ClipboardList,
  PhoneOff,
  Timer,
  Zap,
} from "lucide-react";
import { ActionIcon, Button } from "@/shared/ui";
import type { Incident } from "@/entities/incident";
import classes from "./workspace-page.module.scss";

const shortDate = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

interface IncidentListProps {
  incidents: Incident[];
  operatorMode?: boolean;
  onOpenIncident: (incident: Incident) => void;
  pagination?: ReactNode;
}

function IncidentRow({
  incident,
  onOpenIncident,
  shortNumber,
}: {
  incident: Incident;
  onOpenIncident: IncidentListProps["onOpenIncident"];
  shortNumber: boolean;
}) {
  const createdAt = new Date(incident.createdAt);
  const time = createdAt.toLocaleTimeString("ru-RU", { hour12: false });
  const descriptionCreatedAt = new Date(incident.descriptionCreatedAt);

  return (
    <>
      <Table.Tr className={classes.incidentRow}>
        <Table.Td>
          <ActionIcon
            className={classes.rowIcon}
            aria-label="Свернуть описание"
          >
            <ChevronDown size={16} />
          </ActionIcon>
        </Table.Td>
        <Table.Td />
        <Table.Td>
          <ActionIcon
            className={classes.rowIcon}
            aria-label="Отметить происшествие"
          >
            <Bookmark size={16} fill="currentColor" />
          </ActionIcon>
        </Table.Td>
        <Table.Td>
          {incident.emergency && (
            <Zap
              size={17}
              fill="currentColor"
              aria-label="Чрезвычайная ситуация"
            />
          )}
        </Table.Td>
        <Table.Td>
          <ActionIcon
            className={classes.rowIcon}
            aria-label="Таймер происшествия"
          >
            <Timer size={18} />
          </ActionIcon>
        </Table.Td>
        <Table.Td className={classes.operator}>
          {incident.operator ?? "—"}
        </Table.Td>
        <Table.Td>{incident.workstation ?? "—"}</Table.Td>
        <Table.Td
          className={shortNumber ? classes.cardNumber : undefined}
          title={shortNumber ? incident.id : undefined}
        >
          {shortNumber ? incident.id.slice(0, 8) : incident.id}
        </Table.Td>
        <Table.Td>{shortDate.format(createdAt)}</Table.Td>
        <Table.Td className={classes.incidentTime}>
          {time.slice(0, 5)}
          <sup>:{time.slice(6)}</sup>
        </Table.Td>
        <Table.Td className={`${classes.darkCell} ${classes.typeCell}`}>
          {incident.type}
        </Table.Td>
        <Table.Td>
          {incident.hasCasualties === null
            ? "—"
            : incident.hasCasualties
              ? "Да"
              : "Нет"}
        </Table.Td>
        <Table.Td className={classes.darkCell}>
          <Group justify="space-between" wrap="nowrap" gap={6}>
            <span className={classes.addressText}>{incident.address}</span>
            <ActionIcon className={classes.phoneIcon} aria-label="Телефония">
              <PhoneOff size={16} fill="currentColor" />
            </ActionIcon>
          </Group>
        </Table.Td>
        <Table.Td className={classes.serviceStatus}>
          {incident.serviceStatus}
        </Table.Td>
        <Table.Td>
          <ActionIcon
            data-tour="open-card"
            className={classes.rowIcon}
            aria-label={`Карточка происшествия ${incident.id}`}
            onClick={() => onOpenIncident(incident)}
          >
            <ClipboardList size={18} />
          </ActionIcon>
        </Table.Td>
      </Table.Tr>
      <Table.Tr className={classes.descriptionRow}>
        <Table.Td colSpan={15}>
          <UnstyledButton
            className={classes.descriptionButton}
            onClick={() => onOpenIncident(incident)}
            aria-label={`Открыть происшествие ${incident.id}: ${incident.description}`}
          >
            <span className={classes.descriptionLabel}>Описание:</span>
            <span className={classes.descriptionMeta}>
              {descriptionCreatedAt.toLocaleDateString("ru-RU")}{" "}
              {descriptionCreatedAt.toLocaleTimeString("ru-RU", {
                hour12: false,
              })}
              {incident.author ? ` ${incident.author} -` : ""}
            </span>{" "}
            <span className={classes.descriptionText}>
              {incident.description}
            </span>
          </UnstyledButton>
        </Table.Td>
      </Table.Tr>
    </>
  );
}

export function IncidentList({
  incidents,
  onOpenIncident,
  operatorMode = false,
  pagination,
}: IncidentListProps) {
  const count = incidents.length;

  return (
    <section aria-labelledby="incidents-title" data-tour="incident-list">
      <Group justify="space-between" className={classes.listToolbar}>
        <Group gap={6}>
          <Title order={1} id="incidents-title" className={classes.listTitle}>
            Список происшествий
          </Title>
          <ActionIcon
            className={classes.toolbarIcon}
            aria-label="Свернуть список происшествий"
          >
            <ChevronUp size={18} />
          </ActionIcon>
        </Group>
        <Group gap={22}>
          <Button
            variant="subtle"
            className={classes.notifications}
            leftSection={<CircleAlert size={16} strokeWidth={1} />}
          >
            уведомления
          </Button>
          <Button
            variant="outline"
            className={classes.displayOptions}
            rightSection={<ChevronUp size={10} />}
          >
            выберите что показать
          </Button>
        </Group>
      </Group>

      <Table.ScrollContainer minWidth={1550}>
        <Table
          className={classes.table}
          withRowBorders={false}
          aria-label="Список происшествий"
        >
          <colgroup>
            {[39, 35, 39, 38, 39, 66, 51, 88, 90, 84].map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
            <col style={{ width: "21%" }} />
            <col style={{ width: 50 }} />
            <col />
            <col style={{ width: 205 }} />
            <col style={{ width: 54 }} />
          </colgroup>
          <Table.Thead>
            <Table.Tr>
              <Table.Th colSpan={3} scope="colgroup">
                Связи
              </Table.Th>
              <Table.Th colSpan={2} scope="colgroup">
                ЧС
              </Table.Th>
              <Table.Th scope="col">Опер.</Table.Th>
              <Table.Th scope="col">АРМ</Table.Th>
              <Table.Th scope="col">Номер</Table.Th>
              <Table.Th scope="col">
                <Button
                  variant="subtle"
                  className={classes.sortButton}
                  rightSection={<ArrowDown size={19} />}
                >
                  Дата
                </Button>
              </Table.Th>
              <Table.Th scope="col">Время</Table.Th>
              <Table.Th scope="col" className={classes.leftAligned}>
                Тип происшествия
              </Table.Th>
              <Table.Th scope="col">Постр.</Table.Th>
              <Table.Th scope="col" className={classes.leftAligned}>
                Адрес
              </Table.Th>
              <Table.Th scope="col" className={classes.leftAligned}>
                {operatorMode ? "Статус карточки" : "Статус службы"}
              </Table.Th>
              <Table.Th scope="col">
                <VisuallyHidden>Действия</VisuallyHidden>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {incidents.map((incident) => (
              <IncidentRow
                key={incident.serverId ?? incident.id}
                incident={incident}
                onOpenIncident={onOpenIncident}
                shortNumber={!operatorMode}
              />
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {pagination ?? (
        <Group justify="flex-end" gap={12} className={classes.pagination}>
          <Button
            variant="subtle"
            className={classes.paginationButton}
            rightSection={<ChevronDown size={10} />}
          >
            Страница: {count ? "1" : ""}
          </Button>
          <Button
            variant="subtle"
            className={classes.paginationButton}
            rightSection={<ChevronDown size={10} />}
          >
            Записей на странице: {count}
          </Button>
          <span className={classes.count}>
            {count ? `1-${count} из ${count}` : "0 из 0"}
          </span>
          <ActionIcon
            className={classes.toolbarIcon}
            aria-label="Предыдущая страница"
          >
            <ChevronLeft size={20} />
          </ActionIcon>
          <ActionIcon
            className={classes.toolbarIcon}
            aria-label="Следующая страница"
          >
            <ChevronRight size={20} />
          </ActionIcon>
        </Group>
      )}
    </section>
  );
}
