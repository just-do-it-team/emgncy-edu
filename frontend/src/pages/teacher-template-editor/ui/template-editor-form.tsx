import { useState } from "react";
import { Group, Paper, Select, Stack, Switch, Text, TextInput, Textarea, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { Link, useNavigate } from "react-router-dom";
import {
  cardSourceTypeLabels,
  cardSourceTypes,
  difficultyLevel,
  difficultyOptions,
  draftUpdateRequest,
  hasErrors,
  reviewSectionLabels,
  templateCreateBody,
  templateVariantLabels,
  useCreateTemplate,
  useUpdateTemplate,
  validateTemplateDraft,
  type DraftIssue,
  type ReviewSection,
  type TemplateDraft,
} from "@/entities/scenario";
import {
  CardFieldsEditor,
  classificationFor,
  ExpectedEditor,
  recordExists,
  serverFailure,
  TraineePreview,
  useActiveServices,
} from "@/features/expected-result-form";
import type { ScenarioTemplate } from "@/shared/api";
import { errorMessages, focusFormField, useLeaveGuard } from "@/shared/lib";
import { Button, IssuesList, LeaveConfirmModal } from "@/shared/ui";
import { templatePathOf } from "../model/template-loc";
import { serviceWithCode } from "@/shared/config";

export interface TemplateTarget {
  templateKey: string | null;
  version: number;
  previousVersion: number | null;
}

export interface DraftTarget {
  template: ScenarioTemplate;
  sections: ReviewSection[];
  returnPath: string | null;
}

interface TemplateEditorFormProps {
  initial: TemplateDraft;
  target: TemplateTarget;
  draftOf: DraftTarget | null;
  userId: string;
  cancelPath: string;
}

export function TemplateEditorForm({ initial, target, draftOf, userId, cancelPath }: TemplateEditorFormProps) {
  const navigate = useNavigate();
  const services = useActiveServices();
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const [issues, setIssues] = useState<DraftIssue[] | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<TemplateDraft>({ initialValues: initial });
  const guard = useLeaveGuard(form.isDirty() && !saved);
  const draft = form.values;
  const activeServices = services.data ? new Set(services.data.map((service) => service.code)) : null;
  const serviceName = (code: string) => serviceWithCode(code, services.data?.find((service) => service.code === code)?.name ?? null);
  const validationContext = { recordExists, activeServices };
  const liveIssues = issues === null ? null : validateTemplateDraft(draft, validationContext);

  const focus = (path: string) => focusFormField(path === "" ? null : form.getInputNode(path));

  const report = (next: DraftIssue[]) => {
    setIssues(next);
    form.setErrors(errorMessages(next));

    const first = next.find((issue) => issue.severity === "error");

    if (first) requestAnimationFrame(() => focus(first.path));
  };

  const save = () => {
    const found = validateTemplateDraft(draft, validationContext);
    const classification = draft.expected.recordId === null ? null : classificationFor(draft.expected.recordId, draft.expected.flags);

    if (hasErrors(found) || classification === null) {
      report(found);
      return;
    }

    setIssues(found);
    form.clearErrors();

    const body = templateCreateBody(draft, {
      classification,
      userId,
      templateKey: target.templateKey,
      version: target.version,
    });

    if (draftOf !== null) {
      update.mutate(draftUpdateRequest(draftOf.template.id, body, userId, draftOf.sections), {
        onSuccess: (template) => {
          setSaved(true);
          notifications.show({ title: "Черновик сохранён", message: template.name, color: "gray" });
          navigate(draftOf.returnPath ?? `/teacher/scenarios/templates/${template.kind}/${template.id}`);
        },
        onError: (error) => {
          const failure = serverFailure(error, templatePathOf);

          if (failure.kind === "validation") {
            report([...found.filter((issue) => issue.severity === "warning"), ...failure.issues]);
            return;
          }

          notifications.show({ title: "Черновик не сохранён", message: failure.message, color: "red" });
        },
      });
      return;
    }

    create.mutate(
      body,
      {
        onSuccess: (template) => {
          setSaved(true);
          notifications.show({
            title: target.previousVersion === null ? "Шаблон создан" : `Сохранена версия ${template.version}`,
            message: template.name,
            color: "gray",
          });
          navigate(`/teacher/scenarios/templates/${template.kind}/${template.id}`);
        },
        onError: (error) => {
          const failure = serverFailure(error, templatePathOf);

          if (failure.kind === "validation") {
            report([...found.filter((issue) => issue.severity === "warning"), ...failure.issues]);
            return;
          }
          if (failure.kind === "forbidden") {
            setSaved(true);
            notifications.show({ title: "Шаблон не сохранён", message: failure.message, color: "red" });
            navigate(cancelPath);
            return;
          }

          notifications.show({
            title: failure.kind === "conflict" ? "Версия уже существует" : "Шаблон не сохранён",
            message:
              failure.kind === "conflict"
                ? `Версия ${target.version} этого шаблона уже создана. Откройте шаблон заново и создайте следующую версию.`
                : failure.message,
            color: "red",
          });
        },
      },
    );
  };

  const isCall = draft.variant === "call";
  const shownIssues = liveIssues ?? [];

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Stack gap="xs">
          <Title order={2} size="h4" fw={600}>
            {draftOf !== null
              ? `Исправление черновика ИИ «${initial.name}»`
              : target.previousVersion === null
                ? `Новый шаблон: ${templateVariantLabels[draft.variant].toLowerCase()}`
                : `Новая версия шаблона «${initial.name}»`}
          </Title>
          {draftOf !== null && (
            <Text size="sm">
              Черновик правится на месте, новая версия не создаётся.
              {draftOf.sections.length > 0
                ? ` После сохранения секции ${draftOf.sections.map((section) => `«${reviewSectionLabels[section]}»`).join(", ")} будут отмечены как исправленные.`
                : " Решения по секциям не меняются — отметьте их в карточке шаблона."}
            </Text>
          )}
          {draftOf === null && target.previousVersion !== null && (
            <Text size="sm">
              Шаблон не редактируется на месте: сохранится версия {target.version}. Сценарии, которые ссылаются на
              версию {target.previousVersion} и более ранние, сами не переключатся — переключение делается в редакторе
              сценария кнопкой «Перейти на версию {target.version}».
            </Text>
          )}
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={3} size="h5" fw={600}>
            Общее
          </Title>
          <TextInput size="xs" label="Название" withAsterisk {...form.getInputProps("name")} />
          <Textarea size="xs" label="Описание для преподавателей" autosize minRows={2} {...form.getInputProps("description")} />
          <Select
            size="xs"
            w={220}
            label="Сложность"
            data={difficultyOptions}
            value={String(difficultyLevel(draft.difficulty))}
            onChange={(value) => {
              if (value !== null) form.setFieldValue("difficulty", Number(value));
            }}
            allowDeselect={false}
          />
        </Stack>
      </Paper>

      {isCall ? (
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Title order={3} size="h5" fw={600}>
              Звонок
            </Title>
            <Text size="sm" c="povDark2.6">
              Всё, что заполнено в эталоне ниже, станет знаниями виртуального заявителя: он сообщит это обучаемому в
              разговоре. Незаполненное он «не знает». Не пишите в эталон подсказок — модель может их произнести.
            </Text>
            <Textarea
              size="xs"
              label="Первая реплика заявителя"
              description="Затравка диалога для модели. АОН задаётся в эталоне ниже — его обучаемый увидит во входящем вызове."
              withAsterisk
              autosize
              minRows={2}
              {...form.getInputProps("initialUtterance")}
            />
          </Stack>
        </Paper>
      ) : (
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Title order={3} size="h5" fw={600}>
              Исходная карточка
            </Title>
            <Text size="sm" c="povDark2.6">
              {draft.variant === "cardDds"
                ? "Так карточка придёт диспетчеру ДДС. Диспетчер её не заполняет, поэтому обычно она совпадает с эталоном."
                : "Так карточка придёт оператору 112 из СМС, ВИС или другого источника; эталон — какой она должна стать после обработки."}
            </Text>
            <Select
              size="xs"
              w={260}
              label="Источник карточки"
              data={cardSourceTypes.map((type) => ({ value: type, label: cardSourceTypeLabels[type] ?? type }))}
              allowDeselect={false}
              {...form.getInputProps("card.sourceType")}
            />
            <Switch
              size="sm"
              label="Исходная карточка совпадает с эталоном"
              {...form.getInputProps("card.initialSameAsExpected", { type: "checkbox" })}
            />
            {!draft.card.initialSameAsExpected && (
              <CardFieldsEditor form={form} path="card.initial" value={draft.card.initial} modes={null} callerKnowledge={false} />
            )}
          </Stack>
        </Paper>
      )}

      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={3} size="h5" fw={600}>
            Эталон
          </Title>
          <ExpectedEditor
            form={form}
            path="expected"
            value={draft.expected}
            variant={draft.variant}
            source="TEMPLATE"
            services={services.data ?? []}
            errors={errorMessages(shownIssues)}
          />
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={3} size="h5" fw={600}>
            Предпросмотр
          </Title>
          <TraineePreview draft={draft} serviceName={serviceName} />
        </Stack>
      </Paper>

      {liveIssues && <IssuesList issues={liveIssues} blockingTitle="Нельзя сохранить" onFocus={focus} />}

      <Group justify="flex-end" gap="xs">
        <Button size="sm" variant="outline" color="povDark2.6" component={Link} to={cancelPath}>
          Отмена
        </Button>
        <Button size="sm" loading={create.isPending || update.isPending} onClick={save}>
          {draftOf !== null
            ? "Сохранить черновик"
            : target.previousVersion === null
              ? "Сохранить шаблон"
              : `Сохранить версию ${target.version}`}
        </Button>
      </Group>

      <LeaveConfirmModal opened={guard.pendingPath !== null} onStay={guard.stay} onLeave={guard.leave} />
    </Stack>
  );
}
