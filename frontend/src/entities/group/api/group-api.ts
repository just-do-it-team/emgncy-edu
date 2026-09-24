import { api, toGroup, type Group, type GroupDto } from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import { groupMocks } from "./group.mocks";

export async function fetchGroups(teacherId: string, signal?: AbortSignal): Promise<Group[]> {
  if (mocks.groups) return groupMocks.map(toGroup);

  const { data } = await api.get<GroupDto[]>(`${CARD_API_URL}/learning-groups`, {
    params: { teacher_id: teacherId, active_only: true },
    signal,
  });

  return data.map(toGroup);
}
