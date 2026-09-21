import { Group, Select, Text } from "@mantine/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ActionIcon } from "./action-icon";
import { PAGE_SIZE_OPTIONS } from "./pagination-options";

interface TablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <Group justify="flex-end" gap="md" wrap="nowrap" p="sm">
      <Group gap={6} wrap="nowrap">
        <Text size="xs" c="povDark2.6">
          Страница:
        </Text>
        <Select
          size="xs"
          w={72}
          radius={2}
          allowDeselect={false}
          value={String(page)}
          data={Array.from({ length: lastPage }, (_, index) => String(index + 1))}
          onChange={(value) => onPageChange(Number(value))}
          aria-label="Страница"
        />
      </Group>

      <Group gap={6} wrap="nowrap">
        <Text size="xs" c="povDark2.6">
          Записей на странице:
        </Text>
        <Select
          size="xs"
          w={80}
          radius={2}
          allowDeselect={false}
          value={String(pageSize)}
          data={PAGE_SIZE_OPTIONS}
          onChange={(value) => onPageSizeChange(Number(value))}
          aria-label="Записей на странице"
        />
      </Group>

      <Text size="xs">
        {from}-{to} из {total}
      </Text>

      <Group gap={4} wrap="nowrap">
        <ActionIcon
          aria-label="Предыдущая страница"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </ActionIcon>
        <ActionIcon
          aria-label="Следующая страница"
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight size={16} />
        </ActionIcon>
      </Group>
    </Group>
  );
}
