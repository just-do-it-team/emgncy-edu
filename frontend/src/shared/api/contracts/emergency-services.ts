export interface EmergencyServiceDto {
  id: string;
  code: string;
  name: string;
  notification_method: string;
  sort_order: number;
  is_active: boolean;
}

export interface EmergencyService {
  code: string;
  name: string;
}
