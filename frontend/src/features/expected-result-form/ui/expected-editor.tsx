import { Select, Stack, Text, Title } from "@mantine/core";
import { cardStatusLabel } from "@/entities/expert-review";
import {
  cardStatuses,
  isDispatcherVariant,
  rerouteServices,
  type CheckMode,
  type ExpectedDraft,
  type OptionalCardField,
} from "@/entities/scenario";
import type { ScenarioSourceType, TemplateVariant } from "@/shared/api";
import { checkModeLegend } from "../model/check-mode-legend";
import { autoServices, restoredMainServiceOf } from "../model/classification";
import type { ServiceOption } from "../model/use-active-services";
import { CardFieldsEditor } from "./card-fields-editor";
import { ClassificationField } from "./classification-field";
import classes from "./expected-form.module.scss";
import { OutboundCallFields } from "./outbound-call-fields";
import { ServicesField } from "./services-field";
import { StatusHistoryEditor } from "./status-history-editor";
import type { FormBinding } from "../model/form-binding";

interface ExpectedEditorProps {
  form: FormBinding;
  path: string;
  value: ExpectedDraft;
  variant: TemplateVariant;
  source: ScenarioSourceType;
  services: ServiceOption[];
  errors: Record<string, string>;
}

export function ExpectedEditor({ form, path, value, variant, source, services, errors }: ExpectedEditorProps) {
  const known = services.length > 0 ? new Set(services.map((service) => service.code)) : null;
  const auto = autoServices(value.recordId, value.flags, known);
  const dispatcher = isDispatcherVariant(variant);
  const serviceName = (code: string) => services.find((service) => service.code === code)?.name ?? `служба ${code}`;

  const setServices = (next: string[]) => form.setFieldValue(`${path}.services`, next);

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Title order={4} size="h6" fw={600}>
          Тип происшествия и службы
        </Title>
        <ClassificationField
          recordId={value.recordId}
          flags={value.flags}
          error={errors[`${path}.recordId`] ?? null}
          dataPath={`${path}.recordId`}
          onRecordChange={(recordId) => {
            form.setFieldValue(`${path}.recordId`, recordId);
            setServices(autoServices(recordId, value.flags, known));
          }}
          onFlagsChange={(flags) => {
            form.setFieldValue(`${path}.flags`, flags);
            setServices(rerouteServices(auto, autoServices(value.recordId, flags, known), value.services));
          }}
        />
        <ServicesField
          auto={auto}
          chosen={value.services}
          restoredMain={restoredMainServiceOf(value.recordId, value.flags)}
          options={services}
          error={errors[`${path}.services`] ?? null}
          dataPath={`${path}.services`}
          onChange={setServices}
        />
        <Select
          size="xs"
          w={260}
          label="Статус карточки"
          data={cardStatuses.map((status) => ({ value: status, label: cardStatusLabel(status) }))}
          allowDeselect={false}
          {...form.getInputProps(`${path}.currentStatus`)}
        />
      </Stack>

      <Stack gap="sm" className={classes.section}>
        <Title order={4} size="h6" fw={600}>
          Поля карточки
        </Title>
        <Text size="xs" c="povDark2.6">
          {checkModeLegend[source]}
        </Text>
        <CardFieldsEditor
          form={form}
          path={`${path}.fields`}
          value={value.fields}
          callerKnowledge={variant === "call"}
          modes={{
            source,
            values: value.modes,
            onChange: (field: OptionalCardField, mode: CheckMode) => form.setFieldValue(`${path}.modes.${field}`, mode),
          }}
        />
      </Stack>

      {dispatcher && (
        <Stack gap="sm" className={classes.section}>
          <StatusHistoryEditor
            form={form}
            path={`${path}.history`}
            services={value.services}
            history={value.history}
            serviceName={serviceName}
          />
          <OutboundCallFields form={form} path={`${path}.outbound`} value={value.outbound} />
        </Stack>
      )}
    </Stack>
  );
}
