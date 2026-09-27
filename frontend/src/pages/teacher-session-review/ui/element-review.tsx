import { useEffect, useRef, useState, type ReactNode } from "react";
import { Skeleton } from "@mantine/core";
import { isAxiosError } from "axios";
import { useCallRecording } from "@/entities/call-recording";
import { useCallTranscript } from "@/entities/call-transcript";
import {
  alignRecordingAxis,
  type ActionEvent,
  type AutomaticResult,
  type EmergencyService,
  type RecordingAxis,
  type ReviewCall,
  type ReviewCard,
  type ReviewOutgoingCall,
} from "@/shared/api";
import {
  actionForPath,
  activeUtteranceId,
  buildAxis,
  buildStream,
  nearestItem,
  offsetFrom,
  type StreamItem,
} from "../model/replay";
import { CallStream } from "./call-stream";
import { CallTimeline } from "./call-timeline";
import { RecordingPlayer } from "./recording-player";
import { ReviewFindings, type RoleState } from "./review-findings";
import classes from "./session-review.module.scss";

interface LayoutProps {
  originAt: string;
  completedAt: string | null;
  items: StreamItem[];
  durationsAvailable: boolean;
  streamNotice: ReactNode;
  emptyText: string;
  timelineCaption: string | null;
  activeId: string | null;
  result: AutomaticResult | null;
  roleState: RoleState;
  services: Map<string, EmergencyService> | undefined;
  player: ReactNode;
  focusPath: string | null;
  scopeNote: string | null;
  limitedNote: string | null;
}

function ElementLayout({
  originAt,
  completedAt,
  items,
  durationsAvailable,
  streamNotice,
  emptyText,
  timelineCaption,
  activeId,
  result,
  roleState,
  services,
  player,
  focusPath,
  scopeNote,
  limitedNote,
}: LayoutProps) {
  const [manualCursorMs, setCursorMs] = useState<number | null>(null);
  const [manualSelectedId, setSelectedId] = useState<string | null>(null);
  const itemElements = useRef(new Map<string, HTMLDivElement>());
  const linked = focusPath === null ? null : actionForPath(focusPath, items, services);
  const cursorMs = manualCursorMs ?? linked?.offsetMs ?? null;
  const selectedId = manualSelectedId ?? linked?.id ?? null;
  const linkedId = linked?.id ?? null;

  useEffect(() => {
    if (linkedId !== null) itemElements.current.get(linkedId)?.scrollIntoView({ block: "center" });
  }, [linkedId]);
  const axis = buildAxis(items, completedAt === null ? null : offsetFrom(originAt, completedAt));

  const registerItem = (id: string, element: HTMLDivElement | null) => {
    if (element) itemElements.current.set(id, element);
    else itemElements.current.delete(id);
  };

  const focus = (item: StreamItem) => {
    setSelectedId(item.id);
    itemElements.current.get(item.id)?.scrollIntoView({ block: "nearest" });
  };

  const seek = (ms: number) => {
    setCursorMs(ms);

    const nearest = nearestItem(items, ms);

    if (nearest) focus(nearest);
  };

  const locateFinding = (item: StreamItem) => {
    setCursorMs(item.offsetMs);
    focus(item);
  };

  return (
    <>
      <div className={classes.body}>
        <div className={classes.leftColumn}>
          <div className={classes.timeline}>
            <CallTimeline
              axis={axis}
              items={items}
              durationsAvailable={durationsAvailable}
              cursorMs={cursorMs}
              onSeek={seek}
            />
            {timelineCaption && <div className={classes.caption}>{timelineCaption}</div>}
          </div>
          <CallStream
            items={items}
            notice={streamNotice}
            emptyText={emptyText}
            services={services}
            activeId={activeId}
            selectedId={selectedId}
            registerItem={registerItem}
          />
        </div>
        <div className={classes.rightColumn}>
          <ReviewFindings
            result={result}
            roleState={roleState}
            services={services}
            locate={(path) => actionForPath(path, items, services)}
            onLocate={locateFinding}
            scopeNote={scopeNote}
            limitedNote={limitedNote}
          />
        </div>
      </div>
      {player}
    </>
  );
}

