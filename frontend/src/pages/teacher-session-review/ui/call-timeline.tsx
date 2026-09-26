import type { KeyboardEvent, MouseEvent } from "react";
import type { CallSpeaker } from "@/shared/api";
import {
  axisRatio,
  formatOffset,
  utteranceStartNotes,
  type StreamItem,
  type TimelineAxis,
} from "../model/replay";
import classes from "./session-review.module.scss";

const LANE_TOP = 12;
const LANE_HEIGHT = 13;
const KEYBOARD_STEP_MS = 5000;

const laneOfSpeaker: Record<CallSpeaker, number> = {
  CALLER: 0,
  OPERATOR: 1,
  RESPONSE_LEAD: 1,
};

const speakerClass: Record<CallSpeaker, string> = {
  CALLER: classes.spanCaller,
  OPERATOR: classes.spanOperator,
  RESPONSE_LEAD: classes.spanLead,
};

const laneLabels = ["ЗАЯВИТЕЛЬ", "ОПЕРАТОР", "ДЕЙСТВИЯ"];

const EDGE_RATIO = 0.06;

function rulerEdgeClass(ratio: number): string {
  if (ratio < EDGE_RATIO) return classes.rulerLabelStart;
  if (ratio > 1 - EDGE_RATIO) return classes.rulerLabelEnd;

  return "";
}

function percent(axis: TimelineAxis, ms: number): string {
  return `${axisRatio(axis, ms) * 100}%`;
}

interface CallTimelineProps {
  axis: TimelineAxis;
  items: StreamItem[];
  durationsAvailable: boolean;
  cursorMs: number | null;
  onSeek: (ms: number) => void;
}

export function CallTimeline({ axis, items, durationsAvailable, cursorMs, onSeek }: CallTimelineProps) {
  const seekByPointer = (event: MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1);

    onSeek(axis.startMs + ratio * (axis.endMs - axis.startMs));
  };

  const seekByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -KEYBOARD_STEP_MS, ArrowRight: KEYBOARD_STEP_MS }[event.key];

    if (step === undefined) return;

    event.preventDefault();
    onSeek(Math.min(Math.max((cursorMs ?? axis.startMs) + step, axis.startMs), axis.endMs));
  };

  return (
    <div className={classes.strip}>
      <div className={classes.laneLabels}>
        <span />
        {laneLabels.map((label) => (
          <span key={label} className={classes.laneLabel}>
            {label}
          </span>
        ))}
      </div>

      <div
        className={classes.track}
        role="slider"
        tabIndex={0}
        aria-label="Шкала времени звонка"
        aria-valuemin={Math.round(axis.startMs / 1000)}
        aria-valuemax={Math.round(axis.endMs / 1000)}
        aria-valuenow={Math.round((cursorMs ?? axis.startMs) / 1000)}
        aria-valuetext={cursorMs === null ? "курсор не установлен" : formatOffset(cursorMs)}
        onClick={seekByPointer}
        onKeyDown={seekByKeyboard}
      >
        {laneLabels.map((label, index) => (
          <span
            key={label}
            className={`${classes.lane} ${index === laneLabels.length - 1 ? classes.laneLast : ""}`}
            style={{ top: LANE_TOP + index * LANE_HEIGHT }}
          />
        ))}

        {axis.normMs.map((ms) => (
          <span key={ms}>
            <span className={classes.normLine} style={{ left: percent(axis, ms) }} />
            <span
              className={`${classes.normLabel} ${axisRatio(axis, ms) > 1 - EDGE_RATIO ? classes.labelEnd : ""}`}
              style={{ left: percent(axis, ms) }}
            >
              {ms / 1000} с
            </span>
          </span>
        ))}

        {items.map((item) => {
          if (item.kind === "action") {
            return (
              <span
                key={item.id}
                className={`${classes.actionTick} ${item.event.kind === "rejected" ? classes.actionTickRejected : ""}`}
                style={{ left: percent(axis, item.offsetMs), top: LANE_TOP + 2 * LANE_HEIGHT + 1 }}
              />
            );
          }

          const { speaker } = item.utterance;
          const top = LANE_TOP + laneOfSpeaker[speaker] * LANE_HEIGHT + 2;
          const hint = item.startNote ? utteranceStartNotes[item.startNote].hint : undefined;

          return durationsAvailable && item.spanMs !== null ? (
            <span
              key={item.id}
              className={`${classes.span} ${speakerClass[speaker]}`}
              title={hint}
              style={{
                left: percent(axis, item.offsetMs),
                width: `${(item.spanMs / (axis.endMs - axis.startMs)) * 100}%`,
                top,
              }}
            />
          ) : (
            <span
              key={item.id}
              className={`${classes.spanTick} ${speakerClass[speaker]}`}
              title={hint}
              style={{ left: percent(axis, item.offsetMs), top }}
            />
          );
        })}

        {axis.rulerMs.map((ms) => (
          <span
            key={ms}
            className={`${classes.rulerLabel} ${rulerEdgeClass(axisRatio(axis, ms))}`}
            style={{ left: percent(axis, ms) }}
          >
            {formatOffset(ms)}
          </span>
        ))}

        {cursorMs !== null && <span className={classes.cursor} style={{ left: percent(axis, cursorMs) }} />}
      </div>
    </div>
  );
}
