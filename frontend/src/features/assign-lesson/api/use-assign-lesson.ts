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
}

export function useAssignLesson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requests, rolesById }: AssignLessonVariables) =>
      runRequests(
        requests,
        async (request) => {
          const roles = rolesById.get(request.scenarioId);
          const created = await createGroupAssignment({
            groupId: request.groupId,
            body: request.body,
            scenario: {
              name: roles?.name ?? "",
              revision: roles?.revision ?? 0,
              workspaceMode: roles?.workspaceMode ?? "INDIVIDUAL",
            },
          });

          return created.batchId;
        },
        (failure) => assignmentFailureText(errorStatus(failure), errorDetail(failure)),
      ),
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: assignmentKeys.lists() }),
  });
}
