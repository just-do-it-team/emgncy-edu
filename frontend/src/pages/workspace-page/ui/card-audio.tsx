import { useEffect, useState } from "react";
import { Accordion, Button, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import {
  formatApiDate,
  statusLabels,
  trainingApi,
  trainingKeys,
  type AudioMessage,
  type LaunchContext,
} from "@/entities/training";

export function CardAudio({
  ctx,
  cardId,
  defaultOpened = false,
}: {
  ctx: LaunchContext;
  cardId: string;
  defaultOpened?: boolean;
}) {
  const [opened, setOpened] = useState<string | null>(
    defaultOpened ? "audio" : null,
  );
  const query = useQuery({
    queryKey: trainingKeys.audioMessages(ctx, cardId),
    queryFn: ({ signal }) => trainingApi.audioMessages(ctx, cardId, signal),
    enabled: opened !== null,
    refetchOnWindowFocus: false,
    meta: { showGlobalError: false },
  });
  return (
    <Accordion value={opened} onChange={setOpened}>
      <Accordion.Item value="audio">
        <Accordion.Control>Аудиосообщения и расшифровки</Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            {query.isPending && <Text size="sm">Загрузка…</Text>}
            {query.isError && (
              <Button
                size="xs"
                variant="subtle"
                onClick={() => void query.refetch()}
              >
                Повторить загрузку аудиосообщений
              </Button>
            )}
            {query.data?.length === 0 && (
              <Text size="sm" c="dimmed">
                Аудиосообщений пока нет. Голосовой диалог будет подключён
                отдельно.
              </Text>
            )}
            {query.data?.map((message) => (
              <AudioItem
                key={message.id}
                userId={ctx.userId}
                message={message}
              />
            ))}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
function AudioItem({
  userId,
  message,
}: {
  userId: string;
  message: AudioMessage;
}) {
  const [requested, setRequested] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const query = useQuery({
    queryKey: trainingKeys.audioContent(userId, message.id),
    queryFn: ({ signal }) =>
      trainingApi.audioContent(userId, message.id, signal),
    enabled: requested,
    staleTime: Infinity,
    gcTime: 0,
    meta: { showGlobalError: false },
  });
  useEffect(() => {
    if (!query.data) return;
    const objectUrl = URL.createObjectURL(query.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [query.data]);
  return (
    <Stack gap={4}>
      <Text size="xs">
        {formatApiDate(message.created_at)} ·{" "}
        {statusLabels[message.status] ?? message.status}
      </Text>
      <Text size="sm">
        {message.transcript ??
          message.source_text ??
          "Расшифровка ещё не готова"}
      </Text>
      {message.content_url && !url && (
        <Button
          size="compact-xs"
          variant="subtle"
          loading={query.isFetching}
          onClick={() => {
            setRequested(true);
            if (requested) void query.refetch();
          }}
        >
          Загрузить аудио
        </Button>
      )}
      {url && <audio controls src={url} preload="metadata" />}
    </Stack>
  );
}
