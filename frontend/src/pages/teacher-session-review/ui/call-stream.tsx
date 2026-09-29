import type { ReactNode } from "react";
import type { EmergencyService } from "@/shared/api";
import { actionLines } from "../model/action-lines";
import { formatOffset, utteranceStartNotes, type StreamItem } from "../model/replay";
import { speakerLabels } from "../model/review-labels";
import classes from "./session-review.module.scss";

interface CallStreamProps {
  items: StreamItem[];
  notice: ReactNode;
  emptyText: string;
  services: Map<string, EmergencyService> | undefined;
  activeId: string | null;
  selectedId: string | null;
  registerItem: (id: string, element: HTMLDivElement | null) => void;
  onPick: ((item: StreamItem) => void) | null;
}

function ActionBody({ item, services }: { item: Extract<StreamItem, { kind: "action" }>; services: CallStreamProps["services"] }) {
  const rejected = item.event.kind === "rejected";

  return (
    <div className={`${classes.action} ${rejected ? classes.actionRejected : ""}`}>
      {rejected && <span className={classes.mark}>ОТКЛОНЕНО</span>}
      {actionLines(item.event, services).map((line, index) => (
        <span key={index} className={classes.actionLine}>
          {line.label}
          {line.value !== null && (
            <>
              : <span className={classes.value}>{line.value}</span>
            </>
          )}
        </span>
      ))}
    </div>
  );
}

function Bubble({
  item,
  onPick,
}: {
  item: Extract<StreamItem, { kind: "utterance" }>;
  onPick: CallStreamProps["onPick"];
}) {
  const { speaker, text } = item.utterance;
  const own = speaker === "OPERATOR";
  const note = item.startNote === null ? null : utteranceStartNotes[item.startNote];
  const content = (
    <>
      <span className={classes.bubbleMeta}>
        {speakerLabels[speaker]} · {formatOffset(item.offsetMs)}
        {note && (
          <span className={classes.inputMode} title={note.hint}>
            {note.label}
          </span>
        )}
      </span>
      <span className={classes.utteranceText}>{text}</span>
    </>
  );
  const className = `${classes.bubble} ${own ? classes.bubbleOwn : classes.bubbleOther}`;

  return onPick === null ? (
    <div className={className}>{content}</div>
  ) : (
    <button type="button" className={className} onClick={() => onPick(item)} title="Перейти к реплике в записи">
      {content}
    </button>
  );
}

export function CallStream({
  items,
  notice,
  emptyText,
  services,
  activeId,
  selectedId,
  registerItem,
  onPick,
}: CallStreamProps) {
  return (
    <div className={classes.stream}>
      {notice}
      {items.length === 0 && <div className={classes.state}>{emptyText}</div>}
      {items.map((item) => (
        <div
          key={item.id}
          ref={(element) => registerItem(item.id, element)}
          className={`${classes.item} ${item.kind === "utterance" && item.utterance.speaker === "OPERATOR" ? classes.itemOwn : ""} ${
            item.id === activeId ? classes.itemActive : ""
          } ${item.id === selectedId ? classes.itemSelected : ""}`}
        >
          {item.kind === "utterance" ? (
            <Bubble item={item} onPick={onPick} />
          ) : (
            <>
              <span className={classes.itemTime}>{formatOffset(item.offsetMs)}</span>
              <ActionBody item={item} services={services} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
