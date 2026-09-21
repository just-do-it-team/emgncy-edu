export class AttemptRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AttemptRequestError";
    this.status = status;
  }
}

export function isAttemptRequestError(error: unknown): error is AttemptRequestError {
  return error instanceof AttemptRequestError;
}
