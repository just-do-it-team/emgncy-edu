import type { LaunchContext } from "../model/types";

type Workspace = Pick<LaunchContext, "userId" | "workspaceId">;
type Session = Workspace & Pick<LaunchContext, "sessionId">;

export const trainingKeys = {
  all: ["student-api"] as const,
  user: (userId: string) => [...trainingKeys.all, userId] as const,
  workspace: ({ userId, workspaceId }: Workspace) =>
    [...trainingKeys.user(userId), workspaceId] as const,
  launchContext: (userId: string, assignmentId: string, sessionId: string) =>
    [
      ...trainingKeys.user(userId),
      "launch-context",
      assignmentId,
      sessionId,
    ] as const,
  assignments: (userId: string) =>
    [...trainingKeys.user(userId), "assignments"] as const,
  history: (userId: string) =>
    [...trainingKeys.user(userId), "history"] as const,
  historyPage: (userId: string, page: number, pageSize: number) =>
    [...trainingKeys.history(userId), page, pageSize] as const,
  reference: () => [...trainingKeys.all, "reference"] as const,
  referenceMode: (mode: LaunchContext["mode"]) =>
    [...trainingKeys.reference(), mode] as const,
  featureOptions: (level: number, parentId: number) =>
    [...trainingKeys.reference(), "features", level, parentId] as const,
  readiness: ({ sessionId, ...workspace }: Session) =>
    [...trainingKeys.workspace(workspace), "readiness", sessionId] as const,
  cards: (workspace: Workspace) =>
    [...trainingKeys.workspace(workspace), "cards"] as const,
  cardPages: (workspace: Workspace) =>
    [...trainingKeys.cards(workspace), "pages"] as const,
  cardScope: (workspace: Workspace) =>
    [...trainingKeys.workspace(workspace), "card"] as const,
  card: (workspace: Workspace, cardId: string) =>
    [...trainingKeys.cardScope(workspace), cardId] as const,
  cardStatusHistory: (workspace: Workspace, cardId: string, version: number) =>
    [
      ...trainingKeys.workspace(workspace),
      "card-status-history",
      cardId,
      version,
    ] as const,
  serviceHistory: (
    workspace: Workspace,
    serviceId: string,
    status: string,
    addedAt?: string,
  ) =>
    [
      ...trainingKeys.workspace(workspace),
      "service-history",
      serviceId,
      status,
      ...(addedAt === undefined ? [] : [addedAt]),
    ] as const,
  incomingCalls: ({ sessionId, ...workspace }: Session) =>
    [
      ...trainingKeys.workspace(workspace),
      "incoming-calls",
      sessionId,
    ] as const,
  outgoingCall: (workspace: Workspace, cardId: string | null) =>
    [...trainingKeys.workspace(workspace), "outgoing-call", cardId] as const,
  audioScope: (workspace: Workspace) =>
    [...trainingKeys.workspace(workspace), "audio"] as const,
  audioMessages: (workspace: Workspace, cardId: string) =>
    [...trainingKeys.audioScope(workspace), cardId] as const,
  audioContent: (userId: string, messageId: string) =>
    [...trainingKeys.user(userId), "audio-content", messageId] as const,
};
