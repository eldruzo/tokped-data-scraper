import axios from 'axios';
import { MAX_RETRIES, RETRY_DELAY_MS } from '../config/constants';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry wrapper for network/5xx failures.
//
// Why retry at all: Tokopedia's GraphQL endpoint occasionally returns 503 or
// drops connections during traffic spikes. A single transient failure should
// not abort a 100-product run.
//
// Why NOT retry on 4xx: Client errors (403 expired cookie, 400 bad payload)
// won't self-heal — retrying them wastes time and burns rate-limit budget.
// Exception: 429 Too Many Requests is a server-side throttle that resolves
// after a short wait, so we do retry it.
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delayMs: number = RETRY_DELAY_MS,
): Promise<T> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        // Permanent client error — stop retrying immediately
        if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
          throw error;
        }
      }
      lastError = error as Error;
      if (attempt < maxRetries) {
        console.warn(
          `  Attempt ${attempt}/${maxRetries} failed: ${lastError.message}. ` +
            `Retrying in ${delayMs}ms...`,
        );
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
}
