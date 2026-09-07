export interface RetryProviderOptions {
  maxAttempts?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export async function retryProvider<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryProviderOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new RangeError("Provider maxAttempts must be an integer from 1 to 3");
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || options.shouldRetry?.(error, attempt) === false) {
        throw error;
      }
    }
  }

  throw lastError;
}
