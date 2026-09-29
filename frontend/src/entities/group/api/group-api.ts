import {
  api,
  errorStatus,
  RequestError,
  toGroup,
  type Group,
  type GroupActivityDto,
  type GroupCreateDto,
  type GroupDto,
  type GroupMembersDto,
  type GroupRenameDto,
  type GroupStudent,
} from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import { groupMocks } from "./group.mocks";

const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVER_ERROR = 500;

export async function fetchGroups(teacherId: string, signal?: AbortSignal): Promise<Group[]> {
  if (mocks.groups) return groupMocks.map(toGroup);

  const { data } = await api.get<GroupDto[]>(`${CARD_API_URL}/learning-groups`, {
    params: { teacher_id: teacherId, active_only: false },
    signal,
  });

  return data.map(toGroup);
}

function mockGroup(groupId: string): GroupDto {
  const found = groupMocks.find((group) => group.id === groupId);

  if (!found) throw new RequestError(NOT_FOUND, "Learning group not found");

  return found;
}

function assertUniqueMockName(teacherId: string, name: string, groupId: string | null) {
  if (groupMocks.some((group) => group.teacher_id === teacherId && group.name === name && group.id !== groupId)) {
    throw new RequestError(CONFLICT, "A learning group with this name already exists");
  }
}

function memberOf(student: GroupStudent) {
  return { student_id: student.id, display_name: student.displayName, joined_at: new Date().toISOString(), removed_at: null };
}

export interface GroupCreateRequest {
  teacherId: string;
  name: string;
  description: string | null;
  students: GroupStudent[];
}

export async function createGroup({ teacherId, name, description, students }: GroupCreateRequest): Promise<Group> {
  if (mocks.groups) {
    assertUniqueMockName(teacherId, name, null);

    const now = new Date().toISOString();
    const created: GroupDto = {
      id: crypto.randomUUID(),
      name,
      description,
      teacher_id: teacherId,
      is_active: true,
      created_at: now,
      updated_at: now,
      members: students.map(memberOf),
    };

    groupMocks.push(created);
    return toGroup(created);
  }

  const body: GroupCreateDto = {
    name,
    description,
    teacher_id: teacherId,
    student_ids: students.map((student) => student.id),
  };
  const { data } = await api.post<GroupDto>(`${CARD_API_URL}/learning-groups`, body);

  return toGroup(data);
}

type GroupPatch = GroupRenameDto | GroupActivityDto;

function isApplied(group: GroupDto, body: GroupPatch): boolean {
  return "is_active" in body
    ? group.is_active === body.is_active
    : group.name === body.name.trim() && group.description === body.description;
}

/**
 * PATCH группы. Сервер применяет правку, но может ответить 500: ответ собирается уже после
 * коммита и падает на чтении обновлённой отметки времени. Поэтому при 5xx группа перечитывается,
 * и правка считается применённой, если поля на сервере совпадают с отправленными.
 */
async function patchGroup(groupId: string, body: GroupPatch): Promise<void> {
  const url = `${CARD_API_URL}/learning-groups/${groupId}`;

  try {
    await api.patch(url, body);
  } catch (error) {
    if ((errorStatus(error) ?? 0) < SERVER_ERROR) throw error;

    const { data } = await api.get<GroupDto>(url);

    if (!isApplied(data, body)) throw error;
  }
}

export interface GroupRenameRequest {
  groupId: string;
  actorId: string;
  name: string;
  description: string | null;
}

export async function renameGroup({ groupId, actorId, name, description }: GroupRenameRequest): Promise<void> {
  if (mocks.groups) {
    const group = mockGroup(groupId);

    assertUniqueMockName(group.teacher_id, name, groupId);
    Object.assign(group, { name, description, updated_at: new Date().toISOString() });
    return;
  }

  await patchGroup(groupId, { actor_id: actorId, name, description });
}

export interface GroupActivityRequest {
  groupId: string;
  actorId: string;
  active: boolean;
}

export async function setGroupActive({ groupId, actorId, active }: GroupActivityRequest): Promise<void> {
  if (mocks.groups) {
    Object.assign(mockGroup(groupId), { is_active: active, updated_at: new Date().toISOString() });
    return;
  }

  await patchGroup(groupId, { actor_id: actorId, is_active: active });
}

export interface GroupMembersRequest {
  groupId: string;
  actorId: string;
  students: GroupStudent[];
}

export async function addGroupMembers({ groupId, actorId, students }: GroupMembersRequest): Promise<void> {
  if (mocks.groups) {
    const group = mockGroup(groupId);

    if (!group.is_active) throw new RequestError(CONFLICT, "Learning group is archived");

    const added = new Set(students.map((student) => student.id));

    group.members = [...group.members.filter((member) => !added.has(member.student_id)), ...students.map(memberOf)];
    return;
  }

  const body: GroupMembersDto = { actor_id: actorId, student_ids: students.map((student) => student.id) };

  await api.post(`${CARD_API_URL}/learning-groups/${groupId}/members`, body);
}

export interface GroupMemberRemoveRequest {
  groupId: string;
  actorId: string;
  studentId: string;
}

export async function removeGroupMember({ groupId, actorId, studentId }: GroupMemberRemoveRequest): Promise<void> {
  if (mocks.groups) {
    const group = mockGroup(groupId);

    group.members = group.members.map((member) =>
      member.student_id === studentId && member.removed_at === null
        ? { ...member, removed_at: new Date().toISOString() }
        : member,
    );
    return;
  }

  await api.delete(`${CARD_API_URL}/learning-groups/${groupId}/members/${studentId}`, {
    params: { actor_id: actorId },
  });
}
