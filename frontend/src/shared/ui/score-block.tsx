import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./score-block.module.scss";

interface ScoreBlockProps {
  value: number;
  caption: string;
  children: ReactNode;
}

export function ScoreBlock({ value, caption, children }: ScoreBlockProps) {
  return (
    <div className={classes.totalRow}>
      <div className={classes.totalScore}>
        <span className={classes.totalValue}>{value}</span>
        <Text size="9px" tt="uppercase">
          балл
        </Text>
      </div>
      <div className={classes.verdict}>
        <Text fw={700} size="sm">
          {caption}
        </Text>
        <Text size="xs">{children}</Text>
      </div>
    </div>
  );
}
