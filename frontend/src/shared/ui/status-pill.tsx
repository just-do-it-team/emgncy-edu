import type { ReactNode } from "react";
import classes from "./status-pill.module.scss";

export type PillTone = "blue" | "orange" | "red" | "green" | "gray";

/** Статус «таблеткой». Цвета задаёт область кабинета переменными --cov-pill-*; вне её — нейтральные. */
export function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span className={classes.pill} data-tone={tone}>
      {children}
    </span>
  );
}
