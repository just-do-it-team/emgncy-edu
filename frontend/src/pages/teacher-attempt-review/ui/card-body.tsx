import { Group, Stack, Text } from "@mantine/core";
import { MapPin } from "lucide-react";
import type {
  Attempt,
  AttemptError,
  QuestionnaireGroup,
  SelectedFeature,
} from "@/entities/attempt";
import type { DiffRow } from "../model/card-diff";
import { fieldState, type ReviewView } from "../model/review-view";
import { CardField } from "./card-field";
import classes from "./attempt-review.module.scss";

const addressRows: { columns: string; fields: string[] }[] = [
  { columns: "1fr 1fr 1fr", fields: ["address.country", "address.subject", "address.settlement"] },
  { columns: "1fr 1fr 1fr", fields: ["address.object", "address.okrug", "address.district"] },
  { columns: "2fr 1fr 1fr", fields: ["address.street", "address.house", "address.building"] },
  {
    columns: "1fr 1fr 1fr 1fr 1fr",
    fields: [
      "address.structure",
      "address.apartment",
      "address.entrance",
      "address.floor",
      "address.intercom_code",
    ],
  },
];

const stateButtons = [
  { label: "Нет на месте/\nОтказ от скорой", accent: false },
  { label: "Нет доступа/\nЗаблокированные", accent: false },
  { label: "нет контакта", accent: true },
  { label: "срыв звонка", accent: true },
];

interface ColumnProps {
  attempt: Attempt;
  rows: Map<string, DiffRow>;
  errorsByField: Map<string, AttemptError[]>;
  view: ReviewView;
  selectedErrorId: string | null;
  onSelectError: (errorId: string) => void;
}

function Field({
  field,
  rows,
  errorsByField,
  view,
  selectedErrorId,
  onSelectError,
  large,
}: ColumnProps & { field: string; large?: boolean }) {
  const state = fieldState(field, rows, errorsByField);

  if (!state) return null;

  return (
    <CardField
      label={state.row.label}
      value={state.row.submitted}
      reference={state.row.reference}
      spans={state.row.spans}
      changed={state.row.changed}
      severity={state.severity}
      view={view}
      large={large}
      selected={state.errorId !== null && state.errorId === selectedErrorId}
      onSelect={state.errorId ? () => onSelectError(state.errorId as string) : undefined}
    />
  );
}

export function LeftColumn(props: ColumnProps) {
  const { attempt, rows, view } = props;
  const description = rows.get("description");
  const descriptionShown = view === "reference" ? description?.reference : description?.submitted;

  return (
    <div className={classes.leftColumn}>
      <Group align="flex-start" gap={12} grow>
        <Field {...props} field="applicant.full_name" />
        <Field {...props} field="applicant.status" />
      </Group>

      <div className={classes.addressHeader}>
        <MapPin size={16} aria-hidden="true" />
        <Text size="sm">Адрес:</Text>
      </div>

      <Field {...props} field="address.full" large />

      {addressRows.map((addressRow) => (
        <div
          key={addressRow.fields.join()}
          className={classes.addressGrid}
          style={{ gridTemplateColumns: addressRow.columns }}
        >
          {addressRow.fields.map((field) => (
            <Field key={field} {...props} field={field} />
          ))}
        </div>
      ))}

      <Field {...props} field="address.descriptive" />

      <Text size="xs" c="var(--pov-label)" mt={10}>
        Описание со слов заявителя
      </Text>
      <div
        className={`${classes.descriptionBox} ${
          view === "comparison" && description?.changed ? classes.fieldSignificant : ""
        }`}
      >
        <Text size="sm">{descriptionShown}</Text>
      </div>
      {view === "comparison" && description?.changed && (
        <div className={`${classes.referenceLine} ${classes.referenceSignificant}`}>
          эталон: {description.reference}
        </div>
      )}
      {attempt.mode === "DDS" && <Field {...props} field="response_statuses" />}
    </div>
  );
}

function QuestionnaireChips({
  group,
  submitted,
  reference,
  view,
}: {
  group: QuestionnaireGroup;
  submitted: SelectedFeature[];
  reference: SelectedFeature[];
  view: ReviewView;
}) {
  const shown = view === "reference" ? reference : submitted;
  const shownIds = new Set(shown.map((feature) => feature.feature_id));
  const referenceIds = new Set(reference.map((feature) => feature.feature_id));

  return (
    <Group gap={6}>
      {group.options.map((option) => {
        const selected = shownIds.has(option.feature_id);
        const missing =
          view === "comparison" && !selected && referenceIds.has(option.feature_id);

        return (
          <span
            key={option.feature_id}
            className={[
              classes.chip,
              selected ? classes.chipSelected : "",
              missing ? classes.chipMissing : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {option.name}
          </span>
        );
      })}
    </Group>
  );
}

export function MiddleColumn(props: ColumnProps) {
  const { attempt, rows, view } = props;
  const card = view === "reference" ? attempt.reference_card : attempt.submitted_card;
  const reference = attempt.reference_card;
  const eventType = rows.get("event_type");
  const victimsRow = rows.get("victims_count");
  const victims =
    victimsRow === undefined
      ? null
      : (view === "reference" ? victimsRow.reference : victimsRow.submitted).replace("0", "нет");

  return (
    <div className={classes.middleColumn}>
      <Group gap={8} align="stretch">
        <span className={classes.stateButton}>
          <span style={{ display: "block" }}>Пострадавшие</span>
          <span style={{ display: "block" }}>{victims ?? "не указано"}</span>
        </span>
        {stateButtons.map((button) => (
          <span
            key={button.label}
            className={`${classes.stateButton} ${button.accent ? classes.stateButtonAccent : ""}`}
          >
            {button.label.split("\n").map((line) => (
              <span key={line} style={{ display: "block" }}>
                {line}
              </span>
            ))}
          </span>
        ))}
      </Group>

      <Stack gap={4}>
        <Text size="xs" c="var(--pov-label)">
          Введите тип происшествия
        </Text>
        <span className={classes.whatHappened}>ЧТО СЛУЧИЛОСЬ?</span>
      </Stack>

      <Group gap={6}>
        <span className={`${classes.chip} ${classes.chipSelected}`}>
          {view === "reference" ? reference.event_type?.name : eventType?.submitted}
        </span>
      </Group>

      <div className={classes.questionnaire}>
        {attempt.questionnaire.map((group) => (
          <div key={group.group} className={classes.questionRow}>
            <span className={classes.questionLabel}>{group.group}</span>
            <QuestionnaireChips
              group={group}
              submitted={card.features}
              reference={reference.features}
              view={view}
            />
          </div>
        ))}
      </div>

      <Field {...props} field="final_incident_type" />
    </div>
  );
}
