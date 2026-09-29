import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Group } from "@/shared/api";
import { addGroupMembers, createGroup, fetchGroups, removeGroupMember, renameGroup, setGroupActive } from "./group-api";
import { groupKeys } from "./group.keys";

const SEMI_REFERENCE_STALE_MS = 5 * 60 * 1000;
const SEMI_REFERENCE_GC_MS = 30 * 60 * 1000;

function groupsQuery(teacherId: string) {
  return {
    queryKey: groupKeys.list(teacherId),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchGroups(teacherId, signal),
    staleTime: SEMI_REFERENCE_STALE_MS,
    gcTime: SEMI_REFERENCE_GC_MS,
    refetchOnMount: false,
    retry: false,
    meta: { showGlobalError: false },
  } as const;
}

function activeOnly(groups: Group[]): Group[] {
  return groups.filter((group) => group.isActive);
}

export function useGroups(teacherId: string) {
  return useQuery({ ...groupsQuery(teacherId), select: activeOnly });
}

export function useTeacherGroups(teacherId: string) {
  return useQuery(groupsQuery(teacherId));
}

function useGroupMutation<T, R>(mutate: (request: T) => Promise<R>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: mutate,
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: groupKeys.lists() }),
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createGroup,
    retry: false,
    onSuccess: (group, request) =>
      queryClient.setQueryData<Group[]>(groupKeys.list(request.teacherId), (current) =>
        current === undefined ? current : [...current, group],
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: groupKeys.lists() }),
  });
}

export function useRenameGroup() {
  return useGroupMutation(renameGroup);
}

export function useSetGroupActive() {
  return useGroupMutation(setGroupActive);
}

export function useAddGroupMembers() {
  return useGroupMutation(addGroupMembers);
}

export function useRemoveGroupMember() {
  return useGroupMutation(removeGroupMember);
}
