import { classifierRecords, resolveServices, type ClassifierRecord, type RoutingFlags } from "@/entities/incident";
import type { OperatorClassificationDto } from "@/shared/api";

const recordsById = new Map(classifierRecords.map((record) => [record.id, record]));

export function classifierRecord(recordId: number | null): ClassifierRecord | undefined {
  return recordId === null ? undefined : recordsById.get(recordId);
}

export function recordExists(recordId: number): boolean {
  return recordsById.has(recordId);
}

export function classificationFor(recordId: number, flags: Record<string, boolean>): OperatorClassificationDto | null {
  const record = recordsById.get(recordId);

  if (!record) return null;

  const [groupCode, feature1, feature2, feature3] = record.codes;

  return {
    record_id: record.id,
    group_code: groupCode,
    feature_1_code: feature1,
    feature_2_code: feature2,
    feature_3_code: feature3,
    final_incident_type: record.name,
    routing_flags: Object.fromEntries(Object.entries(flags).filter(([, selected]) => selected)),
    excluded_service_codes: [],
  };
}

function routedCodes(record: ClassifierRecord, flags: Record<string, boolean>): string[] {
  return resolveServices(record, flags as RoutingFlags)
    .map((service) => service.code)
    .filter((code) => code !== "");
}

export function autoServices(recordId: number | null, flags: Record<string, boolean>, known: Set<string> | null): string[] {
  const record = classifierRecord(recordId);

  if (!record) return [];

  return routedCodes(record, flags).filter((code) => known === null || known.has(code));
}

export function recordChain(record: ClassifierRecord): string {
  return [record.group, ...record.features].filter((part): part is string => part !== null).join(" › ");
}
