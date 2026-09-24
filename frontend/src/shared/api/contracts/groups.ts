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
  students: GroupStudent[];
}

export function toGroup(dto: GroupDto): Group {
  return {
    id: dto.id,
    name: dto.name,
    students: dto.members
      .filter((member) => member.removed_at === null)
      .map((member) => ({ id: member.student_id, displayName: member.display_name })),
  };
}
