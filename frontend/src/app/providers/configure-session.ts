import { useSessionStore } from "@/entities/session";
import { useTrainingIdentity } from "@/entities/training";

function syncTrainingIdentity(userId: string | undefined) {
  useTrainingIdentity.getState().setUserId(userId ?? "");
}

syncTrainingIdentity(useSessionStore.getState().profile?.userId);

const unsubscribe = useSessionStore.subscribe((state) =>
  syncTrainingIdentity(state.profile?.userId),
);

if (import.meta.hot) {
  import.meta.hot.dispose(unsubscribe);
}
