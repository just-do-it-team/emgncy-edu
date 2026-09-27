import { useScenarioDetails } from "@/entities/scenario";
import { scenarioRolesOf, type ScenarioRoles } from "../model/assignment-plan";

export function useScenarioRoles(scenarioIds: string[]) {
  const queries = useScenarioDetails(scenarioIds);
  const rolesById = new Map<string, ScenarioRoles>(
    queries.flatMap((query) => (query.data ? [[query.data.id, scenarioRolesOf(query.data)]] : [])),
  );

  return {
    rolesById,
    pending: queries.some((query) => query.isPending),
    failed: queries.some((query) => query.isError),
    retry: () => queries.filter((query) => query.isError).forEach((query) => void query.refetch()),
  };
}
