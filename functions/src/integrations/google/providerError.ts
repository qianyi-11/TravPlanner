export class GoogleProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GoogleProviderError";
  }
}

export function isRetryableGoogleProviderError(error: unknown): boolean {
  return error instanceof GoogleProviderError && error.retryable;
}
