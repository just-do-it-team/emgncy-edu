import { useEffect, useState } from "react";
import { Box, Group } from "@mantine/core";
import { MdDirectionsRun } from "react-icons/md";
import {
  ChevronDown,
  CircleHelp,
  Monitor,
  Search,
  Settings,
  Headphones,
  List,
  BarChart3,
  Users,
  FileText,
  Globe,
} from "lucide-react";
import { useSessionStore, type UserRole } from "@/entities/session";
import { ActionIcon, Button, TextInput } from "@/shared/ui";
import classes from "./workspace-header.module.scss";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

const roleLabels: Record<UserRole, string> = {
  admin: "Администратор",
  teacher: "Преподаватель",
  student: "Обучающийся",
};

function shortName(displayName?: string) {
  const parts = displayName?.trim().split(/\s+/) ?? [];
  if (parts.length < 2) return parts[0] ?? "";
  return [
    parts[0],
    ...parts.slice(1, 3).map((part) => part[0].toLocaleUpperCase("ru-RU")),
  ].join(" ");
}

function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const parts = dateFormatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const date = `${capitalize(part("weekday"))}, ${part("day")} ${capitalize(part("month"))} ${part("year")}`;
  const time = now.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <>
      <time className={classes.date} dateTime={now.toISOString()}>
        {date}
      </time>
      <time
        className={classes.clock}
        dateTime={now.toISOString()}
        aria-label={time}
      >
        <span>{time.slice(0, 5)}</span>
        <span className={classes.seconds}>:{time.slice(6)}</span>
      </time>
    </>
  );
}

export function WorkspaceHeader({
  role,
  operatorMode = false,
  onCreateCard,
}: {
  role: UserRole;
  operatorMode?: boolean;
  onCreateCard?: () => void;
}) {
  const profile = useSessionStore((state) => state.profile);

  return (
    <Box
      component="header"
      className={classes.header}
      data-operator={operatorMode || undefined}
    >
      <div className={classes.searchPanel}>
        <TextInput
          aria-label="Поиск происшествий"
          placeholder="Поиск происшествий"
          classNames={{ input: classes.searchInput }}
          rightSectionWidth={40}
          rightSectionPointerEvents="all"
          rightSection={
            <ActionIcon
              className={classes.searchIcon}
              aria-label="Найти происшествия"
              size={36}
            >
              <Search size={30} strokeWidth={1.5} />
            </ActionIcon>
          }
        />
        <Group justify="space-between" className={classes.searchActions}>
          <Button
            variant="subtle"
            className={classes.advancedSearch}
            rightSection={<ChevronDown size={12} />}
          >
            расширенный по параметрам
          </Button>
          <Button variant="outline" className={classes.reset}>
            сбросить
          </Button>
        </Group>
      </div>

      <div className={classes.accountPanel}>
        <div className={classes.accountTop}>
          <Clock />
          {operatorMode && (
            <div className={classes.connection}>
              <Headphones size={22} />
              <span>Учебный режим</span>
            </div>
          )}
          <Group gap={6} wrap="nowrap" className={classes.accountActions}>
            <span
              className={classes.operatorName}
              title={profile?.displayName || roleLabels[role]}
            >
              {shortName(profile?.displayName) ||
                profile?.username ||
                roleLabels[role]}
            </span>
            <span className={classes.workstation} aria-label="АРМ 000">
              <Monitor size={12} aria-hidden="true" />
              АРМ 000
            </span>
            <ActionIcon className={classes.accountIcon} aria-label="Настройки">
              <Settings size={12} />
            </ActionIcon>
            <ActionIcon className={classes.accountIcon} aria-label="Справка">
              <CircleHelp size={12} />
            </ActionIcon>
            <span className={classes.accountStaticIcon} aria-hidden="true">
              <MdDirectionsRun size={14} />
            </span>
          </Group>
        </div>
        {operatorMode && (
          <nav
            className={classes.operatorNav}
            aria-label="Панель оператора 112"
          >
            {[
              { label: "журнал", Icon: List, active: true },
              { label: "экран", Icon: Monitor },
              { label: "статистика", Icon: BarChart3 },
              { label: "заявители", Icon: Users },
              { label: "техника", Icon: Settings },
              { label: "отчёты", Icon: FileText },
              { label: "регионы", Icon: Globe },
            ].map(({ label, Icon, active }) => (
              <button
                key={label}
                type="button"
                disabled={!active}
                aria-current={active ? "page" : undefined}
                title={
                  active ? "Список карточек" : "Недоступно в учебном режиме"
                }
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
      {operatorMode && (
        <div className={classes.createPanel}>
          <Button
            className={classes.createCard}
            onClick={onCreateCard}
            disabled={!onCreateCard}
            title={
              !onCreateCard
                ? "Бэкенд пока разрешает создание карточек только преподавателю"
                : undefined
            }
          >
            Создать новую карточку
          </Button>
        </div>
      )}
    </Box>
  );
}
