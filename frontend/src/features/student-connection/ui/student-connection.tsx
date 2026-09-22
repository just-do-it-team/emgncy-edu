import { useState } from "react";
import { Alert, Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { isUuid, useTrainingIdentity } from "@/entities/training";

export function StudentConnection() {
  const { userId, setUserId } = useTrainingIdentity();
  const [value, setValue] = useState(userId);
  const queryClient = useQueryClient();
  return (
    <Alert title="Подключение обучающегося к учебному API" color="blue">
      <Stack gap="xs">
        <Text size="sm">
          Вход по логину на бэкенде пока не реализован. Укажите UUID тестового
          обучающегося, которому назначены занятия. Это временная настройка
          подключения.
        </Text>
        <Group align="end">
          <TextInput
            label="UUID обучающегося"
            value={value}
            onChange={(e) => setValue(e.currentTarget.value.trim())}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            style={{ flex: 1 }}
          />
          <Button
            disabled={!isUuid(value) || value === userId}
            onClick={() => {
              void queryClient.cancelQueries({ queryKey: ["student-api"] });
              queryClient.removeQueries({ queryKey: ["student-api"] });
              setUserId(value);
            }}
          >
            Подключить
          </Button>
        </Group>
        {isUuid(userId) && (
          <Text size="xs">
            UUID задан. Права и доступ к занятиям проверяет бэкенд.
          </Text>
        )}
      </Stack>
    </Alert>
  );
}
