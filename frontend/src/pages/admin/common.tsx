import type { ReactNode } from "react";
import {
  Alert,
  Badge,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Button } from "@/shared/ui";
import { statusColor, statusLabel } from "./format";

export function Status({ value, label }: { value: string; label?: string }) {
  return (
    <Badge color={statusColor(value)} variant="light">
      {label ?? statusLabel(value)}
    </Badge>
  );
}

export function QueryState({
  pending,
  error,
  onRetry,
}: {
  pending: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (pending) return <Skeleton height={120} radius={2} />;
  if (error)
    return (
      <Alert color="red" title="Не удалось загрузить данные">
        <Button size="xs" variant="outline" onClick={onRetry}>
          Повторить
        </Button>
      </Alert>
    );
  return null;
}

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Title order={2} size="h4" fw={600}>
          {title}
        </Title>
        {action}
      </Group>
      {children}
    </Stack>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <Paper withBorder p="md">
      <Text size="sm" c="dimmed">
        {text}
      </Text>
    </Paper>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Paper withBorder p="md" miw={170}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="lg" fw={600}>
        {value}
      </Text>
    </Paper>
  );
}
