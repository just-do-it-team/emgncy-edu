import { SegmentedControl, Stack, Text } from "@mantine/core";
import type { CheckMode } from "@/entities/scenario";
import type { ScenarioSourceType } from "@/shared/api";

const modeLabels: Record<CheckMode, string> = {
  checked: "проверяется",
  not_checked: "не проверяется",
  must_be_empty: "должно быть пустым",
};

const unavailable: Record<ScenarioSourceType, CheckMode> = {
  TEMPLATE: "not_checked",
  INLINE: "must_be_empty",
};

interface CheckModeControlProps {
  label: string;
  source: ScenarioSourceType;
  value: CheckMode;
  onChange: (mode: CheckMode) => void;
}

export function CheckModeControl({ label, source, value, onChange }: CheckModeControlProps) {
  const disabled = unavailable[source];

  return (
    <Stack gap={2}>
      <SegmentedControl
        size="xs"
        radius={2}
        value={value}
        onChange={(next) => {
          if (next === "checked" || next === "not_checked" || next === "must_be_empty") onChange(next);
        }}
        aria-label={`Проверка поля «${label}»`}
        data={(Object.keys(modeLabels) as CheckMode[]).map((mode) => ({
          value: mode,
          label: modeLabels[mode],
          disabled: mode === disabled && value !== mode,
        }))}
      />
      {value === disabled && (
        <Text size="xs" c="povDark2.6">
          Режим невыразим для этого источника — выберите другой.
        </Text>
      )}
    </Stack>
  );
}
