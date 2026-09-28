import { Group, Modal, Stack, Text } from "@mantine/core";
import { Button } from "./button";

interface LeaveConfirmModalProps {
  opened: boolean;
  onStay: () => void;
  onLeave: () => void;
}

export function LeaveConfirmModal({ opened, onStay, onLeave }: LeaveConfirmModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onStay}
      title="Уйти без сохранения?"
      centered
      radius={2}
      transitionProps={{ duration: 0 }}
    >
      <Stack gap="sm">
        <Text size="sm">Изменения не сохранены. Если уйти со страницы, они пропадут.</Text>
        <Group justify="flex-end" gap="xs">
          <Button size="sm" variant="outline" color="povDark2.6" onClick={onLeave}>
            Уйти без сохранения
          </Button>
          <Button size="sm" onClick={onStay} data-autofocus>
            Остаться
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
