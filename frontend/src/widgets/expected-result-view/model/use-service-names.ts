import { useEmergencyServices } from "@/entities/emergency-service";

export function useServiceNames(): Map<string, string> {
  const services = useEmergencyServices();

  return new Map([...(services.data?.values() ?? [])].map((service) => [service.code, service.name]));
}
