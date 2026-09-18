import { ActionIcon as MantineActionIcon } from "@mantine/core";

export const ActionIcon = MantineActionIcon.withProps({
  type: "button",
  variant: "subtle",
  size: "sm",
  radius: 0,
});

export type { ActionIconProps } from "@mantine/core";
