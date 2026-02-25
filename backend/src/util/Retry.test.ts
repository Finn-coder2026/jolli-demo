import { addJitter, calculateBackoffDelay, withRetry } from "./Retry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Retry", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("calculateBackoffDelay", () => {
		it("returns base delay for first attempt", () => {
			expect(calculateBackoffDelay(1, 1000, 30000)).toBe(1000);
		});

		it("doubles delay for each subsequent attempt", () => {
			expect(calculateBackoffDelay(2, 1000, 30000)).toBe(2000);
			expect(calculateBackoffDelay(3, 1000, 30000)).toBe(4000);
			expect(calculateBackoffDelay(4, 1000, 30000)).toBe(8000);
		});

		it("caps delay at maxDelayMs", () => {
			expect(calculateBackoffDelay(10, 1000, 30000)).toBe(30000);
			expect(calculateBackoffDelay(20, 1000, 30000)).toBe(30000);
		});

		it("works with different base delays", () => {
			expect(calculateBackoffDelay(1, 500, 10000)).toBe(500);
			expect(calculateBackoffDelay(2, 500, 10000)).toBe(1000);
			expect(calculateBackoffDelay(3, 500, 10000)).toBe(2000);
		});
	});

	describe("addJitter", () => {
		it("returns a value between 0 and the delay", () => {
			const delay = 1000;
			for (let i = 0; i < 100; i++) {
				const jittered = addJitter(delay);
				expect(jittered).toBeGreaterThanOrEqual(0);
				expect(jittered).toBeLessThanOrEqual(delay);
			}
		});

		it("returns 0 for zero delay", () => {
			expect(addJitter(0)).toBe(0);
		});
	});

	describe("withRetry", () => {
		it("returns result on first success", async () => {
			const operation = vi.fn().mockResolvedValue("success");

			const result = await withRetry(operation);

			expect(result).toBe("success");
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it("retries on failure and eventually succeeds", async () => {
			const operation = vi
				.fn()
				.mockRejectedValueOnce(new Error("fail 1"))
				.mockRejectedValueOnce(new Error("fail 2"))
				.mockResolvedValue("success");

			const result = await withRetry(operation, {
				maxRetries: 3,
				baseDelayMs: 100,
				jitter: false,
			});

			expect(result).toBe("success");
			expect(operation).toHaveBeenCalledTimes(3);
		});

		it("throws after exhausting all retries", async () => {
			const operation = vi.fn().mockRejectedValue(new Error("always fails"));

			await expect(
				withRetry(operation, {
					maxRetries: 3,
					baseDelayMs: 100,
					jitter: false,
				}),
			).rejects.toThrow("always fails");

			expect(operation).toHaveBeenCalledTimes(3);
		});

		it("does not retry non-retryable errors", async () => {
			const nonRetryableError = new Error("auth failure");
			const operation = vi.fn().mockRejectedValue(nonRetryableError);

			await expect(
				withRetry(operation, {
					maxRetries: 3,
					baseDelayMs: 100,
					isRetryable: () => false,
				}),
			).rejects.toThrow("auth failure");

			expect(operation).toHaveBeenCalledTimes(1);
		});

		it("retries only retryable errors", async () => {
			const retryableError = Object.assign(new Error("rate limited"), { status: 429 });
			const nonRetryableError = Object.assign(new Error("not found"), { status: 404 });

			const operation = vi.fn().mockRejectedValueOnce(retryableError).mockRejectedValueOnce(nonRetryableError);

			await expect(
				withRetry(operation, {
					maxRetries: 3,
					baseDelayMs: 100,
					jitter: false,
					isRetryable: (err: unknown) => {
						const status = (err as { status?: number }).status;
						return status === 429;
					},
				}),
			).rejects.toThrow("not found");

			expect(operation).toHaveBeenCalledTimes(2);
		});

		it("uses exponential backoff between retries", async () => {
			const delays: Array<number> = [];

			// Track setTimeout delays
			const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation((fn, delay) => {
				if (typeof delay === "number" && delay > 0) {
					delays.push(delay);
				}
				// Execute immediately for testing
				if (typeof fn === "function") {
					fn();
				}
				return 0 as unknown as ReturnType<typeof setTimeout>;
			});

			const operation = vi
				.fn()
				.mockRejectedValueOnce(new Error("fail 1"))
				.mockRejectedValueOnce(new Error("fail 2"))
				.mockResolvedValue("success");

			await withRetry(operation, {
				maxRetries: 3,
				baseDelayMs: 1000,
				maxDelayMs: 30000,
				jitter: false,
			});

			// First retry: 1000ms, second retry: 2000ms
			expect(delays).toHaveLength(2);
			expect(delays[0]).toBe(1000);
			expect(delays[1]).toBe(2000);

			setTimeoutSpy.mockRestore();
		});

		it("uses default options when none provided", async () => {
			const operation = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue("success");

			const result = await withRetry(operation);

			expect(result).toBe("success");
			expect(operation).toHaveBeenCalledTimes(2);
		});

		it("uses custom label in log messages", async () => {
			const operation = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue("success");

			const result = await withRetry(operation, {
				label: "DB connect",
				baseDelayMs: 100,
				jitter: false,
			});

			expect(result).toBe("success");
		});

		it("handles non-Error throws", async () => {
			const operation = vi.fn().mockRejectedValueOnce("string error").mockResolvedValue("success");

			const result = await withRetry(operation, {
				baseDelayMs: 100,
				jitter: false,
			});

			expect(result).toBe("success");
		});
	});
});
