import { cleanUrlParams, getUrlParam } from "./UrlUtils";
import { describe, expect, it, vi } from "vitest";

describe("UrlUtils", () => {
	describe("cleanUrlParams", () => {
		it("should call history.replaceState with current pathname", () => {
			const replaceStateSpy = vi.spyOn(window.history, "replaceState");
			const { pathname } = window.location;

			cleanUrlParams();

			expect(replaceStateSpy).toHaveBeenCalledWith({}, document.title, pathname);
			replaceStateSpy.mockRestore();
		});
	});

	describe("getUrlParam", () => {
		it("should return parameter value when it exists", () => {
			// Mock URLSearchParams
			const originalURLSearchParams = global.URLSearchParams;
			global.URLSearchParams = vi.fn().mockImplementation(() => ({
				get: (key: string) => (key === "token" ? "test-123" : null),
			})) as typeof global.URLSearchParams;

			const value = getUrlParam("token");

			expect(value).toBe("test-123");

			global.URLSearchParams = originalURLSearchParams;
		});

		it("should return undefined when parameter does not exist", () => {
			const originalURLSearchParams = global.URLSearchParams;
			global.URLSearchParams = vi.fn().mockImplementation(() => ({
				get: () => null,
			})) as typeof global.URLSearchParams;

			const value = getUrlParam("token");

			expect(value).toBeUndefined();

			global.URLSearchParams = originalURLSearchParams;
		});

		it("should return undefined when no search params", () => {
			const originalURLSearchParams = global.URLSearchParams;
			global.URLSearchParams = vi.fn().mockImplementation(() => ({
				get: () => null,
			})) as typeof global.URLSearchParams;

			const value = getUrlParam("token");

			expect(value).toBeUndefined();

			global.URLSearchParams = originalURLSearchParams;
		});

		it("should handle multiple parameters", () => {
			const originalURLSearchParams = global.URLSearchParams;
			const params = new Map([
				["param1", "value1"],
				["param2", "value2"],
				["param3", "value3"],
			]);

			global.URLSearchParams = vi.fn().mockImplementation(() => ({
				get: (key: string) => params.get(key) ?? null,
			})) as typeof global.URLSearchParams;

			expect(getUrlParam("param1")).toBe("value1");
			expect(getUrlParam("param2")).toBe("value2");
			expect(getUrlParam("param3")).toBe("value3");

			global.URLSearchParams = originalURLSearchParams;
		});
	});
});
