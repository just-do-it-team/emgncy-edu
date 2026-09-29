import { useCallback, useState } from "react";
import { Anchor, Skeleton, Stack, Text, Title } from "@mantine/core";
import { Link, useSearchParams } from "react-router-dom";
import { useTemplates } from "@/entities/scenario";
import { useSessionStore } from "@/entities/session";
import { GeneratedTemplates, GenerateTemplatesForm, generatedTemplatesOf } from "@/features/generate-templates";
import type { TemplateGenerationDto } from "@/shared/api";

function GenerationResult({ generation }: { generation: TemplateGenerationDto }) {
  const templates = useTemplates();

  if (templates.isPending) return <Skeleton height={160} radius={2} />;

  const generated = generatedTemplatesOf(generation, templates.data ?? []);

  return (
    <Stack gap="sm">
      <Title order={3} size="h5" fw={600}>
        Черновики генерации
      </Title>
      <Text size="sm">
        Откройте каждый шаблон, проверьте секции эталона и опубликуйте. Звонок 112 и карточки ДДС из одной генерации
        связаны: их общие поля должны совпадать.
      </Text>
      {generated.length === 0 ? (
        <Text size="sm" c="povDark2.6">
          Сервер сообщил о завершении, но шаблоны ещё не пришли в список. Обновите страницу раздела «Шаблоны».
        </Text>
      ) : (
        <GeneratedTemplates templates={generated} />
      )}
    </Stack>
  );
}

const TeacherTemplateGenerationPage = () => {
  const userId = useSessionStore((state) => state.profile?.userId ?? null);
  const [searchParams] = useSearchParams();
  const [generation, setGeneration] = useState<TemplateGenerationDto | null>(null);
  const complete = useCallback((completed: TemplateGenerationDto) => setGeneration(completed), []);

  if (userId === null) return null;

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Title order={2} size="h4" fw={600}>
          Шаблоны с ИИ
        </Title>
        <Anchor component={Link} to="/teacher/scenarios/templates" size="sm" c="povDark2.6" underline="always">
          К списку шаблонов
        </Anchor>
      </Stack>
      <GenerateTemplatesForm userId={userId} initialService={searchParams.get("service")} onCompleted={complete} />
      {generation && <GenerationResult generation={generation} />}
    </Stack>
  );
};

export default TeacherTemplateGenerationPage;
