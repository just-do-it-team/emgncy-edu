export class RequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

export function isRequestError(error: unknown): error is RequestError {
  return error instanceof RequestError;
}
