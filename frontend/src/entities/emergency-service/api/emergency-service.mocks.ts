import type { EmergencyServiceDto } from "@/shared/api";

export const emergencyServicesMock: EmergencyServiceDto[] = [
  {
    id: "3f8a1c5e-7b2d-4a96-8e0f-5c7a9e1b3d4f",
    code: "101",
    name: "Пожарная охрана",
    notification_method: "INTEGRATION",
    sort_order: 1,
    is_active: true,
  },
  {
    id: "4a9b2d6f-8c3e-4ba7-9f1a-6d8b0f2c4e5a",
    code: "103",
    name: "Скорая медицинская помощь",
    notification_method: "INTEGRATION",
    sort_order: 3,
    is_active: true,
  },
];
