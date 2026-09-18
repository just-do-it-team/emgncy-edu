import { useState } from "react";
import type { UserRole } from "@/shared/model/auth";
import { demoIncidents, type Incident } from "../model/incidents";
import { IncidentList } from "./incident-list";
import { IncidentViewer } from "./incident-viewer";
import { WorkspaceHeader } from "./workspace-header";
import classes from "./workspace-page.module.scss";

interface WorkspacePageProps {
  role: UserRole;
}

const WorkspacePage = ({ role }: WorkspacePageProps) => {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(
    null,
  );

  return (
    <div className={classes.page}>
      <WorkspaceHeader role={role} />
      <div className={classes.content}>
        {role === "student" && (
          <IncidentList
            incidents={demoIncidents}
            onOpenIncident={setSelectedIncident}
          />
        )}
      </div>
      {role === "student" && (
        <IncidentViewer
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
        />
      )}
    </div>
  );
};

export default WorkspacePage;
