import { useMutation, useQueryClient } from "@tanstack/react-query";
import { assignmentKeys, createGroupAssignment } from "@/entities/assignment";
import { errorDetail, errorStatus } from "@/shared/api";
import {
  assignmentFailureText,
  runRequests,
  type PlannedRequest,
  type ScenarioRoles,
} from "../model/assignment-plan";

interface AssignLessonVariables {
  requests: PlannedRequest[];
  rolesById: Map<string, ScenarioRoles>;
  groupNames: Map<string, string>;
  serviceName: (code: string) => string;
}

export function useAssignLesson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requests, rolesById, groupNames, serviceName }: AssignLessonVariables) =>
      runRequests(
        requests,
        async (request) => {
          const roles = rolesById.get(request.scenarioId);
          const created = await createGroupAssignment({
            group: { id: request.groupId, name: groupNames.get(request.groupId) ?? "" },
            body: request.body,
            scenario: {
              name: roles?.name ?? "",
              revision: roles?.revision ?? 0,
              passingScore: roles?.passingScore ?? 100,
              workspaceMode: roles?.workspaceMode ?? "INDIVIDUAL",
            },
          });

          return created.batchId;
        },
        (failure) => assignmentFailureText(errorStatus(failure), errorDetail(failure), serviceName),
      ),
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: assignmentKeys.lists() }),
  });
}
