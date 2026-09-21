import { Group, SegmentedControl, Text } from "@mantine/core";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import type { Attempt } from "@/entities/attempt";
import { attemptModeLabels } from "@/entities/attempt";
import { useSessionStore } from "@/entities/session";
import type { Timeline } from "../model/timeline";
import type { ReviewView } from "../model/review-view";
import { TimelineTrack } from "./timeline-track";
import classes from "./attempt-review.module.scss";

const legend = [
  { label: "критическая", markClass: classes.markCritical },
  { label: "значимая", markClass: classes.markSignificant },
  { label: "незначительная", markClass: classes.markMinor },
];

interface ReviewBarProps {
  attempt: Attempt;
  timeline: Timeline;
  view: ReviewView;
  onViewChange: (view: ReviewView) => void;
  selectedErrorId: string | null;
  onSelectError: (errorId: string) => void;
}

const backTargets = {
  teacher: { path: "/teacher/lessons", label: "К результатам занятия" },
  student: { path: "/student/results", label: "К моим результатам" },
  admin: { path: "/admin", label: "К результатам занятия" },
};

export function ReviewBar({
  attempt,
  timeline,
  view,
  onViewChange,
  selectedErrorId,
  onSelectError,
}: ReviewBarProps) {
  const role = useSessionStore((state) => state.role);
  const back = backTargets[role ?? "teacher"];

  return (
    <div className={classes.reviewBar}>
      <Group justify="space-between" wrap="nowrap" gap="md">
        <Group gap={10} wrap="nowrap">
          <Link className={classes.backButton} to={back.path}>
            <ArrowLeft size={14} aria-hidden="true" />
            {back.label}
          </Link>
          <Text fw={700} size="sm">
            {attempt.student.full_name}
          </Text>
          <Text size="sm" c="var(--pov-label)">
            АРМ {attempt.student.workstation_number} · {attemptModeLabels[attempt.mode]} ·{" "}
            {attempt.scenario.name} · сложность {attempt.scenario.difficulty} · попытка{" "}
            {attempt.attempt_number}
          </Text>
        </Group>

        <Group gap="lg" wrap="nowrap">
          <Group gap={12} wrap="nowrap">
            {legend.map((item) => (
              <Group key={item.label} gap={5} wrap="nowrap">
                <span className={`${classes.severityMark} ${item.markClass}`} aria-hidden="true" />
                <Text size="xs">{item.label}</Text>
              </Group>
            ))}
          </Group>
          <SegmentedControl
            size="xs"
            radius={2}
            value={view}
            onChange={(value) => onViewChange(value as ReviewView)}
            data={[
              { value: "comparison", label: "Сравнение" },
              { value: "submitted", label: "Ответ" },
              { value: "reference", label: "Эталон" },
            ]}
          />
        </Group>
      </Group>

      <Group justify="space-between" gap="xs">
        <Text size="xs" c="var(--pov-label)">
          {attempt.actions.length} действий
        </Text>
        <Text size="xs" c="povRed.9">
          норматив {Math.floor(timeline.normSeconds / 60)}:
          {String(timeline.normSeconds % 60).padStart(2, "0")}
        </Text>
      </Group>

      <TimelineTrack
        timeline={timeline}
        selectedErrorId={selectedErrorId}
        onSelectError={onSelectError}
      />
    </div>
  );
}
