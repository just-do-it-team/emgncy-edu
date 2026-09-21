import { Group, Text } from "@mantine/core";
import type { Attempt } from "@/entities/attempt";

const pluralRules = new Intl.PluralRules("ru-RU");

const serviceForms: Record<string, string> = {
  one: "служба",
  few: "службы",
  many: "служб",
  other: "службы",
};
import type { ReviewView } from "../model/review-view";
import classes from "./attempt-review.module.scss";

export function ServicesBar({ attempt, view }: { attempt: Attempt; view: ReviewView }) {
  const card = view === "reference" ? attempt.reference_card : attempt.submitted_card;
  const reference = attempt.reference_card;
  const matches =
    card.services.length === reference.services.length &&
    card.services.every((service) =>
      reference.services.some((item) => item.service_id === service.service_id),
    );

  return (
    <div className={classes.servicesBar}>
      <Text size="sm" c="white">
        Службы:
      </Text>
      <Group gap={8}>
        {card.services.map((service) => (
          <span
            key={service.service_id}
            className={`${classes.serviceChip} ${service.is_main ? classes.serviceChipMain : ""}`}
          >
            {service.name}
          </span>
        ))}
      </Group>
      <span className={classes.servicesSummary}>
        {card.services.length} {serviceForms[pluralRules.select(card.services.length)]} · {matches ? "совпадает с эталоном" : "расходится с эталоном"}{" "}
        · главная подчёркнута
      </span>
    </div>
  );
}
