import { Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./lesson-results.module.scss";

interface FactProps {
  label: string;
  children: ReactNode;
}

export function Fact({ label, children }: FactProps) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="povDark2.6">
        {label}
      </Text>
      <Text size="sm" fw={500} className={classes.numeric}>
        {children}
      </Text>
    </Stack>
  );
}
