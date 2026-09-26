export interface StudentGroupSummaryDto {
  id: string;
  name: string;
}

export interface TeacherStudentDto {
  id: string;
  username: string;
  display_name: string;
  is_blocked: boolean;
  groups: StudentGroupSummaryDto[];
}

export interface TeacherStudentPageDto {
  items: TeacherStudentDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface TeacherStudent {
  id: string;
  displayName: string;
  username: string;
  isBlocked: boolean;
  groupNames: string[];
}

export function toTeacherStudent(dto: TeacherStudentDto): TeacherStudent {
  return {
    id: dto.id,
    displayName: dto.display_name,
    username: dto.username,
    isBlocked: dto.is_blocked,
    groupNames: dto.groups.map((group) => group.name),
  };
}
