import type { ReactNode } from "react";
import { Group, Paper, Stack, Text, Title } from "@mantine/core";
import classes from "./analytics.module.scss";

interface AnalyticsCardProps {
  title: string;
  conclusion: string;
  actions: ReactNode;
  legend: ReactNode;
  wide: boolean;
  children: ReactNode;
}

export function AnalyticsCard({ title, conclusion, actions, legend, wide, children }: AnalyticsCardProps) {
  return (
    <Paper withBorder p="md" className={wide ? classes.wide : undefined} component="section" aria-label={title}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="wrap" gap="sm" align="flex-start">
          <Title order={3} size="h5" fw={600} className={classes.cardHead}>
            {title}
          </Title>
          {actions}
        </Group>
        {children}
        <Text size="sm" fw={500}>
          {conclusion}
        </Text>
        {legend && (
          <Text size="xs" c="povDark2.6" component="div">
            {legend}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
