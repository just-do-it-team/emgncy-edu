import { Menu, Text } from "@mantine/core";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { templateVariantHints, templateVariantLabels, templateVariantOrder } from "@/entities/scenario";
import { Button } from "@/shared/ui";

export function CreateTemplateMenu() {
  return (
    <Menu position="bottom-end" radius={0} transitionProps={{ duration: 0 }}>
      <Menu.Target>
        <Button size="sm" variant="outline" color="povDark2.6" rightSection={<ChevronDown size={14} aria-hidden="true" />}>
          Создать шаблон
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {templateVariantOrder.map((variant) => (
          <Menu.Item key={variant} component={Link} to={`/teacher/scenarios/templates/new?variant=${variant}`} maw={360}>
            <Text size="sm">{templateVariantLabels[variant]}</Text>
            <Text size="xs" c="povDark2.6">
              {templateVariantHints[variant]}
            </Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
