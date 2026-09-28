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
    id: "5b0c3e7a-9d4f-4cb8-8a2e-7e9c1f3d5a6b",
    code: "102",
    name: "Полиция",
    notification_method: "INTEGRATION",
    sort_order: 2,
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
  {
    id: "6c1d4f8b-0e5a-4dc9-9b3f-8f0d2a4e6b7c",
    code: "104",
    name: "Аварийная газовая служба",
    notification_method: "INTEGRATION",
    sort_order: 4,
    is_active: true,
  },
  {
    id: "7d2e5a9c-1f6b-4ed0-8c4a-9a1e3b5f7c8d",
    code: "ZEMP",
    name: "ЦЭМП",
    notification_method: "PHONE",
    sort_order: 5,
    is_active: true,
  },
];
