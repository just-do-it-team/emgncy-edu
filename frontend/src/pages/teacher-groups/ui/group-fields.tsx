import { Stack, Textarea, TextInput } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import type { GroupFieldsValues } from "../model/group-draft";

interface GroupFieldsProps<T extends GroupFieldsValues> {
  form: UseFormReturnType<T>;
}

export function GroupFields<T extends GroupFieldsValues>({ form }: GroupFieldsProps<T>) {
  return (
    <Stack gap="sm">
      <TextInput size="sm" label="Название" withAsterisk data-autofocus {...form.getInputProps("name")} />
      <Textarea size="sm" label="Описание" autosize minRows={2} maxRows={5} {...form.getInputProps("description")} />
    </Stack>
  );
}
