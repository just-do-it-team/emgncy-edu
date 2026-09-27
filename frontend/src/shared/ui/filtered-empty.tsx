import { Group, Paper, Text } from "@mantine/core";
import { Button } from "./button";

export function FilteredEmpty({ onReset }: { onReset: () => void }) {
  return (
    <Paper withBorder p="md">
      <Group justify="space-between" gap="sm">
        <Text size="sm">Под выбранные фильтры не попало ни одной строки.</Text>
        <Button size="xs" variant="outline" color="povDark2.6" onClick={onReset}>
          Сбросить фильтры
        </Button>
      </Group>
    </Paper>
  );
}
