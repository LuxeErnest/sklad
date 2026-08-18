interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

const defaultRetryOptions: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 100,
  maxDelay: 2000,
  backoffFactor: 2
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const config = { ...defaultRetryOptions, ...options };
  let lastError: Error;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on validation errors or permanent failures
      if (isPermanentError(error)) {
        throw error;
      }

      if (attempt === config.maxAttempts) {
        console.error(`❌ Operation failed after ${config.maxAttempts} attempts:`, error);
        throw error;
      }

      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffFactor, attempt - 1),
        config.maxDelay
      );

      console.warn(`⚠️ Attempt ${attempt} failed, retrying in ${delay}ms:`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

function isPermanentError(error: any): boolean {
  const message = (error?.message || '').toLowerCase();
  if (message.includes('validation failed')) return true;
  if (message.includes('foreign key constraint failed')) return true;
  if (message.includes('no such table')) return true;
  // "database is locked" and "no transaction is active" are transient — do not treat as permanent (allow retry)
  return false;
}

// Specialized retry for database operations
export async function withDatabaseRetry<T>(
  operation: () => Promise<T>
): Promise<T> {
  return withRetry(operation, {
    maxAttempts: 5,
    baseDelay: 200,
    maxDelay: 3000,
    backoffFactor: 2
  });
}


