import { useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { errorStatus, type TemplateGenerationDto } from "@/shared/api";
import { forgetGeneration, rememberedGenerations } from "../model/generation-storage";
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

const NOT_FOUND = 404;

function generationQuery(generationId: string, queryClient: QueryClient, onMissing: (() => void) | null) {
  return {
    queryKey: scenarioKeys.generation(generationId),
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const generation = await fetchTemplateGeneration(generationId, signal).catch((error: unknown) => {
        if (errorStatus(error) === NOT_FOUND) onMissing?.();
        throw error;
      });

      if (isGenerationFinished(generation)) forgetGeneration(generation.created_by, generation.id);
      if (generation.status === "COMPLETED") {
        await queryClient.invalidateQueries({ queryKey: scenarioKeys.templateList() });
      }

      return generation;
    },
    staleTime: 0,
    gcTime: GENERATION_GC_MS,
    refetchInterval: (query: { state: { data: TemplateGenerationDto | undefined } }) =>
      document.hidden || isGenerationFinished(query.state.data) ? false : POLL_MS,
    refetchOnWindowFocus: true,
    retry: false,
    meta: { showGlobalError: false },
  };
}

/**
 * Опрос фоновой генерации шаблонов, пока страница открыта. Пока задача не завершена, статус
 * запрашивается раз в 2 с; на скрытой вкладке опрос встаёт, при возвращении — сразу обновляется.
 * Когда генерация завершилась, список шаблонов инвалидируется, чтобы черновики появились в
 * библиотеке, а задача убирается из списка незавершённых.
 */
export function useTemplateGeneration(generationId: string | null) {
  const queryClient = useQueryClient();

  return useQuery({ ...generationQuery(generationId ?? "", queryClient, null), enabled: generationId !== null });
}

/** Незавершённые генерации преподавателя, запущенные в этом браузере. */
export function usePendingGenerations(userId: string) {
  const queryClient = useQueryClient();
  const [ids] = useState(() => rememberedGenerations(userId));

  return useQueries({
    queries: ids.map((id) => generationQuery(id, queryClient, () => forgetGeneration(userId, id))),
    combine: (results) =>
      results.flatMap((result) => (result.data && !isGenerationFinished(result.data) ? [result.data] : [])),
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
