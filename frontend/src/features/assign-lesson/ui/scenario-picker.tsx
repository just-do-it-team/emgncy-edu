import { useState } from "react";
import { Group, Select, TextInput } from "@mantine/core";
import { Search } from "lucide-react";
import {
  difficultyLabel,
  difficultyLevel,
  difficultyOptions,
  scenarioRole,
  scenarioRoleLabels,
} from "@/entities/scenario";
import type { ScenarioListItem } from "@/shared/api";

const roleOptions = Object.entries(scenarioRoleLabels).map(([value, label]) => ({ value, label }));

interface ScenarioPickerProps {
  scenarios: ScenarioListItem[];
  initialDifficulty: string | null;
  value: string | null;
  error: string | undefined;
  onChange: (scenarioId: string | null) => void;
}

export function ScenarioPicker({ scenarios, initialDifficulty, value, error, onChange }: ScenarioPickerProps) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<string | null>(initialDifficulty);
  const needle = query.trim().toLocaleLowerCase("ru");
  const options = scenarios
    .filter(
      (scenario) =>
        scenario.id === value ||
        ((needle === "" || scenario.name.toLocaleLowerCase("ru").includes(needle)) &&
          (role === null || scenarioRole(scenario.composition) === role) &&
          (difficulty === null || String(difficultyLevel(scenario.difficulty)) === difficulty)),
    )
    .sort((first, second) => first.name.localeCompare(second.name, "ru"))
    .map((scenario) => ({
      value: scenario.id,
      label: `${scenario.name} — ${difficultyLabel(scenario.difficulty).toLocaleLowerCase("ru")}`,
    }));

  return (
    <Group gap="xs" align="flex-start" wrap="wrap">
      <TextInput
        size="xs"
        w={220}
        label="Поиск сценария"
        placeholder="Название"
        leftSection={<Search size={14} />}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <Select size="xs" w={170} label="Роль" data={roleOptions} value={role} onChange={setRole} clearable />
      <Select
        size="xs"
        w={160}
        label="Сложность"
        data={difficultyOptions}
        value={difficulty}
        onChange={setDifficulty}
        clearable
      />
      <Select
        size="xs"
        w={360}
        label="Сценарий"
        withAsterisk
        placeholder={options.length === 0 ? "Нет утверждённых сценариев под фильтр" : "Выберите сценарий"}
        data={options}
        value={value}
        onChange={onChange}
        searchable
        error={error}
        data-path="scenarioId"
        nothingFoundMessage="Не найдено"
      />
    </Group>
  );
}
