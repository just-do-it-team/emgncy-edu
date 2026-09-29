import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TemplateGenerationDto } from "@/shared/api";
import { scenarioKeys } from "./scenario.keys";
import { fetchTemplateGeneration, startTemplateGeneration, updateTemplate } from "./template-generation-api";

const POLL_MS = 2000;
const GENERATION_GC_MS = 30 * 60 * 1000;
const FINISHED = new Set<TemplateGenerationDto["status"]>(["COMPLETED", "FAILED"]);

export function isGenerationFinished(generation: TemplateGenerationDto | undefined): boolean {
  return generation !== undefined && FINISHED.has(generation.status);
}

export function useStartTemplateGeneration() {
  return useMutation({ mutationFn: startTemplateGeneration, retry: false });
}

/**
 * Опрос фоновой генерации шаблонов. Пока задача не завершена, статус запрашивается раз в 2 с;
 * на скрытой вкладке опрос встаёт, при возвращении — сразу обновляется. Когда генерация
 * завершилась, список шаблонов инвалидируется, чтобы новые черновики появились в библиотеке.
 * `watching` позволяет прекратить ожидание, не отменяя задачу на сервере.
 */
export function useTemplateGeneration(generationId: string | null, watching: boolean) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: scenarioKeys.generation(generationId ?? ""),
    queryFn: async ({ signal }) => {
      const generation = await fetchTemplateGeneration(generationId ?? "", signal);

      if (generation.status === "COMPLETED") {
        await queryClient.invalidateQueries({ queryKey: scenarioKeys.templateList() });
      }

      return generation;
    },
    enabled: generationId !== null && watching,
    staleTime: 0,
    gcTime: GENERATION_GC_MS,
    refetchInterval: (query) =>
      document.hidden || isGenerationFinished(query.state.data) ? false : POLL_MS,
    refetchOnWindowFocus: true,
    retry: false,
    meta: { showGlobalError: false },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTemplate,
    retry: false,
    onSuccess: (template) => queryClient.setQueryData(scenarioKeys.template(template.kind, template.id), template),
    onSettled: () => queryClient.invalidateQueries({ queryKey: scenarioKeys.templateList() }),
  });
}
