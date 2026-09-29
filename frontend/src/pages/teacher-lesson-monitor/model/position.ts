import { participantRoleLabels, type MonitorParticipant } from "@/entities/monitoring";
import type { EmergencyService } from "@/shared/api";

export function positionText(row: MonitorParticipant, services: Map<string, EmergencyService> | undefined): string {
  if (row.positionCode === null) return participantRoleLabels[row.role];

  const service = [...(services?.values() ?? [])].find((item) => item.code === row.positionCode);

  return `ДДС ${row.positionCode}${service ? ` ${service.name}` : ""}`;
}
