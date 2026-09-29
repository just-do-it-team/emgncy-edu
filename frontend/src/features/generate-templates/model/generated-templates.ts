import type { ScenarioTemplate, TemplateGenerationDto } from "@/shared/api";

export function generatedTemplatesOf(generation: TemplateGenerationDto, templates: ScenarioTemplate[]): ScenarioTemplate[] {
  const byId = new Map(templates.map((template) => [template.id, template]));
  const ids = [
    ...(generation.incoming_call_template_id === null ? [] : [generation.incoming_call_template_id]),
    ...generation.card_template_ids,
  ];

  return ids.flatMap((id) => {
    const template = byId.get(id);

    return template ? [template] : [];
  });
}
