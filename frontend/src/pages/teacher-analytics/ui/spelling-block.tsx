import { SimpleGrid, Skeleton, Stack, Table, Text } from "@mantine/core";
import { SPELLING_CAPTION } from "@/shared/lib";
import { spellingConclusion, type SpellingSummary } from "../model/group-insights";
import { AnalyticsCard } from "./analytics-card";
import classes from "./analytics.module.scss";

const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export function SpellingBlock({ summary }: { summary: SpellingSummary | null }) {
  const perAttempt = (errors: number, attempts: number) => (attempts === 0 ? 0 : errors / attempts);
  const scale = Math.max(1, ...(summary?.students ?? []).map((student) => perAttempt(student.errors, student.attempts)));

  return (
    <AnalyticsCard
      title="Грамотность ввода"
      conclusion={summary === null ? "Проверяем орфографию…" : spellingConclusion(summary)}
      actions={null}
      legend={`${SPELLING_CAPTION} Проверяется только текст, который обучаемый ввёл сам: описание и адреса карточки из звонка, комментарии ДДС. В балл не входит.`}
      wide={false}
    >
      {summary === null ? (
        <Skeleton height={120} radius={2} />
      ) : summary.students.length === 0 ? (
        <Text size="sm" c="povDark2.6">
          В периоде нет попыток, где обучаемые вводили текст сами.
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              Ошибок на попытку
            </Text>
            {summary.students.map((student) => {
              const value = perAttempt(student.errors, student.attempts);

              return (
                <Stack key={student.studentId} gap={2}>
                  <Text size="sm" className={classes.wrap}>
                    {student.name} — <span className={classes.numeric}>{decimal.format(value)}</span>
                  </Text>
                  <div className={classes.barTrack} role="img" aria-label={`${student.name}: ${decimal.format(value)} ошибки на попытку`}>
                    <div className={classes.barFill} style={{ width: `${(value / scale) * 100}%` }} />
                  </div>
                </Stack>
              );
            })}
          </Stack>
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              Частые ошибочные слова
            </Text>
            {summary.words.length === 0 ? (
              <Text size="sm" c="povDark2.6">
                Ошибок нет.
              </Text>
            ) : (
              <Table verticalSpacing={4} fz="sm">
                <Table.Tbody>
                  {summary.words.map((word) => (
                    <Table.Tr key={word.word}>
                      <Table.Td>
                        <span className={classes.changed}>{word.word}</span>
                        {word.suggestions.length > 0 && (
                          <Text span size="xs" c="povDark2.6">
                            {" "}
                            → {word.suggestions.slice(0, 2).join(", ")}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right" className={classes.numeric}>
                        {word.count}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </SimpleGrid>
      )}
    </AnalyticsCard>
  );
}
