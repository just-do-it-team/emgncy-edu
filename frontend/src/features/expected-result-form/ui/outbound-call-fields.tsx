import { NumberInput, Stack, Switch, Text, Textarea } from "@mantine/core";
import type { OutboundDraft } from "@/entities/scenario";
import type { FormBinding } from "../model/form-binding";

const SIMILARITY_MIN = 0.5;
const SIMILARITY_MAX = 1;
const SIMILARITY_STEP = 0.05;

interface OutboundCallFieldsProps {
  form: FormBinding;
  path: string;
  value: OutboundDraft;
}

export function OutboundCallFields({ form, path, value }: OutboundCallFieldsProps) {
  return (
    <Stack gap="xs">
      <Switch
        size="sm"
        label="Эталон включает исходящий звонок бригаде"
        {...form.getInputProps(`${path}.enabled`, { type: "checkbox" })}
      />
      {value.enabled && (
        <>
          <Textarea
            size="xs"
            label="Что диспетчер должен сообщить бригаде"
            autosize
            minRows={2}
            {...form.getInputProps(`${path}.expectedText`)}
          />
          <NumberInput
            size="xs"
            w={220}
            label="Порог смыслового сходства"
            min={SIMILARITY_MIN}
            max={SIMILARITY_MAX}
            step={SIMILARITY_STEP}
            decimalScale={2}
            decimalSeparator=","
            {...form.getInputProps(`${path}.minimumSimilarity`)}
          />
          <Text size="xs" c="povDark2.6">
            Проверяет модель по смыслу, а не посимвольно; её вывод не подтверждён, пока его не проверит преподаватель.
          </Text>
        </>
      )}
    </Stack>
  );
}
