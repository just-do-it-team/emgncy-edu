import { useMutation, useQueryClient } from "@tanstack/react-query";
import { abortSharedSession, type AbortSessionRequest } from "./monitoring-api";
import { monitoringKeys } from "./monitoring.keys";

export function useAbortSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: AbortSessionRequest) => abortSharedSession(request),
    retry: false,
    onSettled: (_data, _error, request) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: monitoringKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: monitoringKeys.actions(request.sessionId) }),
      ]),
  });
}
