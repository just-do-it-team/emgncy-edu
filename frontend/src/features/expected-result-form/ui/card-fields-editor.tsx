import type { ReactNode } from "react";
import { Group, NumberInput, SimpleGrid, Stack, Text, TextInput, Textarea, Tooltip } from "@mantine/core";
import { Info, TriangleAlert } from "lucide-react";
import {
  comparisonHints,
  comparisonLabels,
  comparisonOf,
  type CardFieldsDraft,
  type CheckMode,
  type OptionalCardField,
} from "@/entities/scenario";
import type { ScenarioSourceType } from "@/shared/api";
import { tooltipEvents } from "@/shared/ui";
import { AddressFields } from "./address-fields";
import { CheckModeControl } from "./check-mode-control";
import classes from "./expected-form.module.scss";
import type { FormBinding } from "../model/form-binding";

const workspaceGaps: Partial<Record<OptionalCardField, string>> = {
  reported_address:
    "АРМ отправляет сюда структурированный адрес формы: «г. Москва», улица, дом, корпус, строение, подъезд, квартира. Уточнение места («во дворе», «у пруда») — только в адресе происшествия.",
  victims_count: "АРМ обучаемого это поле не заполняет — при проверке будет расхождение всегда.",
};

export interface CheckModes {
  source: ScenarioSourceType;
  values: Record<OptionalCardField, CheckMode>;
  onChange: (field: OptionalCardField, mode: CheckMode) => void;
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <Text size="xs" c="povDark2.6" className={classes.hint}>
      <TriangleAlert size={12} aria-hidden="true" />
      {children}
    </Text>
  );
}

function ComparisonNote({ field }: { field: string }) {
  const comparison = comparisonOf(field);

  if (comparison === "strict") return null;

  return (
    <Tooltip label={comparisonHints[comparison]} events={tooltipEvents} multiline w={320} color="povDark.6" radius={0}>
      <Text size="xs" c="povDark2.6" className={classes.hint} tabIndex={0}>
        <Info size={12} aria-hidden="true" />
        {comparisonLabels[comparison]}
      </Text>
    </Tooltip>
  );
}

interface FieldRowProps {
  field: OptionalCardField | null;
  label: string;
  modes: CheckModes | null;
  knowledge: boolean;
  children: ReactNode;
}

function FieldRow({ field, label, modes, knowledge, children }: FieldRowProps) {
  const mode = field && modes ? modes.values[field] : null;
  const gap = field ? workspaceGaps[field] : undefined;

  return (
    <Stack gap={4} className={knowledge ? classes.knowledge : undefined}>
      {children}
      {knowledge && (
        <Text size="xs" c="povDark2.6">
          Заявитель знает и сообщит это в разговоре.
        </Text>
      )}
      {field && modes && mode && (
        <Group gap="sm" align="flex-start">
          <CheckModeControl
            label={label}
            source={modes.source}
            value={mode}
            onChange={(next) => modes.onChange(field, next)}
          />
          {mode === "checked" && <ComparisonNote field={field} />}
          {mode === "checked" && gap && <Hint>{gap}</Hint>}
        </Group>
      )}
    </Stack>
  );
}

interface CardFieldsEditorProps {
  form: FormBinding;
  path: string;
  value: CardFieldsDraft;
  modes: CheckModes | null;
  callerKnowledge: boolean;
}

export function CardFieldsEditor({ form, path, value, modes, callerKnowledge }: CardFieldsEditorProps) {
  const input = (field: keyof CardFieldsDraft) => form.getInputProps(`${path}.${field}`);

  return (
    <Stack gap="md">
      <Stack gap={4} className={callerKnowledge ? classes.knowledge : undefined}>
        <Textarea
          size="xs"
          label="Описание со слов заявителя"
          description={modes ? "Обязательное поле эталона" : undefined}
          autosize
          minRows={2}
          {...input("description")}
        />
        {modes && <ComparisonNote field="description" />}
        {callerKnowledge && (
          <Text size="xs" c="povDark2.6">
            Заявитель знает и сообщит это в разговоре.
          </Text>
        )}
      </Stack>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <FieldRow field="applicant_full_name" label="ФИО заявителя" modes={modes} knowledge={callerKnowledge}>
          <TextInput size="xs" label="ФИО заявителя" {...input("applicantFullName")} />
        </FieldRow>
        <FieldRow field="automatic_phone_number" label="АОН" modes={modes} knowledge={false}>
          <TextInput
            size="xs"
            label="АОН"
            description={callerKnowledge ? "Этот номер обучаемый увидит во входящем вызове" : undefined}
            {...input("automaticPhoneNumber")}
          />
        </FieldRow>
        <FieldRow field="provided_phone_number" label="Предоставленный телефон" modes={modes} knowledge={callerKnowledge}>
          <TextInput size="xs" label="Предоставленный телефон" {...input("providedPhoneNumber")} />
        </FieldRow>
        <FieldRow field="location_phone_number" label="Телефон на месте" modes={modes} knowledge={callerKnowledge}>
          <TextInput size="xs" label="Телефон на месте" {...input("locationPhoneNumber")} />
        </FieldRow>
      </SimpleGrid>

      <FieldRow field="incident_address" label="Адрес происшествия" modes={modes} knowledge={callerKnowledge}>
        <AddressFields form={form} path={`${path}.incidentAddress`} value={value.incidentAddress} legend="Адрес происшествия" />
      </FieldRow>

      <FieldRow field="reported_address" label="Адрес со слов заявителя" modes={modes} knowledge={callerKnowledge}>
        <AddressFields
          form={form}
          path={`${path}.reportedAddress`}
          value={value.reportedAddress}
          legend="Адрес со слов заявителя"
        />
      </FieldRow>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <FieldRow field="victims_count" label="Пострадавших" modes={modes} knowledge={callerKnowledge}>
          <NumberInput size="xs" label="Пострадавших" min={0} allowDecimal={false} allowNegative={false} {...input("victimsCount")} />
        </FieldRow>
        <FieldRow field="questionnaire" label="Опросная карта" modes={modes} knowledge={false}>
          <Stack gap={4}>
            <TextInput size="xs" label="Опросная карта: вопросы" {...input("questions")} />
            <TextInput size="xs" label="Опросная карта: ответы" {...input("answers")} />
          </Stack>
        </FieldRow>
      </SimpleGrid>
    </Stack>
  );
}
