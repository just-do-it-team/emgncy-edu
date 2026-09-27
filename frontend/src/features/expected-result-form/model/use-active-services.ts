import { useQuery } from "@tanstack/react-query";
import { emergencyServiceKeys, fetchEmergencyServices } from "@/entities/emergency-service";
import type { EmergencyServiceDto } from "@/shared/api";

const DIRECTORY_STALE_MS = 24 * 60 * 60 * 1000;
const DIRECTORY_GC_MS = 7 * 24 * 60 * 60 * 1000;

export interface ServiceOption {
  code: string;
  name: string;
}

function activeOptions(services: EmergencyServiceDto[]): ServiceOption[] {
  return services
    .filter((service) => service.is_active)
    .sort((first, second) => first.sort_order - second.sort_order)
    .map((service) => ({ code: service.code, name: service.name }));
}

export function useActiveServices() {
  return useQuery({
    queryKey: emergencyServiceKeys.directory(),
    queryFn: ({ signal }) => fetchEmergencyServices(signal),
    select: activeOptions,
    staleTime: DIRECTORY_STALE_MS,
    gcTime: DIRECTORY_GC_MS,
    refetchOnMount: false,
    retry: 2,
    meta: { showGlobalError: false },
  });
}
