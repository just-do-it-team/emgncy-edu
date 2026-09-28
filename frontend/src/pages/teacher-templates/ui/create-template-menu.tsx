import { Menu } from "@mantine/core";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { templateVariantLabels } from "@/entities/scenario";
import type { TemplateVariant } from "@/shared/api";
import { Button } from "@/shared/ui";

const variants: TemplateVariant[] = ["call", "card112", "cardDds"];

export function CreateTemplateMenu() {
  return (
    <Menu position="bottom-end" radius={0} transitionProps={{ duration: 0 }}>
      <Menu.Target>
        <Button size="sm" rightSection={<ChevronDown size={14} aria-hidden="true" />}>
          Создать шаблон
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {variants.map((variant) => (
          <Menu.Item key={variant} component={Link} to={`/teacher/scenarios/templates/new?variant=${variant}`}>
            {templateVariantLabels[variant]}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
