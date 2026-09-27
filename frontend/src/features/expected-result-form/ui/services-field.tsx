import { Checkbox, Paper, Select, Stack, Table, Text } from "@mantine/core";
import { Button } from "@/shared/ui";
import { serviceDiff } from "@/entities/scenario";
import type { ServiceOption } from "../model/use-active-services";

interface ServicesFieldProps {
  auto: string[];
  chosen: string[];
  restoredMain: string | null;
  options: ServiceOption[];
  error: string | null;
  dataPath: string;
  onChange: (services: string[]) => void;
}

function nameOf(code: string, options: ServiceOption[]): string {
  return options.find((option) => option.code === code)?.name ?? `служба ${code}`;
}

export function ServicesField({ auto, chosen, restoredMain, options, error, dataPath, onChange }: ServicesFieldProps) {
  const { added, removed } = serviceDiff(auto, chosen);
  const rows = [...chosen, ...removed];
  const [main] = chosen;
  const addable = options.filter((option) => !rows.includes(option.code));

  const toggle = (code: string, checked: boolean) =>
    onChange(checked ? [...chosen, code] : chosen.filter((item) => item !== code));

  return (
    <Stack gap="xs">
      <Stack gap={0}>
        <Text size="sm" fw={500}>
          Службы
        </Text>
        <Text size="xs" c="povDark2.6">
          Подбираются по ЕКП из типа происшествия и признаков маршрутизации. Главная — первая в списке: её
          сервер считает главной службой. Автоподбор ставит первой главную службу записи классификатора.
        </Text>
      </Stack>
      {rows.length === 0 ? (
        <Text size="sm" c="povDark2.6">
          Выберите тип происшествия — службы подтянутся автоматически.
        </Text>
      ) : (
        <Paper withBorder>
          <Table verticalSpacing={6} layout="fixed">
            <colgroup>
              <col width={48} />
              <col />
              <col width={200} />
              <col width={150} />
            </colgroup>
            <Table.Tbody>
              {rows.map((code) => (
                <Table.Tr key={code}>
                  <Table.Td>
                    <Checkbox
                      size="xs"
                      checked={chosen.includes(code)}
                      onChange={(event) => toggle(code, event.currentTarget.checked)}
                      aria-label={nameOf(code, options)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={code === main ? 600 : undefined}>
                      {nameOf(code, options)}
                      {code === main ? " — главная" : ""}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c={added.includes(code) || removed.includes(code) ? undefined : "povDark2.6"} fw={added.includes(code) || removed.includes(code) ? 600 : undefined}>
                      {added.includes(code)
                        ? "добавлено вручную"
                        : removed.includes(code)
                          ? "убрано из автоподбора"
                          : code === restoredMain
                            ? "главная служба добавлена по классификатору"
                            : "по ЕКП"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {chosen.includes(code) && code !== main && (
                      <Button
                        size="compact-xs"
                        variant="outline"
                        color="povDark2.6"
                        aria-label={`Сделать главной: ${nameOf(code, options)}`}
                        onClick={() => onChange([code, ...chosen.filter((item) => item !== code)])}
                      >
                        Сделать главной
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
      <Select
        size="xs"
        w={320}
        label="Добавить службу вручную"
        placeholder="Выберите службу"
        data={addable.map((option) => ({ value: option.code, label: option.name }))}
        value={null}
        onChange={(code) => {
          if (code !== null) onChange([...chosen, code]);
        }}
        searchable
        error={error}
        data-path={dataPath}
      />
    </Stack>
  );
}
