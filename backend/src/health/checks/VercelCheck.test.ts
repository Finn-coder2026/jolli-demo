import { createVercelCheck } from "./VercelCheck";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/Config", () => ({
	getConfig: vi.fn(),
}));

import { getConfig } from "../../config/Config";

describe("VercelCheck", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns healthy when Vercel API responds successfully", async () => {
		vi.mocked(getConfig).mockReturnValue({
			VERCEL_TOKEN: "test-vercel-token",
		} as unknown as ReturnType<typeof getConfig>);

		vi.mocked(fetch).mockResolvedValue({
			ok: true,
		} as Response);

		const check = createVercelCheck();
		const result = await check.check();

		expect(result.status).toBe("healthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(fetch).toHaveBeenCalledWith("https://api.vercel.com/v2/user", {
			method: "GET",
			headers: {
				Authorization: "Bearer test-vercel-token",
			},
		});
	});

	it("returns unhealthy when Vercel API returns non-200", async () => {
		vi.mocked(getConfig).mockReturnValue({
			VERCEL_TOKEN: "test-vercel-token",
		} as unknown as ReturnType<typeof getConfig>);

		vi.mocked(fetch).mockResolvedValue({
			ok: false,
			status: 401,
		} as Response);

		const check = createVercelCheck();
		const result = await check.check();

		expect(result.status).toBe("unhealthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(result.message).toBe("Hosting API returned 401");
	});

	it("returns unhealthy when Vercel API is unreachable", async () => {
		vi.mocked(getConfig).mockReturnValue({
			VERCEL_TOKEN: "test-vercel-token",
		} as unknown as ReturnType<typeof getConfig>);

		vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

		const check = createVercelCheck();
		const result = await check.check();

		expect(result.status).toBe("unhealthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(result.message).toBe("Hosting API unreachable");
	});

	it("returns disabled when Vercel token is not configured", async () => {
		vi.mocked(getConfig).mockReturnValue({
			VERCEL_TOKEN: undefined,
		} as unknown as ReturnType<typeof getConfig>);

		const check = createVercelCheck();
		const result = await check.check();

		expect(result.status).toBe("disabled");
		expect(result.message).toBe("Hosting API not configured");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("returns disabled when Vercel token is empty string", async () => {
		vi.mocked(getConfig).mockReturnValue({
			VERCEL_TOKEN: "",
		} as unknown as ReturnType<typeof getConfig>);

		const check = createVercelCheck();
		const result = await check.check();

		expect(result.status).toBe("disabled");
		expect(result.message).toBe("Hosting API not configured");
	});

	it("has correct name and critical flag", () => {
		vi.mocked(getConfig).mockReturnValue({
			VERCEL_TOKEN: "test-vercel-token",
		} as unknown as ReturnType<typeof getConfig>);

		const check = createVercelCheck();

		expect(check.name).toBe("hosting");
		expect(check.critical).toBe(false);
	});
});
