import type { ReactNode } from "react";
import { Loader, Stack } from "@mantine/core";

interface SpinnerContentProps {
  size?: "small" | "medium" | "large";
  show?: boolean;
  fullScreen?: boolean;
  className?: string;
  children?: ReactNode;
}

const loaderSizes = { small: 24, medium: 32, large: 48 };

export function Spinner({
  size = "medium",
  show = true,
  fullScreen = false,
  children,
  className,
}: SpinnerContentProps) {
  if (!show) return null;

  return (
    <Stack
      align="center"
      justify="center"
      pos={fullScreen ? "fixed" : undefined}
      inset={fullScreen ? 0 : undefined}
      role="status"
      aria-label="Загрузка"
    >
      <Loader size={loaderSizes[size]} className={className} />
      {children}
    </Stack>
  );
}
