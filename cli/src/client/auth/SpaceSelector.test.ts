import { fetchSpaces } from "./SpaceSelector";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("SpaceSelector", () => {
	const originalFetch = globalThis.fetch;
	const mockFetch = vi.fn();

	beforeEach(() => {
		globalThis.fetch = mockFetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	describe("fetchSpaces", () => {
		it("should fetch spaces with correct auth header", async () => {
			const spaces = [
				{ id: 1, name: "Default", slug: "default" },
				{ id: 2, name: "Engineering", slug: "engineering" },
			];
			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(spaces),
			});

			const result = await fetchSpaces("my-token", "http://localhost:8034");

			expect(mockFetch).toHaveBeenCalledWith("http://localhost:8034/api/spaces", {
				headers: {
					Authorization: "Bearer my-token",
					"Content-Type": "application/json",
				},
			});
			expect(result).toEqual(spaces);
		});

		it("should throw on non-ok response", async () => {
			mockFetch.mockResolvedValue({
				ok: false,
				status: 401,
				statusText: "Unauthorized",
			});

			await expect(fetchSpaces("bad-token", "http://localhost:8034")).rejects.toThrow(
				"Failed to fetch spaces (401 Unauthorized)",
			);
		});
	});
});
