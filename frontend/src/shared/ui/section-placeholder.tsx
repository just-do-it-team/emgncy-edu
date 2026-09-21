import { Stack, Text, Title } from "@mantine/core";

export function SectionPlaceholder({ title }: { title: string }) {
  return (
    <Stack gap={4} py="xl" align="center" role="status">
      <Title order={2} size="h4" fw={600}>
        {title}
      </Title>
      <Text size="sm" c="povDark2.6">
        Раздел в разработке
      </Text>
    </Stack>
  );
}
