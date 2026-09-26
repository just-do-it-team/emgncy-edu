import { api, type EmergencyServiceDto } from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import { emergencyServicesMock } from "./emergency-service.mocks";

export async function fetchEmergencyServices(signal?: AbortSignal): Promise<EmergencyServiceDto[]> {
  if (mocks.services) return emergencyServicesMock;

  const { data } = await api.get<EmergencyServiceDto[]>(`${CARD_API_URL}/services`, { signal });

  return data;
}
