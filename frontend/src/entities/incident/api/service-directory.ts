import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api";
import { classifierServiceNames } from "../model/classifier";

interface EmergencyService {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

// Отдельное opt-in подключение только для справочника АРМ. Моковые карточки
// не отправляются на сервер; UUID служб не подменяются кодами классификатора.
export function useServiceDirectory(enabled = true) {
  const baseURL = import.meta.env.VITE_ARM_API_URL?.replace(/\/$/, "");
  return useQuery({
    queryKey: ["arm-service-directory", baseURL ?? "local"],
    queryFn: async ({ signal }) => {
      if (!baseURL) return classifierServiceNames;
      const { data } = await api.get<EmergencyService[]>("/api/v1/services", {
        baseURL,
        signal,
        timeout: 10000,
      });
      return [
        ...new Set(
          data
            .filter((service) => service.is_active)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((service) => service.name),
        ),
      ];
    },
    enabled,
    staleTime: 300000,
    retry: 1,
  });
}
