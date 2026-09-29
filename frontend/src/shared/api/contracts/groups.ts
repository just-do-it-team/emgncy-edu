export interface GroupMemberDto {
  student_id: string;
  display_name: string;
  joined_at: string;
  removed_at: string | null;
}

export interface GroupDto {
  id: string;
  name: string;
  description: string | null;
  teacher_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  members: GroupMemberDto[];
}

export interface GroupStudent {
  id: string;
  displayName: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  students: GroupStudent[];
}

export interface GroupCreateDto {
  name: string;
  description: string | null;
  teacher_id: string;
  student_ids: string[];
}

export interface GroupRenameDto {
  actor_id: string;
  name: string;
  description: string | null;
}

export interface GroupActivityDto {
  actor_id: string;
  is_active: boolean;
}

export interface GroupMembersDto {
  actor_id: string;
  student_ids: string[];
}

export function toGroup(dto: GroupDto): Group {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    isActive: dto.is_active,
    students: dto.members
      .filter((member) => member.removed_at === null)
      .map((member) => ({ id: member.student_id, displayName: member.display_name })),
  };
}
