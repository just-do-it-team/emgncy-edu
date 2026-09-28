import type { GetInputPropsReturnType } from "@mantine/form";

export interface FormBinding {
  getInputProps: (path: string, options?: { type?: "input" | "checkbox" }) => GetInputPropsReturnType;
  setFieldValue: (path: string, value: unknown) => void;
}
