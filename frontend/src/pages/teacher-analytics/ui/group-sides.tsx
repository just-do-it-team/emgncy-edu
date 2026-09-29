import { SimpleGrid, Stack, Text } from "@mantine/core";
import { groupSides, sidesConclusion, type ColumnSide } from "../model/group-insights";
import { analyticsColumnLabels, type AttemptFacts } from "../model/student-stats";
import { AnalyticsCard } from "./analytics-card";
import { ShareBar } from "./share-bar";
import classes from "./analytics.module.scss";

const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 0 });

function SideList({ title, sides, empty }: { title: string; sides: ColumnSide[]; empty: string }) {
  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        {title}
      </Text>
      {sides.length === 0 ? (
        <Text size="sm" c="povDark2.6">
          {empty}
        </Text>
      ) : (
        sides.map(({ column, share }) => (
          <Stack key={column} gap={2}>
            <Text size="sm">
              {analyticsColumnLabels[column]} —{" "}
              <span className={classes.numeric}>
                ошибки в {percent.format(share.withErrors / share.applicable)} попыток ({share.withErrors} из {share.applicable})
              </span>
            </Text>
            <ShareBar share={share.withErrors / share.applicable} label={`${analyticsColumnLabels[column]}, доля попыток с ошибкой`} />
          </Stack>
        ))
      )}
    </Stack>
  );
}

export function GroupSides({ facts }: { facts: AttemptFacts[] }) {
  const analyzed = facts.filter((attempt) => attempt.errors !== null);
  const { strong, weak } = groupSides(analyzed);

  return (
    <AnalyticsCard
      title="Сильные и слабые стороны группы"
      conclusion={sidesConclusion(analyzed)}
      actions={null}
      legend="По группам проверок разбора: полоса — доля попыток, где в этой группе была ошибка. Сильные — с наименьшей долей, слабые — с наибольшей."
      wide={false}
    >
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <SideList title="Уверенно" sides={strong} empty="Нет групп проверок без заметных ошибок." />
        <SideList title="Проседает" sides={weak} empty="Ошибок по группам проверок нет." />
      </SimpleGrid>
    </AnalyticsCard>
  );
}
