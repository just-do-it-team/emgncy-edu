export const callAudioEventName = "workspace-call-audio";

export type CallAudioEvent = {
  workspaceId: string;
  type: string;
  data?: Record<string, unknown>;
};

export function publishCallAudioEvent(event: CallAudioEvent) {
  window.dispatchEvent(new CustomEvent(callAudioEventName, { detail: event }));
}
