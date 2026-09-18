import { PasswordInput as MantinePasswordInput } from "@mantine/core";

export const PasswordInput = MantinePasswordInput.withProps({
  size: "md",
  radius: "sm",
  visibilityToggleButtonProps: {
    "aria-label": "Показать или скрыть пароль",
    tabIndex: 0,
  },
});

export type { PasswordInputProps } from "@mantine/core";
