import { Anchor, List, Stack, Table, Text, Title } from "@mantine/core";
import { memoSections, type MemoBlock } from "../model/memo";
import classes from "./arm-memo.module.scss";

function Block({ block }: { block: MemoBlock }) {
  if (block.kind === "subheading") {
    return (
      <Title order={4} size="h6" fw={600} mt="xs">
        {block.text}
      </Title>
    );
  }
  if (block.kind === "note") {
    return (
      <Text size="sm" className={`${classes.text} ${classes.note}`}>
        {block.text}
      </Text>
    );
  }
  if (block.kind === "list") {
    return (
      <List size="sm" type={block.ordered ? "ordered" : "unordered"} spacing={4} className={classes.text}>
        {block.items.map((item) => (
          <List.Item key={item}>{item}</List.Item>
        ))}
      </List>
    );
  }
  if (block.kind === "table") {
    const [header, ...rows] = block.rows;

    return (
      <Table.ScrollContainer minWidth={640} type="native">
        <Table withTableBorder withColumnBorders fz="sm" verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              {(header ?? []).map((cell) => (
                <Table.Th key={cell}>{cell}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row, index) => (
              <Table.Tr key={index}>
                {row.map((cell, cellIndex) => (
                  <Table.Td key={cellIndex} className={classes.cell}>
                    {cell}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    );
  }

  return (
    <Text size="sm" className={classes.text}>
      {block.text}
    </Text>
  );
}

export function ArmMemo() {
  return (
    <div className={classes.layout}>
      <nav aria-label="Оглавление памятки" className={classes.toc}>
        <Stack gap={6}>
          <Text size="xs" fw={600} c="povDark2.6">
            Оглавление
          </Text>
          {memoSections.map((section) => (
            <Anchor key={section.id} href={`#${section.id}`} size="sm" c="povDark2.6" underline="hover">
              {section.title}
            </Anchor>
          ))}
        </Stack>
      </nav>
      <Stack gap="lg">
        <Text size="xs" c="povDark2.6">
          Памятка отдела контроля реагирования Службы 112 ГБУ «Система 112» «Работа на АРМ-112», 2025 г. Текст приведён
          без иллюстраций и контактных данных.
        </Text>
        {memoSections.map((section) => (
          <Stack key={section.id} gap="sm" id={section.id}>
            <Title order={3} size="h5" fw={600}>
              {section.title}
            </Title>
            {section.blocks.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </Stack>
        ))}
      </Stack>
    </div>
  );
}
