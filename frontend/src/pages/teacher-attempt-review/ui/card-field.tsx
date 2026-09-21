import type { ErrorSeverity } from "@/entities/attempt";
import type { CharSpan } from "../model/char-diff";
import type { ReviewView } from "../model/review-view";
import classes from "./attempt-review.module.scss";

const EMPTY = "—";

const fieldSeverityClass: Record<ErrorSeverity, string> = {
  CRITICAL: classes.fieldCritical,
  SIGNIFICANT: classes.fieldSignificant,
  MINOR: "",
};

const referenceSeverityClass: Record<ErrorSeverity, string> = {
  CRITICAL: classes.referenceCritical,
  SIGNIFICANT: classes.referenceSignificant,
  MINOR: classes.referenceSignificant,
};

interface CardFieldProps {
  label: string;
  value: string;
  reference: string;
  spans: CharSpan[];
  changed: boolean;
  severity: ErrorSeverity | null;
  view: ReviewView;
  selected: boolean;
  large?: boolean;
  onSelect?: () => void;
}

function Value({ value, spans, highlight }: { value: string; spans: CharSpan[]; highlight: boolean }) {
  if (value === EMPTY) return <span className={classes.fieldEmpty}>{EMPTY}</span>;
  if (!highlight) return <>{value}</>;

  return (
    <>
      {spans.map((span, index) => (
        <span key={index} className={span.changed ? classes.changedChars : undefined}>
          {span.text}
        </span>
      ))}
    </>
  );
}

export function CardField({
  label,
  value,
  reference,
  spans,
  changed,
  severity,
  view,
  selected,
  large,
  onSelect,
}: CardFieldProps) {
  const shown = view === "reference" ? reference : value;
  const highlighted = view === "comparison" && changed;
  const severityClass = highlighted && severity ? fieldSeverityClass[severity] : "";
  const classNames = [
    classes.field,
    severityClass,
    selected && highlighted ? classes.fieldSelected : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <div className={classNames} onClick={onSelect}>
        <span className={classes.fieldLabel}>{label}</span>
        <span className={`${classes.fieldValue} ${large ? classes.fieldValueLarge : ""}`}>
          <Value value={shown} spans={spans} highlight={highlighted} />
        </span>
      </div>
      {highlighted && (
        <div
          className={`${classes.referenceLine} ${severity ? referenceSeverityClass[severity] : classes.referenceSignificant}`}
        >
          эталон: {reference}
        </div>
      )}
    </div>
  );
}
