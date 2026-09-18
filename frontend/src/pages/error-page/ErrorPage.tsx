import { RotateCw } from "lucide-react";
import { Button, Stack, Text, Title } from "@mantine/core";

export const ErrorPage = () => {
  const reloadPage = () => {
    location.reload();
  };

  return (
    <Stack mih="100vh" align="center" justify="center" p="md" gap={0} ta="center">
      <Title order={3} mt={30} size="xl" fw={600}>
        Произошла непредвиденная ошибка
      </Title>
      <Text mb={15}>
        Попробуйте перезагрузить страницу через некоторое время
      </Text>
      <Button onClick={reloadPage} leftSection={<RotateCw size={20} />}>
        Перезагрузить страницу
      </Button>
    </Stack>
  );
};