const COMPLETED_CALL_STATUS = "COMPLETED";

const callStatusLabels: Record<string, string> = {
  PENDING: "не поступил",
  RINGING: "не принят",
  ACTIVE: "не завершён",
  FAILED: "сорвался",
  CANCELLED: "отменён",
};

function syncNotice(axis: RecordingAxis | null): string | null {
  if (axis === null) {
    return "Синхронизация недоступна: расшифровка не загружена, подсветка реплик отключена.";
  }
  if (axis.status === "available") return null;
  if (axis.reason === "missing_duration") {
    return "Синхронизация недоступна: у части реплик нет длительности, подсветка реплик отключена.";
  }

  return `Синхронизация недоступна: запись и сумма реплик расходятся на ${(
    Math.abs(axis.recordingMs - axis.utterancesTotalMs) / 1000
  ).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с, подсветка реплик отключена.`;
}

function transcriptProblem(error: Error): string {
  const status = isAxiosError(error) ? error.response?.status : undefined;

  if (status === 404) return "Расшифровка недоступна: звонок не найден или нет прав на него.";
  if (status === 403) return "Расшифровка недоступна: пользователь запроса не совпадает с пользователем входа.";

  return "Расшифровка недоступна: сервер не ответил. Действия в карточке показаны ниже.";
}

interface CallElementReviewProps {
  call: ReviewCall;
  focusPath: string | null;
  scopeNote: string | null;
  limitedNote: string | null;
  originAt: string;
  actions: ActionEvent[];
  roleState: RoleState;
  services: Map<string, EmergencyService> | undefined;
}

export function CallElementReview({
  call,
  focusPath,
  scopeNote,
  limitedNote,
  originAt,
  actions,
  roleState,
  services,
}: CallElementReviewProps) {
  const transcript = useCallTranscript(call.trainingCallId);
  const completed = call.status === COMPLETED_CALL_STATUS;
  const recording = useCallRecording(call.trainingCallId, completed);
  const [playbackMs, setPlaybackMs] = useState<number | null>(null);

  const utterances = transcript.data?.utterances ?? [];
  const items = buildStream(originAt, utterances, actions);
  const durationsAvailable = utterances.every((utterance) => utterance.durationMs !== null);
  const recordingMs = recording.data?.status === "READY" ? recording.data.durationMs : null;
  const axis =
    transcript.data === undefined
      ? null
      : recordingMs === null
        ? transcript.data.recordingAxis
        : alignRecordingAxis(transcript.data.recordingAxis, recordingMs);

  const streamNotice = transcript.isPending ? (
    <div className={classes.state}>
      <Skeleton height={14} radius={0} mb={8} />
      <Skeleton height={14} radius={0} mb={8} width="80%" />
      <Skeleton height={14} radius={0} width="60%" />
    </div>
  ) : transcript.isError ? (
    <div className={classes.state}>
      {transcriptProblem(transcript.error)}
      <div className={classes.stateHint}>Запись звонка, если она готова, можно прослушать ниже.</div>
    </div>
  ) : utterances.length === 0 ? (
    <div className={classes.state}>
      В расшифровке нет реплик с текстом.
      <div className={classes.stateHint}>Действия в карточке показаны ниже, запись — в нижней полосе.</div>
    </div>
  ) : null;

  return (
    <ElementLayout
      focusPath={focusPath}
      scopeNote={scopeNote}
      limitedNote={limitedNote}
      originAt={originAt}
      completedAt={call.completedAt}
      items={items}
      durationsAvailable={durationsAvailable}
      streamNotice={streamNotice}
      emptyText="Журнал действий по этому звонку пуст: карточка не создавалась и не менялась."
      timelineCaption={
        durationsAvailable
          ? null
          : "Длительности реплик недоступны: реплики отмечены засечками в момент записи."
      }
      activeId={axis === null ? null : activeUtteranceId(axis, playbackMs)}
      result={call.automaticResult}
      roleState={roleState}
      services={services}
      player={
        completed ? (
          <RecordingPlayer
            callId={call.trainingCallId}
            recording={recording}
            syncNotice={syncNotice(axis)}
            onPlaybackChange={setPlaybackMs}
          />
        ) : (
          <div className={classes.player}>
            <span className={classes.playerText}>Записи нет</span>
            <span className={classes.playerHint}>
              {`Звонок ${callStatusLabels[call.status] ?? "не завершён"}: запись собирается только для завершённых звонков.`}
            </span>
          </div>
        )
      }
    />
  );
}

