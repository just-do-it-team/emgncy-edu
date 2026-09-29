export type ServiceResponseStatus =
  | "ADDED"
  | "NOT_NOTIFIED"
  | "RECEIVED"
  | "ACCEPTED"
  | "REJECTED"
  | "RESPONSE_STARTED"
  | "ARRIVED"
  | "WORK_IN_PROGRESS"
  | "WORK_COMPLETED"
  | "WORK_REFUSED";

export const INITIAL_RESPONSE_STATUS: ServiceResponseStatus = "ADDED";

export const responseTransitions: Record<ServiceResponseStatus, ServiceResponseStatus[]> = {
  ADDED: ["NOT_NOTIFIED", "RECEIVED", "ACCEPTED", "REJECTED"],
  NOT_NOTIFIED: ["RECEIVED", "ACCEPTED", "REJECTED"],
  RECEIVED: ["ACCEPTED", "REJECTED"],
  REJECTED: ["ACCEPTED"],
  ACCEPTED: ["RESPONSE_STARTED", "WORK_REFUSED"],
  RESPONSE_STARTED: ["ARRIVED", "WORK_REFUSED"],
  ARRIVED: ["WORK_IN_PROGRESS", "WORK_REFUSED"],
  WORK_IN_PROGRESS: ["WORK_COMPLETED", "WORK_REFUSED"],
  WORK_COMPLETED: [],
  WORK_REFUSED: [],
};

const commentRequired = new Set<ServiceResponseStatus>(["REJECTED", "WORK_REFUSED"]);

export const AMBULANCE_SERVICE_CODE = "103";

const forbiddenForAmbulance = new Set<ServiceResponseStatus>(["REJECTED", "WORK_REFUSED"]);

export const ambulanceStatusHint =
  "Служба 103 не отклоняет вызов и не отказывается от работ: завершите цепочку статусом «Работы завершены» с комментарием, например «бригада не потребовалась».";

export function isStatusAllowedFor(serviceCode: string, status: ServiceResponseStatus): boolean {
  return serviceCode !== AMBULANCE_SERVICE_CODE || !forbiddenForAmbulance.has(status);
}

export function isResponseStatus(value: string): value is ServiceResponseStatus {
  return value in responseTransitions;
}

export function requiresComment(status: ServiceResponseStatus): boolean {
  return commentRequired.has(status);
}

export function lastStatus(chain: ServiceResponseStatus[]): ServiceResponseStatus {
  return chain.at(-1) ?? INITIAL_RESPONSE_STATUS;
}

export function nextStatuses(chain: ServiceResponseStatus[]): ServiceResponseStatus[] {
  return responseTransitions[lastStatus(chain)];
}

export function invalidTransitionIndex(chain: ServiceResponseStatus[]): number | null {
  let current = INITIAL_RESPONSE_STATUS;

  for (const [index, status] of chain.entries()) {
    if (!responseTransitions[current].includes(status)) return index;
    current = status;
  }

  return null;
}
