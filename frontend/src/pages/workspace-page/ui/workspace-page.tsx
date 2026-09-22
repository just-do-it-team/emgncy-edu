import { STUDENT_API_ENABLED } from "@/entities/training";
import { ConnectedWorkspace } from "./connected-workspace";
import { useState } from "react";
import { Alert, Badge, Button, Group, Modal, Text } from "@mantine/core";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { UserRole } from "@/entities/session";
import {
  demoIncidents,
  type Incident,
  type IncidentService,
} from "@/entities/incident";
import { studentLessons, trainingModeLabels } from "@/entities/lesson";
import { IncidentList } from "./incident-list";
import { IncidentViewer } from "./incident-viewer";
import { OperatorCard } from "./operator-card";
import { WorkspaceHeader } from "@/widgets/workspace-header";
import classes from "./workspace-page.module.scss";
import {
  createOperatorCard,
  getOperatorCards,
  saveOperatorCard,
  storeOperatorCards,
  type OperatorCardEntry,
  type OperatorCardDraft,
} from "../model/operator-cards";

interface WorkspacePageProps {
  role: UserRole;
}

const WorkspacePage = ({ role }: WorkspacePageProps) => {
  const [params] = useSearchParams();
  const lessonId = params.get("lesson");
  if (role === "student" && STUDENT_API_ENABLED) return <ConnectedWorkspace />;
  return (
    <WorkspaceSession
      key={lessonId ?? "practice"}
      role={role}
      lessonId={lessonId}
    />
  );
};

const WorkspaceSession = ({
  role,
  lessonId,
}: WorkspacePageProps & { lessonId: string | null }) => {
  const lesson = studentLessons.find((item) => item.id === lessonId);
  const isOperator = role === "student" && lesson?.mode === "ARM112";
  const [operatorCards, setOperatorCards] = useState(() =>
    getOperatorCards(lessonId ?? "practice"),
  );
  const [openedOperatorCard, setOpenedOperatorCard] =
    useState<OperatorCardEntry | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>(() =>
    structuredClone(demoIncidents),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIncident =
    incidents.find((incident) => incident.id === selectedId) ?? null;

  function saveOperatorDraft(draft: OperatorCardDraft) {
    if (!openedOperatorCard) return;
    const saved = saveOperatorCard(openedOperatorCard, draft);
    const exists = operatorCards.some(
      (card) => card.incident.id === saved.incident.id,
    );
    const next = exists
      ? operatorCards.map((card) =>
          card.incident.id === saved.incident.id ? saved : card,
        )
      : [saved, ...operatorCards];
    storeOperatorCards(lessonId ?? "practice", next);
    setOperatorCards(next);
    setOpenedOperatorCard(saved);
  }

  function updateService(service: IncidentService) {
    setIncidents((items) =>
      items.map((incident) =>
        incident.id !== selectedId || !incident.details
          ? incident
          : {
              ...incident,
              serviceStatus: service.status,
              details: {
                ...incident.details,
                services: incident.details.services.map((item) =>
                  item.name === service.name ? service : item,
                ),
              },
            },
      ),
    );
  }

  if (lessonId && !lesson)
    return (
      <Alert m="md" title="Занятие не найдено">
        <Button component={Link} to="/student" variant="subtle">
          Вернуться к занятиям
        </Button>
      </Alert>
    );

  return (
    <div className={classes.page}>
      {role === "student" && (
        <Group justify="space-between" className={classes.trainingBar}>
          <Group gap="md">
            <Button
              component={Link}
              to="/student"
              variant="subtle"
              color="povDark2"
              size="xs"
              leftSection={<ArrowLeft size={16} />}
            >
              К занятиям
            </Button>
            <Text size="sm" fw={600}>
              {lesson?.name ?? "Самостоятельная отработка"}
            </Text>
          </Group>
          <Group gap="sm">
            <Badge variant="light">
              {trainingModeLabels[lesson?.mode ?? "DDS"]}
            </Badge>
            <Text size="xs" c="dimmed">
              Учебный режим
            </Text>
          </Group>
        </Group>
      )}
      <WorkspaceHeader
        role={role}
        operatorMode={isOperator}
        onCreateCard={() => setOpenedOperatorCard(createOperatorCard())}
      />
      <div className={classes.content}>
        {role === "student" && (
          <IncidentList
            incidents={
              isOperator
                ? operatorCards.map((card) => card.incident)
                : incidents
            }
            operatorMode={isOperator}
            onOpenIncident={(incident) => {
              if (isOperator)
                setOpenedOperatorCard(
                  operatorCards.find(
                    (card) => card.incident.id === incident.id,
                  ) ?? null,
                );
              else setSelectedId(incident.id);
            }}
          />
        )}
      </div>
      {isOperator ? (
        <Modal
          opened={openedOperatorCard !== null}
          onClose={() => setOpenedOperatorCard(null)}
          fullScreen
          padding={0}
          withCloseButton={false}
          transitionProps={{ duration: 0 }}
          aria-label="Карточка оператора 112"
        >
          {openedOperatorCard && (
            <OperatorCard
              key={openedOperatorCard.incident.id}
              entry={openedOperatorCard}
              isNew={
                !operatorCards.some(
                  (card) => card.incident.id === openedOperatorCard.incident.id,
                )
              }
              onSave={saveOperatorDraft}
              onClose={() => setOpenedOperatorCard(null)}
            />
          )}
        </Modal>
      ) : (
        role === "student" && (
          <IncidentViewer
            incident={selectedIncident}
            onClose={() => setSelectedId(null)}
            onServiceChange={updateService}
          />
        )
      )}
    </div>
  );
};

export default WorkspacePage;
