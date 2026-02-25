/**
 * Shared retry utility with exponential backoff and jitter.
 *
 * Provides a generic `withRetry()` function and `calculateBackoffDelay()` helper
 * used by database connections, AWS Parameter Store, worker polling, and Vercel API calls.
 */

import { getLog } from "./Logger";

const log = getLog(import.meta);

/**
 * Options for configuring retry behavior.
 */
export interface RetryOptions {
	/** Maximum number of retry attempts (default: 3) */
	maxRetries?: number;
	/** Base delay in milliseconds for exponential backoff (default: 1000) */
	baseDelayMs?: number;
	/** Maximum delay in milliseconds (default: 30000) */
	maxDelayMs?: number;
	/** Whether to add jitter to the delay (default: true) */
	jitter?: boolean;
	/**
	 * Predicate to determine if an error is retryable.
	 * Returns true if the operation should be retried for this error.
	 * If not provided, all errors are considered retryable.
	 */
	isRetryable?: (error: unknown) => boolean;
	/** Label for log messages (e.g., "DB connect", "Parameter Store") */
	label?: string;
}

/**
 * Calculates the backoff delay for a given attempt number using exponential backoff.
 *
 * @param attemptNumber - The attempt number (1-based)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay cap in milliseconds
 * @returns The delay in milliseconds (without jitter)
 */
export function calculateBackoffDelay(attemptNumber: number, baseDelayMs: number, maxDelayMs: number): number {
	return Math.min(baseDelayMs * 2 ** (attemptNumber - 1), maxDelayMs);
}

/**
 * Adds jitter to a delay value (0 to 100% of the delay).
 *
 * @param delayMs - The base delay in milliseconds
 * @returns The delay with random jitter applied
 */
export function addJitter(delayMs: number): number {
	return Math.floor(delayMs * Math.random());
}

/**
 * Retries an async operation with exponential backoff.
 *
 * @param operation - The async operation to retry
 * @param options - Retry configuration options
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```typescript
 * // Retry a database connection with default options
 * await withRetry(() => sequelize.authenticate(), {
 *   label: "DB connect",
 *   maxRetries: 5,
 *   baseDelayMs: 2000,
 *   isRetryable: (err) => isTransientDbError(err),
 * });
 *
 * // Retry a Vercel API call
 * await withRetry(() => fetch(url), {
 *   label: "Vercel API",
 *   isRetryable: (err) => isRateLimitOrServerError(err),
 * });
 * ```
 */
export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
	const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 30000, jitter = true, isRetryable, label } = options;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			// Check if the error is retryable
			if (isRetryable && !isRetryable(error)) {
				throw error;
			}

			// If this was the last attempt, throw
			if (attempt === maxRetries) {
				throw error;
			}

			// Calculate delay with optional jitter
			const baseDelay = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs);
			const delayMs = jitter ? baseDelay + addJitter(baseDelay) : baseDelay;
			const errorMessage = error instanceof Error ? error.message : String(error);
			const logLabel = label ?? "operation";

			log.warn(
				{ attempt, maxRetries, delayMs, error: errorMessage },
				"Retrying %s after error (attempt %d/%d, retry in %dms): %s",
				logLabel,
				attempt,
				maxRetries,
				delayMs,
				errorMessage,
			);

			await new Promise(resolve => setTimeout(resolve, delayMs));
		}
	}

	// TypeScript needs this even though it's unreachable
	throw new Error("Retry loop exited unexpectedly");
}
