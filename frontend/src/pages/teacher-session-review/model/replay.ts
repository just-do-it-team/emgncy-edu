import type {
  ActionEvent,
  CallUtterance,
  EmergencyService,
  ExpertReviewContext,
  RecordingAxis,
  ReviewCard,
  ReviewCall,
} from "@/shared/api";
import { ACK_TIMEOUT_SECONDS, CARD_FILL_NORM_SECONDS } from "@/shared/config";

export type ReviewElement =
  | { kind: "call"; key: string; label: string; call: ReviewCall; originAt: string }
  | { kind: "card"; key: string; label: string; card: ReviewCard; originAt: string };

export type StreamItem =
  | {
      kind: "utterance";
      id: string;
      offsetMs: number;
      spanMs: number | null;
      startNote: UtteranceStartNote | null;
      utterance: CallUtterance;
    }
  | { kind: "action"; id: string; offsetMs: number; event: ActionEvent };

export interface TimelineAxis {
  startMs: number;
  endMs: number;
  rulerMs: number[];
  normMs: number[];
}

const RULER_STEP_MS = 30_000;

export const NORM_MARKS_MS = [ACK_TIMEOUT_SECONDS * 1000, CARD_FILL_NORM_SECONDS * 1000];

function timeOrLast(value: string | null): number {
  return value === null ? Number.POSITIVE_INFINITY : Date.parse(value);
}

function byTime(first: string | null, second: string | null): number {
  const difference = timeOrLast(first) - timeOrLast(second);

  return Number.isNaN(difference) ? 0 : difference;
}

export function reviewElements(context: ExpertReviewContext): ReviewElement[] {
  const calls = [...context.incomingCalls]
    .sort((first, second) => byTime(first.ringingAt, second.ringingAt))
    .map((call, index): ReviewElement => ({
      kind: "call",
      key: `call:${call.trainingCallId}`,
      label: `Звонок ${index + 1}`,
      call,
      originAt: call.answeredAt ?? call.ringingAt ?? context.session.startedAt,
    }));
  const cards = context.cards.map((card, index): ReviewElement => ({
    kind: "card",
    key: `card:${card.scenarioCardKey}`,
    label: `Карточка ${index + 1}`,
    card,
    originAt: context.session.startedAt,
  }));

  return [...calls, ...cards];
}

export function elementActions(element: ReviewElement, actions: ActionEvent[]): ActionEvent[] {
  if (element.kind === "call") {
    const { trainingCallId, incidentCardId } = element.call;

    return actions.filter(
      (action) =>
        action.entityId === trainingCallId ||
        (incidentCardId !== null && action.incidentCardId === incidentCardId),
    );
  }

  const { incidentCardId } = element.card;

  return incidentCardId === null
    ? []
    : actions.filter((action) => action.incidentCardId === incidentCardId);
}

export function offsetFrom(originAt: string, at: string): number {
  return Date.parse(at) - Date.parse(originAt);
}

function speechBeforeUploadMs(utterance: CallUtterance): number {
  const uploadedAfterSpeech = utterance.speaker === "OPERATOR" && utterance.inputMode === "VOICE";

  return uploadedAfterSpeech ? (utterance.durationMs ?? 0) : 0;
}

export type UtteranceStartNote = "estimate_clamped" | "before_answer";

export const utteranceStartNotes: Record<UtteranceStartNote, { label: string; hint: string }> = {
  estimate_clamped: {
    label: "начало речи уточнено",
    hint: "По длительности фраза начиналась до ответа на звонок. Начало показано от ответа, конец — момент загрузки.",
  },
  before_answer: {
    label: "время раньше ответа",
    hint: "Реплика записана раньше ответа на звонок — расхождение в данных сервера. Показана от ответа.",
  },
};

