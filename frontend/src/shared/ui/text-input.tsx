import { TextInput as MantineTextInput } from "@mantine/core";

export const TextInput = MantineTextInput.withProps({
  size: "md",
  radius: "sm",
});

export type { TextInputProps } from "@mantine/core";
