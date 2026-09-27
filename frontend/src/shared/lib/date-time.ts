type Moment = string | Date;

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("ru-RU", options);
}

const shortDateTime = formatter({ day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const dateTime = formatter({
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateTimeSeconds = formatter({
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const dayMonthTime = formatter({ day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const longDate = formatter({ day: "numeric", month: "long", year: "numeric" });
const clockTime = formatter({ hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

function toDate(value: Moment): Date {
  return typeof value === "string" ? new Date(value) : value;
}

export function formatShortDateTime(value: Moment): string {
  return shortDateTime.format(toDate(value));
}

export function formatDateTime(value: Moment): string {
  return dateTime.format(toDate(value));
}

export function formatDateTimeSeconds(value: Moment): string {
  return dateTimeSeconds.format(toDate(value));
}

export function formatDayMonthTime(value: Moment): string {
  return dayMonthTime.format(toDate(value));
}

export function formatLongDate(value: Moment): string {
  return longDate.format(toDate(value));
}

export function formatClockTime(value: Moment): string {
  return clockTime.format(toDate(value));
}

export function localDayKey(value: Moment): string {
  const date = toDate(value);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function localDayStart(value: Moment): Date {
  const date = toDate(value);

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function localTimeOfDay(daysAgo: number, hours: number, minutes: number, seconds: number): Date {
  const today = localDayStart(new Date());

  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo, hours, minutes, seconds);
}
