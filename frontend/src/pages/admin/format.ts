export function dateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString("ru-RU") : "Нет данных";
}

export function metric(value: number | null | undefined, unit = ""): string {
  if (value === null || value === undefined) return "Нет данных";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)}${unit}`;
}

export function statusColor(status: string): string {
  if (
    ["healthy", "running", "up", "enabled", "completed", "SUCCESS"].includes(
      status,
    )
  )
    return "green";
  if (["degraded", "warning", "pending", "unknown"].includes(status))
    return "yellow";
  return "red";
}

const statusLabels: Record<string, string> = {
  healthy: "Работает",
  degraded: "Есть проблемы",
  unavailable: "Недоступно",
  unhealthy: "Недоступно",
  unknown: "Неизвестно",
  running: "Работает",
  up: "Доступен",
  down: "Недоступен",
  enabled: "Включено",
  disabled: "Отключено",
  completed: "Завершено",
  failed: "Ошибка",
  blocked: "Заблокирован",
  pending: "Ожидает",
  firing: "Активно",
  warning: "Предупреждение",
  error: "Ошибка",
  critical: "Критично",
  SUCCESS: "Успешно",
  FAILURE: "Ошибка",
  DENIED: "Отклонено",
};

export function statusLabel(status: string): string {
  return statusLabels[status] ?? status;
}
