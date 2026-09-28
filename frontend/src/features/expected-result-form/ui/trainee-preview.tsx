import { Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import {
  cardSourceTypeLabels,
  fieldValue,
  formatAddress,
  optionalCardFields,
  type CardFieldsDraft,
  type TemplateDraft,
} from "@/entities/scenario";
import { classifierRecord } from "../model/classification";
import classes from "./expected-form.module.scss";

const fieldLabels: Record<string, string> = {
  questionnaire: "Опросная карта",
  applicant_full_name: "ФИО заявителя",
  automatic_phone_number: "АОН",
  provided_phone_number: "Предоставленный телефон",
  location_phone_number: "Телефон на месте",
  reported_address: "Адрес со слов заявителя",
  incident_address: "Адрес происшествия",
  victims_count: "Пострадавших",
};

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0}>
      <Text size="xs" className={classes.previewLabel}>
        {label}
      </Text>
      <Text size="sm">{value === "" ? "—" : value}</Text>
    </Stack>
  );
}

function CardPreview({ fields, typeName, services, serviceName, sourceLabel }: {
  fields: CardFieldsDraft;
  typeName: string;
  services: string[];
  serviceName: (code: string) => string;
  sourceLabel: string;
}) {
  const [main, ...others] = services;

  return (
    <Paper radius={0} className={classes.preview}>
      <div className={classes.previewBar}>Карточка происшествия, источник: {sourceLabel}</div>
      <Stack gap="xs" className={classes.previewBody}>
        <PreviewRow label="Тип происшествия" value={typeName} />
        <PreviewRow label="Адрес" value={formatAddress(fields.incidentAddress)} />
        <PreviewRow label="Описание" value={fields.description.trim()} />
        <PreviewRow label="Заявитель" value={fields.applicantFullName.trim()} />
        <PreviewRow label="АОН" value={fields.automaticPhoneNumber.trim()} />
        <Stack gap={0}>
          <Text size="xs" className={classes.previewLabel}>
            Службы
          </Text>
          <Text size="sm">
            {main ? <span className={classes.previewMain}>{serviceName(main)}</span> : "—"}
            {others.length > 0 ? `, ${others.map(serviceName).join(", ")}` : ""}
          </Text>
        </Stack>
      </Stack>
    </Paper>
  );
}

interface TraineePreviewProps {
  draft: TemplateDraft;
  serviceName: (code: string) => string;
}

export function TraineePreview({ draft, serviceName }: TraineePreviewProps) {
  const { expected } = draft;
  const record = classifierRecord(expected.recordId);
  const typeName = record?.name ?? "";
  const checked = optionalCardFields.filter((field) => expected.modes[field] === "checked");

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Как увидит обучаемый
        </Text>
        {draft.variant === "call" ? (
          <Paper radius={0} className={classes.preview}>
            <div className={classes.previewBar}>Входящий вызов, АОН {expected.fields.automaticPhoneNumber.trim() || "не определён"}</div>
            <Stack gap="xs" className={classes.previewBody}>
              <PreviewRow label="Первая реплика заявителя" value={draft.initialUtterance.trim()} />
              <Text size="xs" className={classes.previewLabel}>
                Остальное заявитель расскажет в разговоре — из эталона.
              </Text>
            </Stack>
          </Paper>
        ) : (
          <CardPreview
            fields={draft.card.initialSameAsExpected ? expected.fields : draft.card.initial}
            typeName={typeName}
            services={expected.services}
            serviceName={serviceName}
            sourceLabel={cardSourceTypeLabels[draft.card.sourceType] ?? draft.card.sourceType}
          />
        )}
      </Stack>
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Что проверит сервер
        </Text>
        <Paper withBorder p="md">
          <Stack gap="xs">
            <PreviewRow label="Тип происшествия" value={typeName} />
            <PreviewRow label="Службы" value={expected.services.map(serviceName).join(", ")} />
            <PreviewRow label="Описание (не оценивается)" value={expected.fields.description.trim()} />
            {checked.map((field) => {
              const value = fieldValue(expected.fields, field);

              return (
                <PreviewRow
                  key={field}
                  label={fieldLabels[field] ?? field}
                  value={value === null ? "" : typeof value === "object" ? "заполнена" : String(value)}
                />
              );
            })}
          </Stack>
        </Paper>
      </Stack>
    </SimpleGrid>
  );
}
