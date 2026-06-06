// *************** IMPORT LiBRARIES ***************
import axios from 'axios';
import { MAX_RETRIES, RETRY_DELAY_MS } from '../config/constants';

/**
 * function sleep(ms: number): Promise<void> {
 * This function creates a promise that resolves after a specified number of milliseconds. It is used to introduce delays between retry attempts in the withRetry function, allowing for a back-off period before making another attempt to execute the provided asynchronous function.
 * @param ms - The number of milliseconds to wait before resolving the promise.
 * @returns A Promise that resolves after the specified delay, allowing the caller to use it with async/await syntax to pause execution for the desired amount of time.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for network/5xx failures.
 * Why retry at all: Tokopedia's GraphQL endpoint occasionally returns 503 or
 * drops connections during traffic spikes. A single transient failure should
 * not abort a 100-product run.
 * 
 * Why NOT retry on 4xx: Client errors (403 expired cookie, 400 bad payload)
 * won't self-heal — retrying them wastes time and burns rate-limit budget.
 * Exception: 429 Too Many Requests is a server-side throttle that resolves
 * after a short wait, so we do retry it.
 * @param fn 
 * @param maxRetries 
 * @param delayMs 
 * @returns 
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delayMs: number = RETRY_DELAY_MS,
): Promise<T> {
  // *************** Initialize lastError to a generic error to ensure it is defined if all attempts fail without throwing (e.g., if fn() never throws but returns an unexpected result). This guarantees that the function will throw a meaningful error after exhausting all retry attempts, even if the provided function does not throw errors in a conventional way.
  let lastError: Error = new Error('Unknown error');

  // *************** Loop up to maxRetries times, attempting to execute the provided asynchronous function fn. If fn() succeeds, its result is returned immediately. If it throws an error, the error is caught and evaluated to determine whether it is a retryable error (e.g., a network error or a 5xx server error) or a non-retryable client error (e.g., a 4xx error other than 429). If the error is non-retryable, it is re-thrown immediately to abort further attempts. If the error is retryable and there are remaining attempts, a warning is logged with the attempt number and error message, and the function waits for the specified delay before retrying. If all attempts are exhausted without success, the last encountered error is thrown to indicate that the operation ultimately failed after multiple retries.
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // *************** Attempt to execute the provided asynchronous function fn and return its result if successful. If fn() throws an error, it will be caught by the catch block below for evaluation and potential retry logic.
      return await fn();
    } catch (error) {
      // *************** Check if the error is an AxiosError to determine if it has a response with a status code. If it does, evaluate the status code to determine if it is a non-retryable client error (4xx other than 429) or a retryable error (network error, 5xx server error, or 429 Too Many Requests). If it is a non-retryable client error, re-throw the error immediately to abort further attempts. If it is a retryable error, store it as the lastError and proceed to check if there are remaining attempts for retrying.
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        // *************** Permanent client error — stop retrying immediately
        if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
          throw error;
        }
      }

      // *************** Transient error — save it and retry if attempts remain
      lastError = error as Error;

      // *************** If this was the last attempt, break the loop to throw the last error. Otherwise, log a warning with the attempt number and error message, and wait for the specified delay before retrying.
      if (attempt < maxRetries) {
        console.warn(
          `  Attempt ${attempt}/${maxRetries} failed: ${lastError.message}. ` +
            `Retrying in ${delayMs}ms...`,
        );

        // *************** Wait for the specified delay before the next retry attempt to allow transient issues to resolve (e.g., server recovery, rate limit reset) without overwhelming the server with immediate retries.
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
}