export function buildStream(
  originAt: string,
  utterances: CallUtterance[],
  actions: ActionEvent[],
): StreamItem[] {
  const items: StreamItem[] = [
    ...utterances.map((utterance): StreamItem => {
      const recordedMs = offsetFrom(originAt, utterance.createdAt);
      const lagMs = speechBeforeUploadMs(utterance);
      const startMs = recordedMs - lagMs;
      const endMs =
        lagMs > 0 ? recordedMs : utterance.durationMs === null ? null : recordedMs + utterance.durationMs;
      const shownStartMs = Math.max(0, startMs);
      const startNote: UtteranceStartNote | null =
        startMs >= 0 ? null : recordedMs >= 0 ? "estimate_clamped" : "before_answer";

      return {
        kind: "utterance",
        id: utterance.id,
        offsetMs: shownStartMs,
        spanMs: endMs === null ? null : Math.max(0, endMs - shownStartMs),
        startNote,
        utterance,
      };
    }),
    ...actions.map((event): StreamItem => ({
      kind: "action",
      id: event.id,
      offsetMs: offsetFrom(originAt, event.occurredAt),
      event,
    })),
  ];

  return items.sort((first, second) => first.offsetMs - second.offsetMs);
}

export function buildAxis(items: StreamItem[], completedOffsetMs: number | null): TimelineAxis {
  const ends = items.map((item) =>
    item.kind === "utterance" ? item.offsetMs + (item.spanMs ?? 0) : item.offsetMs,
  );
  const startMs = Math.min(0, ...items.map((item) => item.offsetMs));
  const endMs = Math.max(CARD_FILL_NORM_SECONDS * 1000, completedOffsetMs ?? 0, ...ends);
  const rulerMs: number[] = [];

  for (let ms = 0; ms <= endMs; ms += RULER_STEP_MS) rulerMs.push(ms);

  return { startMs, endMs, rulerMs, normMs: NORM_MARKS_MS };
}

export function axisRatio(axis: TimelineAxis, ms: number): number {
  return (ms - axis.startMs) / (axis.endMs - axis.startMs);
}

export function nearestItem(items: StreamItem[], ms: number): StreamItem | null {
  return items.reduce<StreamItem | null>(
    (nearest, item) =>
      nearest === null || Math.abs(item.offsetMs - ms) < Math.abs(nearest.offsetMs - ms)
        ? item
        : nearest,
    null,
  );
}

export function activeUtteranceId(axis: RecordingAxis, playbackMs: number | null): string | null {
  if (axis.status !== "available" || playbackMs === null) return null;

  const position = axis.positions.find(
    (item) =>
      playbackMs >= item.recordingOffsetMs &&
      playbackMs < item.recordingOffsetMs + item.durationMs,
  );

  return position?.utteranceId ?? null;
}

function serviceCodeOf(
  serviceId: string | null,
  services: Map<string, EmergencyService> | undefined,
): string | null {
  return serviceId === null ? null : (services?.get(serviceId)?.code ?? null);
}

function matchesPath(
  event: ActionEvent,
  path: string,
  services: Map<string, EmergencyService> | undefined,
): boolean {
  const [root, second, third] = path.split(".");

  if (path === "expected_result.outbound_call") {
    return event.kind === "outbound_evaluation" && event.stage === "evaluated";
  }
  if (root === "card" && second === "classification") {
    return (
      event.kind === "classification_updated" ||
      (event.kind === "card_updated" && event.changes.some((change) => change.field === "classification"))
    );
  }
  if (root === "card" && second === "services") return event.kind === "service_added";
  if (root === "card" && second === "current_status") return event.kind === "card_status_changed";
  if (root === "card" && second === "service_statuses") {
    return event.kind === "service_status_changed" && serviceCodeOf(event.serviceId, services) === third;
  }
  if (root === "card" && second !== undefined) {
    return event.kind === "card_updated" && event.changes.some((change) => change.field === second);
  }
  if (root === "service_status_history") {
    return event.kind === "service_status_changed" && serviceCodeOf(event.serviceId, services) === second;
  }
  if (root === "service_handling") {
    const opening = third === "opened_at" || third === "open_deadline";

    return opening
      ? event.kind === "card_opened" && serviceCodeOf(event.serviceId, services) === second
      : event.kind === "service_decision" && serviceCodeOf(event.serviceId, services) === second;
  }

  return false;
}

export function actionForPath(
  path: string,
  items: StreamItem[],
  services: Map<string, EmergencyService> | undefined,
): StreamItem | null {
  const matches = items.filter(
    (item) => item.kind === "action" && matchesPath(item.event, path, services),
  );

  return matches.at(-1) ?? null;
}

export function formatOffset(ms: number): string {
  const sign = ms < 0 ? "−" : "";
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);

  return `${sign}${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}
