import { SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { formatAddress, type AddressDraft } from "@/entities/scenario";
import classes from "./expected-form.module.scss";
import type { FormBinding } from "../model/form-binding";

const parts: [keyof AddressDraft, string][] = [
  ["subject", "Субъект"],
  ["settlement", "Населённый пункт"],
  ["object", "Объект"],
  ["district", "Район"],
  ["street", "Улица"],
  ["house", "Дом"],
  ["building", "Корпус"],
  ["structure", "Строение"],
  ["apartment", "Квартира"],
];

interface AddressFieldsProps {
  form: FormBinding;
  path: string;
  value: AddressDraft;
  legend: string;
}

export function AddressFields({ form, path, value, legend }: AddressFieldsProps) {
  const line = formatAddress(value);

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        {legend}
      </Text>
      <SimpleGrid cols={{ base: 2, md: 5 }} spacing="xs" verticalSpacing="xs">
        {parts.map(([part, label]) => (
          <TextInput key={part} size="xs" label={label} {...form.getInputProps(`${path}.${part}`)} />
        ))}
      </SimpleGrid>
      <TextInput
        size="xs"
        label="Описательный адрес"
        description="Ориентиры словами, когда точного адреса нет: «напротив пруда», «рядом с ТЦ»"
        {...form.getInputProps(`${path}.descriptive`)}
      />
      <Text size="xs" c="povDark2.6" className={classes.addressLine}>
        Строка адреса, как её соберёт АРМ обучаемого: {line === "" ? "—" : line}
      </Text>
    </Stack>
  );
}
