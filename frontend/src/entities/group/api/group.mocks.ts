import type { GroupDto } from "@/shared/api";

const teacherId = "00000000-0000-0000-0000-000000000201";

const groupFourId = "2b7e9c41-5a3d-4f86-9e1b-7c4a2d8f6e03";
const groupSevenId = "3c8f0d52-6b4e-4a97-8f2c-8d5b3e9a7f14";

export const groupMocks: GroupDto[] = [
  {
    id: groupFourId,
    name: "УМЦ-112, группа 4",
    description: "Операторы Службы 112, осенний поток",
    teacher_id: teacherId,
    is_active: true,
    created_at: "2026-09-01T09:00:00+03:00",
    updated_at: "2026-09-15T12:40:00+03:00",
    members: [
      {
        student_id: "00000000-0000-0000-0000-000000000203",
        display_name: "Андреева Анна",
        joined_at: "2026-09-01T09:00:00+03:00",
        removed_at: null,
      },
      {
        student_id: "a91c3e57-2d4f-4b68-8a0e-9f1b3d5c7e26",
        display_name: "Громов Илья",
        joined_at: "2026-09-01T09:00:00+03:00",
        removed_at: "2026-09-15T12:40:00+03:00",
      },
      {
        student_id: "00000000-0000-0000-0000-000000000202",
        display_name: "Иванов Валентин",
        joined_at: "2026-09-01T09:00:00+03:00",
        removed_at: null,
      },
      {
        student_id: "b02d4f68-3e5a-4c79-9b1f-0a2c4e6d8f37",
        display_name: "Кузнецова Дарья",
        joined_at: "2026-09-03T10:15:00+03:00",
        removed_at: null,
      },
    ],
  },
  {
    id: groupSevenId,
    name: "УМЦ-112, группа 7",
    description: "Диспетчеры ДДС, повышение квалификации",
    teacher_id: teacherId,
    is_active: true,
    created_at: "2026-09-08T09:00:00+03:00",
    updated_at: "2026-09-08T09:00:00+03:00",
    members: [
      {
        student_id: "c13e5a79-4f6b-4d8a-8c2a-1b3d5f7e9a48",
        display_name: "Белова Ксения",
        joined_at: "2026-09-08T09:00:00+03:00",
        removed_at: null,
      },
      {
        student_id: "d24f6b8a-5a7c-4e9b-9d3b-2c4e6a8f0b59",
        display_name: "Орлов Максим",
        joined_at: "2026-09-08T09:00:00+03:00",
        removed_at: null,
      },
      {
        student_id: "e35a7c9b-6b8d-4fac-8e4c-3d5f7b9a1c6a",
        display_name: "Тимофеев Артём",
        joined_at: "2026-09-08T09:00:00+03:00",
        removed_at: null,
      },
    ],
  },
];
