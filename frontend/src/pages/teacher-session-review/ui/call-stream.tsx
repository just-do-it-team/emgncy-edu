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
}

function ItemBody({ item, services }: { item: StreamItem; services: CallStreamProps["services"] }) {
  if (item.kind === "utterance") {
    const { speaker, inputMode, text } = item.utterance;

    return (
      <>
        <span className={classes.speaker}>
          {speakerLabels[speaker]}
          {inputMode === "TEXT" && <span className={classes.inputMode}>набрано текстом</span>}
          {item.startNote && (
            <span className={classes.inputMode} title={utteranceStartNotes[item.startNote].hint}>
              {utteranceStartNotes[item.startNote].label}
            </span>
          )}
        </span>
        <span className={classes.utteranceText}>{text}</span>
      </>
    );
  }

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

export function CallStream({
  items,
  notice,
  emptyText,
  services,
  activeId,
  selectedId,
  registerItem,
}: CallStreamProps) {
  return (
    <div className={classes.stream}>
      {notice}
      {items.length === 0 && <div className={classes.state}>{emptyText}</div>}
      {items.map((item) => (
        <div
          key={item.id}
          ref={(element) => registerItem(item.id, element)}
          className={`${classes.item} ${item.id === activeId ? classes.itemActive : ""} ${
            item.id === selectedId ? classes.itemSelected : ""
          }`}
        >
          <span className={classes.itemTime}>{formatOffset(item.offsetMs)}</span>
          <ItemBody item={item} services={services} />
        </div>
      ))}
    </div>
  );
}
