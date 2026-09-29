import { Stack, Title } from "@mantine/core";
import { ArmMemo } from "@/widgets/arm-memo";

const StudentHelpPage = () => (
  <Stack gap="md">
    <Title order={2} size="h4" fw={600}>
      Справка: работа на АРМ-112
    </Title>
    <ArmMemo />
  </Stack>
);

export default StudentHelpPage;
