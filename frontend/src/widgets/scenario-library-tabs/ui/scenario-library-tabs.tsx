import { Group, Stack, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import classes from "./scenario-library-tabs.module.scss";

type ScenarioLibraryTab = "scenarios" | "templates";

const tabs: { value: ScenarioLibraryTab; label: string; path: string }[] = [
  { value: "scenarios", label: "Сценарии", path: "/teacher/scenarios" },
  { value: "templates", label: "Шаблоны", path: "/teacher/scenarios/templates" },
];

interface ScenarioLibraryTabsProps {
  active: ScenarioLibraryTab;
  actions: ReactNode;
}

export function ScenarioLibraryTabs({ active, actions }: ScenarioLibraryTabsProps) {
  return (
    <Stack gap="sm">
      <Title order={2} size="h4" fw={600}>
        Сценарии
      </Title>
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
        <nav aria-label="Раздел библиотеки" className={classes.tabs}>
          {tabs.map((tab) => (
            <Link
              key={tab.value}
              to={tab.path}
              className={classes.tab}
              aria-current={tab.value === active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        {actions}
      </Group>
    </Stack>
  );
}
