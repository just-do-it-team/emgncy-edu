import { api } from "@/shared/api";
import { ADMIN_API_URL } from "@/shared/config";

export type AdminRole = "ADMINISTRATOR" | "TEACHER" | "STUDENT";
export type SystemStatus = "healthy" | "degraded" | "unavailable";
export type QueryParams = Record<string, string | number | boolean | undefined>;

export interface Component {
  name: string;
  instance: string;
  status: string;
  last_scrape_at: string | null;
  scrape_duration_seconds: number | null;
  error: string | null;
  optional: boolean;
}

export interface Overview {
  generated_at: string;
  status: SystemStatus;
  components: { healthy: number; total: number; optional_unavailable: number };
  firing_alerts: number;
  errors_24h: number | null;
  host: {
    cpu_percent: number | null;
    memory_percent: number | null;
    disk_percent: number | null;
    network_receive_bytes_per_second: number | null;
    network_transmit_bytes_per_second: number | null;
    uptime_seconds: number | null;
  };
  gpu: {
    available: boolean;
    utilization_percent: number | null;
    memory_used_mib: number | null;
    memory_total_mib: number | null;
    temperature_celsius: number | null;
    power_watts: number | null;
  };
  postgres_up: boolean | null;
  kafka_brokers: number | null;
  kafka_consumer_lag: number | null;
  warnings: string[];
}

export interface SystemEvent {
  timestamp: string;
  service: string;
  level: string;
  message: string;
  labels: Record<string, string>;
}

export interface MetricDefinition {
  key: string;
  title: string;
  description: string;
  category: "host" | "containers" | "gpu" | "postgres" | "kafka" | "services";
  unit: string;
  optional: boolean;
}
export interface MetricSample {
  labels: Record<string, string>;
  value: number;
  timestamp: string;
}
export interface CurrentMetric {
  key: string;
  unit: string;
  samples: MetricSample[];
}
export interface MetricSeries {
  key: string;
  unit: string;
  start: string;
  end: string;
  step_seconds: number;
  series: {
    labels: Record<string, string>;
    points: { timestamp: string; value: number }[];
  }[];
}
export interface MonitoringTarget {
  job: string;
  instance: string;
  health: string;
  last_scrape_at: string | null;
  scrape_duration_seconds: number | null;
  error: string | null;
  optional: boolean;
}
export interface MonitoringAlert {
  name: string;
  state: string;
  severity: string;
  active_at: string | null;
  summary: string | null;
  description: string | null;
  labels: Record<string, string>;
}
export interface Dashboard {
  key: string;
  title: string;
  url: string;
  mode: "embedded" | "external";
}

export interface AdminUser {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  role: AdminRole;
  is_blocked: boolean;
  blocked_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
export interface CreateUser {
  username: string;
  display_name: string;
  email: string | null;
  password: string;
  role: AdminRole;
}

export interface ReportDefinition {
  key: string;
  title: string;
  description: string;
}
export interface UsageReport {
  start: string;
  end: string;
  cards_created: number;
  cards_by_status: Record<string, number>;
  users_total: number;
  users_blocked: number;
}
export interface ErrorReport {
  start: string;
  end: string;
  total: number;
  by_service: Record<string, number>;
}
export interface LoadReport {
  start: string;
  end: string;
  warnings: string[];
  metrics: {
    key: string;
    unit: string;
    current: number | null;
    average: number | null;
    maximum: number | null;
  }[];
}
export interface HealthReport {
  generated_at: string;
  status: SystemStatus;
  firing_alerts: number;
  targets: {
    job: string;
    instance: string;
    health: string;
    optional: boolean;
    error: string | null;
  }[];
}
export interface AuditEvent {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_username: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  result: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  request_id: string | null;
}

export interface Service {
  name: string;
  instance: string;
  status: string;
  last_checked_at: string | null;
  error: string | null;
  actions_enabled: boolean;
  disabled_reason: string;
}
export interface BackupStatus {
  configured: boolean;
  safe_mode: boolean;
  schedule: string | null;
  destination: string | null;
  last_successful_at: string | null;
  actions_enabled: boolean;
  disabled_reason: string;
}
export interface Backup {
  id: string;
  created_at: string;
  size_bytes: number;
  status: string;
}
export interface UpdateStatus {
  state: string;
  last_checked_at: string | null;
  available_count: number | null;
  actions_enabled: boolean;
  disabled_reason: string;
}
export interface PackageUpdate {
  name: string;
  installed_version: string;
  available_version: string;
  security_update: boolean;
}
export interface SecurityOverview {
  status: string;
  controls: {
    key: string;
    title: string;
    status: string;
    description: string;
  }[];
}
export interface PasswordPolicy {
  password_min_length: number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_digit: boolean;
  require_special: boolean;
  updated_at: string;
  updated_by: string | null;
}
export interface IntegrityReport {
  generated_at: string;
  status: SystemStatus;
  checks: { key: string; status: SystemStatus; details: string }[];
}

export async function adminGet<T>(
  path: string,
  params?: QueryParams,
): Promise<T> {
  return (await api.get<T>(`${ADMIN_API_URL}${path}`, { params })).data;
}

export async function adminPost<T>(path: string, body: unknown): Promise<T> {
  return (await api.post<T>(`${ADMIN_API_URL}${path}`, body)).data;
}

export async function adminPatch<T>(path: string, body: unknown): Promise<T> {
  return (await api.patch<T>(`${ADMIN_API_URL}${path}`, body)).data;
}

export async function downloadAudit(params: QueryParams): Promise<void> {
  const response = await api.get<Blob>(
    `${ADMIN_API_URL}/reports/user-actions/export`,
    {
      params,
      responseType: "blob",
    },
  );
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = "user-actions.csv";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
