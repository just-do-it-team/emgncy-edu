import { useQuery } from "@tanstack/react-query";
import type { EmergencyService, EmergencyServiceDto } from "@/shared/api";
import { serviceDisplayName } from "@/shared/config";
import { fetchEmergencyServices } from "./emergency-service-api";
import { emergencyServiceKeys } from "./emergency-service.keys";

const DIRECTORY_STALE_MS = 24 * 60 * 60 * 1000;
const DIRECTORY_GC_MS = 7 * 24 * 60 * 60 * 1000;

function toDirectory(services: EmergencyServiceDto[]): Map<string, EmergencyService> {
  return new Map(services.map((service) => [service.id, { code: service.code, name: serviceDisplayName(service.code, service.name) }]));
}

export function useEmergencyServices() {
  return useQuery({
    queryKey: emergencyServiceKeys.directory(),
    queryFn: ({ signal }) => fetchEmergencyServices(signal),
    select: toDirectory,
    staleTime: DIRECTORY_STALE_MS,
    gcTime: DIRECTORY_GC_MS,
    refetchOnMount: false,
    retry: 2,
    meta: { showGlobalError: false },
  });
}
