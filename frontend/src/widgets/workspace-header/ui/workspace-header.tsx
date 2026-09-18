import { useEffect, useState } from "react";
import { Box, Group } from "@mantine/core";
import {
  ChevronDown,
  CircleHelp,
  Monitor,
  Search,
  Settings,
} from "lucide-react";
import type { UserRole } from "@/entities/session";
import { LogoutButton } from "@/features/auth";
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

export function WorkspaceHeader({ role }: { role: UserRole }) {
  return (
    <Box component="header" className={classes.header}>
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
          <Group gap={6} wrap="nowrap" className={classes.accountActions}>
            <span title={roleLabels[role]}>, УМЦ О п</span>
            <ActionIcon
              className={classes.accountIcon}
              aria-label="Рабочее место"
            >
              <Monitor size={12} />
            </ActionIcon>
            <ActionIcon className={classes.accountIcon} aria-label="Настройки">
              <Settings size={12} />
            </ActionIcon>
            <ActionIcon className={classes.accountIcon} aria-label="Справка">
              <CircleHelp size={12} />
            </ActionIcon>
            <LogoutButton className={classes.accountIcon} />
          </Group>
        </div>
      </div>
    </Box>
  );
}
