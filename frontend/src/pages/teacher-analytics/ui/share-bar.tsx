import classes from "./analytics.module.scss";

const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 0 });

/** Горизонтальная полоса доли 0–1 с подписью значения для экранных читалок. */
export function ShareBar({ share, label }: { share: number; label: string }) {
  return (
    <div className={classes.barTrack} role="img" aria-label={`${label}: ${percent.format(share)}`}>
      <div className={classes.barFill} style={{ width: `${Math.min(Math.max(share, 0), 1) * 100}%` }} />
    </div>
  );
}
