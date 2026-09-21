import { useState } from "react";
import { Alert, Anchor, Stack, Text } from "@mantine/core";
import { Link, useParams } from "react-router-dom";
import { isAttemptRequestError, useAttempt } from "@/entities/attempt";
import { Spinner } from "@/shared/ui";
import { buildCardDiff, groupErrorsByField, indexDiffRows } from "../model/card-diff";
import { buildTimeline } from "../model/timeline";
import type { ReviewView } from "../model/review-view";
import { CardStrip } from "./card-strip";
import { LeftColumn, MiddleColumn } from "./card-body";
import { ReviewBar } from "./review-bar";
import { ReviewPanel } from "./review-panel";
import { ServicesBar } from "./services-bar";
import classes from "./attempt-review.module.scss";

function RequestState({ title, children }: { title: string; children: string }) {
  return (
    <Alert variant="outline" color="povDark2.6" title={title} m="md">
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{children}</Text>
        <Anchor component={Link} to="/teacher/lessons" size="sm" c="povDark2.6" underline="always">
          Вернуться к списку попыток
        </Anchor>
      </Stack>
    </Alert>
  );
}

const TeacherAttemptReviewPage = () => {
  const { attemptId } = useParams();
  const [view, setView] = useState<ReviewView>("comparison");
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);
  const { data: attempt, isPending, error } = useAttempt(attemptId ?? "");

  if (!attemptId) {
    return (
      <RequestState title="Попытка не указана">
        В адресе нет идентификатора попытки. Откройте разбор из списка попыток занятия.
      </RequestState>
    );
  }

  if (isPending) return <Spinner size="large" fullScreen />;

  if (error) {
    const status = isAttemptRequestError(error) ? error.status : 0;

    if (status === 404) {
      return (
        <RequestState title="Попытка не найдена">
          Попытка удалена или идентификатор в адресе неверный.
        </RequestState>
      );
    }

    if (status === 403) {
      return (
        <RequestState title="Нет доступа">
          Эта попытка относится к занятию другого преподавателя.
        </RequestState>
      );
    }

    return (
      <RequestState title="Не удалось загрузить попытку">
        {error instanceof Error ? error.message : "Неизвестная ошибка запроса."}
      </RequestState>
    );
  }

  const blocks = buildCardDiff(attempt);
  const rows = indexDiffRows(blocks);
  const errorsByField = groupErrorsByField(attempt.errors);
  const timeline = buildTimeline(attempt);
  const columnProps = { attempt, rows, errorsByField, view, selectedErrorId, onSelectError: setSelectedErrorId };

  return (
    <div className={classes.screen}>
      <CardStrip attempt={attempt} rows={rows} incidentNumber={attempt.incident_card_number} />
      <ReviewBar
        attempt={attempt}
        timeline={timeline}
        view={view}
        onViewChange={setView}
        selectedErrorId={selectedErrorId}
        onSelectError={setSelectedErrorId}
      />
      <div className={classes.body}>
        <LeftColumn {...columnProps} />
        <MiddleColumn {...columnProps} />
        <ReviewPanel
          attempt={attempt}
          timeline={timeline}
          selectedErrorId={selectedErrorId}
          onSelectError={setSelectedErrorId}
        />
      </div>
      <ServicesBar attempt={attempt} view={view} />
    </div>
  );
};

export default TeacherAttemptReviewPage;
