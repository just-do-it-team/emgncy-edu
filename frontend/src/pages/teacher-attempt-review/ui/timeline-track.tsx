import type { ErrorSeverity } from "@/entities/attempt";
import type { Timeline } from "../model/timeline";
import classes from "./attempt-review.module.scss";

const markerSeverityClass: Record<ErrorSeverity, string> = {
  CRITICAL: classes.markCritical,
  SIGNIFICANT: classes.markSignificant,
  MINOR: classes.markMinor,
};

function clock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);

  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

interface TimelineTrackProps {
  timeline: Timeline;
  selectedErrorId: string | null;
  onSelectError: (errorId: string) => void;
}

export function TimelineTrack({ timeline, selectedErrorId, onSelectError }: TimelineTrackProps) {
  return (
    <div>
      <div className={classes.track}>
        {timeline.ticks.map((tick) => (
          <span
            key={tick.actionId}
            className={classes.tick}
            style={{ left: `${tick.ratio * 100}%` }}
          />
        ))}
        <span className={classes.norm} style={{ left: `${timeline.normRatio * 100}%` }} />
        {timeline.errors.map((mark) => (
          <button
            key={mark.errorId}
            type="button"
            className={`${classes.marker} ${markerSeverityClass[mark.severity]} ${
              selectedErrorId === mark.errorId ? classes.markerSelected : ""
            }`}
            style={{ left: `${mark.ratio * 100}%` }}
            title={`Ошибка на ${clock(mark.offsetSeconds)}`}
            aria-label={`Ошибка на ${clock(mark.offsetSeconds)}`}
            onClick={() => onSelectError(mark.errorId)}
          />
        ))}
      </div>
      <div className={classes.ruler}>
        {timeline.rulerSeconds.map((second) => (
          <span
            key={second}
            className={classes.rulerLabel}
            style={{ left: `${(second / timeline.totalSeconds) * 100}%` }}
          >
            {clock(second)}
          </span>
        ))}
      </div>
    </div>
  );
}
