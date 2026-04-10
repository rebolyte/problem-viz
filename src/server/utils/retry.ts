export type RetryFn = <T>(fn: () => Promise<T>) => Promise<T>;
export type RetryConfig = { attempts?: number; delayMs?: number };

export function withRetry<T>(fn: () => Promise<T>, config?: RetryConfig): Promise<T>;
export function withRetry(config?: RetryConfig): RetryFn;
export function withRetry<T>(
  fnOrConfig?: (() => Promise<T>) | RetryConfig,
  maybeConfig?: RetryConfig,
): Promise<T> | RetryFn {
  if (typeof fnOrConfig === "function") {
    return execute(fnOrConfig, maybeConfig);
  }
  return <U>(fn: () => Promise<U>) => execute(fn, fnOrConfig);
}

function execute<T>(
  fn: () => Promise<T>,
  { attempts = 3, delayMs = 500 }: RetryConfig = {},
): Promise<T> {
  return fn().catch((error) => {
    if (attempts > 1) {
      return new Promise((r) => setTimeout(r, delayMs)).then(() =>
        execute(fn, { attempts: attempts - 1, delayMs }),
      );
    }
    throw error;
  });
}
