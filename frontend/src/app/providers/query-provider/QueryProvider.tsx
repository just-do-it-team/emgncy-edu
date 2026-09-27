import React from "react";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { handleApiError } from "@/shared/api";
import { useSessionStore } from "@/entities/session";
import { notifyTrainingError, trainingKeys } from "@/entities/training";

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.queryKey[0] === trainingKeys.all[0]) {
        notifyTrainingError(error);
      } else if (query.meta?.showGlobalError !== false) {
        handleApiError(error, "Произошла ошибка");
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const unsubscribe = useSessionStore.subscribe((state, previous) => {
  if (state.profile === previous.profile) return;

  void queryClient.cancelQueries();
  queryClient.clear();
});

if (import.meta.hot) {
  import.meta.hot.dispose(unsubscribe);
}

export const QueryProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
