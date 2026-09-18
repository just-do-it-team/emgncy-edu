import { Button as MantineButton } from "@mantine/core";

export const Button = MantineButton.withProps({
  size: "md",
  radius: "sm",
  type: "button",
});

export type { ButtonProps } from "@mantine/core";