interface CardElementReviewProps {
  card: ReviewCard;
  focusPath: string | null;
  scopeNote: string | null;
  limitedNote: string | null;
  originAt: string;
  actions: ActionEvent[];
  roleState: RoleState;
  services: Map<string, EmergencyService> | undefined;
}

export function CardElementReview({
  card,
  focusPath,
  scopeNote,
  limitedNote,
  originAt,
  actions,
  roleState,
  services,
}: CardElementReviewProps) {
  return (
    <ElementLayout
      focusPath={focusPath}
      scopeNote={scopeNote}
      limitedNote={limitedNote}
      originAt={originAt}
      completedAt={null}
      items={buildStream(originAt, [], actions)}
      durationsAvailable
      streamNotice={
        <div className={classes.state}>
          У этой карточки нет звонка: показаны только действия в карточке от начала попытки.
        </div>
      }
      emptyText={
        card.incidentCardId === null
          ? "Карточка ещё не выпущена в попытке, действий по ней нет."
          : "Журнал действий по карточке пуст."
      }
      timelineCaption={null}
      activeId={null}
      result={card.automaticResult}
      roleState={roleState}
      services={services}
      player={
        <div className={classes.player}>
          <span className={classes.playerHint}>У карточки нет звонка, записи нет.</span>
        </div>
      }
    />
  );
}

interface OutgoingCallElementReviewProps {
  call: ReviewOutgoingCall;
  focusPath: string | null;
  scopeNote: string | null;
  limitedNote: string | null;
  originAt: string;
  actions: ActionEvent[];
  roleState: RoleState;
  services: Map<string, EmergencyService> | undefined;
}

export function OutgoingCallElementReview({
  call,
  focusPath,
  scopeNote,
  limitedNote,
  originAt,
  actions,
  roleState,
  services,
}: OutgoingCallElementReviewProps) {
  return (
    <ElementLayout
      focusPath={focusPath}
      scopeNote={scopeNote}
      limitedNote={
        limitedNote ??
        "Исходящий звонок оценивается в составе карточки: результат проверки смысла — в элементе карточки, по которой звонили."
      }
      originAt={originAt}
      completedAt={call.completedAt}
      items={buildStream(originAt, call.utterances, actions)}
      durationsAvailable={false}
      streamNotice={
        call.utterances.length === 0 ? (
          <div className={classes.state}>
            Реплик исходящего звонка в данных разбора нет: показаны только отметки начала и завершения.
          </div>
        ) : null
      }
      emptyText="По исходящему звонку нет ни реплик, ни отметок начала и завершения."
      timelineCaption={
        call.startedAt === null
          ? "Начало звонка в журнале не найдено: время отсчитано от начала попытки, длительности реплик неизвестны."
          : "Длительности реплик для исходящего звонка сервер не передаёт: реплики отмечены засечками в момент записи."
      }
      activeId={null}
      result={null}
      roleState={roleState}
      services={services}
      player={
        <div className={classes.player}>
          <span className={classes.playerText}>Записи нет</span>
          <span className={classes.playerHint}>Сервер собирает запись только для входящих звонков.</span>
        </div>
      }
    />
  );
}
