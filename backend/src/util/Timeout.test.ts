import { withTimeout } from "./Timeout";
import { describe, expect, it } from "vitest";

describe("PromiseUtils", () => {
	describe("withTimeout", () => {
		it("resolves when promise completes before timeout", async () => {
			const result = await withTimeout(Promise.resolve("success"), 1000);
			expect(result).toBe("success");
		});

		it("rejects with timeout message when promise takes too long", async () => {
			const slowPromise = new Promise(resolve => setTimeout(resolve, 1000));

			await expect(withTimeout(slowPromise, 10, "Custom timeout")).rejects.toThrow("Custom timeout");
		});

		it("uses default message when not provided", async () => {
			const slowPromise = new Promise(resolve => setTimeout(resolve, 1000));

			await expect(withTimeout(slowPromise, 10)).rejects.toThrow("Operation timed out");
		});

		it("propagates errors from the promise", async () => {
			const failingPromise = Promise.reject(new Error("Original error"));

			await expect(withTimeout(failingPromise, 1000)).rejects.toThrow("Original error");
		});
	});
});
