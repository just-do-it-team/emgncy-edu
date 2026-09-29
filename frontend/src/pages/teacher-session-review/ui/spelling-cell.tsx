import { useState } from "react";
import { Group, Modal, Stack, Text } from "@mantine/core";
import { misspellingCount, spellingFields, spellingWords } from "@/entities/expert-review";
import type { ExpertReviewContext } from "@/shared/api";
import { SPELLING_CAPTION, splitByMisspelled, useSpelling } from "@/shared/lib";
import { Button } from "@/shared/ui";
import classes from "./session-review.module.scss";

interface SpellingCellProps {
  context: ExpertReviewContext;
  participantId: string | null;
}

export function SpellingCell({ context, participantId }: SpellingCellProps) {
  const [opened, setOpened] = useState(false);
  const fields = spellingFields(context, participantId);
  const spelling = useSpelling(spellingWords(fields));
  const misspelled = spelling.data ?? new Map<string, string[]>();
  const count = spelling.data ? misspellingCount(fields, misspelled) : null;
  const value =
    fields.length === 0
      ? "текста нет"
      : spelling.isPending
        ? "проверяется…"
        : spelling.isError
          ? "словарь не загрузился"
          : `${count} ${count === 1 ? "ошибка" : "ошибок"}`;

  return (
    <>
      <div className={classes.cell}>
        <span className={classes.cellLabel}>Грамотность ввода</span>
        <Group gap={8} wrap="nowrap">
          <span className={classes.cellValue}>{value}</span>
          {fields.length > 0 && spelling.isSuccess && (
            <Button size="compact-xs" variant="outline" color="povDark2.6" onClick={() => setOpened(true)}>
              Подробнее
            </Button>
          )}
        </Group>
      </div>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Грамотность ввода"
        centered
        size="lg"
        radius={2}
        transitionProps={{ duration: 0 }}
      >
        <Stack gap="sm">
          <Text size="xs" c="povDark2.6">
            {SPELLING_CAPTION} Слова с заглавной буквы и слова из эталона не проверяются.
          </Text>
          {fields.map((field, index) => {
            const errors = field.tokens.filter((token) => misspelled.has(token.word));

            return (
              <Stack key={`${field.label}:${index}`} gap={4}>
                <Text size="xs" fw={600}>
                  {field.label}
                  {errors.length === 0 ? " — ошибок нет" : ""}
                </Text>
                <Text size="sm" className={classes.spellingText}>
                  {splitByMisspelled(field.text, field.tokens, misspelled).map((part, partIndex) =>
                    part.misspelled ? (
                      <mark key={partIndex} className={classes.misspelled}>
                        {part.text}
                      </mark>
                    ) : (
                      <span key={partIndex}>{part.text}</span>
                    ),
                  )}
                </Text>
                {errors.map((token) => (
                  <Text key={token.start} size="xs">
                    «{token.word}» →{" "}
                    {(misspelled.get(token.word) ?? []).length === 0
                      ? "вариантов нет"
                      : (misspelled.get(token.word) ?? []).join(", ")}
                  </Text>
                ))}
              </Stack>
            );
          })}
        </Stack>
      </Modal>
    </>
  );
}
