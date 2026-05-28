import { logger } from '../utils/logger.js';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  label?: string;
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (/timeout|econnreset|enotfound|eai_again|fetch failed|network/.test(msg)) return true;
  // status-code style
  const status = (err as Error & { status?: number; statusCode?: number }).status ??
    (err as Error & { statusCode?: number }).statusCode;
  if (typeof status === 'number' && status >= 500 && status < 600) return true;
  return false;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const max = opts.maxRetries ?? 2;
  const base = opts.baseDelayMs ?? 2000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= max; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === max || !isRetryable(err)) throw err;
      const delay = base * Math.pow(4, attempt); // 2s, 8s
      logger.warn({ err, attempt, delay, label: opts.label }, 'retryable failure, backing off');
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
