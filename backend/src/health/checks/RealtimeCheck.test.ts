import { createRealtimeCheck } from "./RealtimeCheck";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/Config", () => ({
	getConfig: vi.fn(),
}));

import { getConfig } from "../../config/Config";

describe("RealtimeCheck", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns healthy with latency when Mercure hub responds with 2xx", async () => {
		vi.mocked(getConfig).mockReturnValue({
			MERCURE_ENABLED: true,
			MERCURE_HUB_BASE_URL: "https://mercure.example.com",
		} as unknown as ReturnType<typeof getConfig>);
		vi.mocked(fetch).mockResolvedValue({
			status: 200,
		} as Response);

		const check = createRealtimeCheck();
		const result = await check.check();

		expect(result.status).toBe("healthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(result.message).toBeUndefined();
		expect(fetch).toHaveBeenCalledWith(
			"https://mercure.example.com/.well-known/mercure",
			expect.objectContaining({ method: "HEAD" }),
		);
	});

	it("returns healthy when Mercure returns 405 (method not allowed)", async () => {
		vi.mocked(getConfig).mockReturnValue({
			MERCURE_ENABLED: true,
			MERCURE_HUB_BASE_URL: "https://mercure.example.com/",
		} as unknown as ReturnType<typeof getConfig>);
		vi.mocked(fetch).mockResolvedValue({
			status: 405,
		} as Response);

		const check = createRealtimeCheck();
		const result = await check.check();

		// 405 is acceptable - hub is reachable, just doesn't allow HEAD
		expect(result.status).toBe("healthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
	});

	it("returns unhealthy when Mercure returns 5xx", async () => {
		vi.mocked(getConfig).mockReturnValue({
			MERCURE_ENABLED: true,
			MERCURE_HUB_BASE_URL: "https://mercure.example.com",
		} as unknown as ReturnType<typeof getConfig>);
		vi.mocked(fetch).mockResolvedValue({
			status: 503,
		} as Response);

		const check = createRealtimeCheck();
		const result = await check.check();

		expect(result.status).toBe("unhealthy");
		expect(result.message).toBe("Realtime hub returned 503");
	});

	it("returns unhealthy when fetch throws (network error)", async () => {
		vi.mocked(getConfig).mockReturnValue({
			MERCURE_ENABLED: true,
			MERCURE_HUB_BASE_URL: "https://mercure.example.com",
		} as unknown as ReturnType<typeof getConfig>);
		vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

		const check = createRealtimeCheck();
		const result = await check.check();

		expect(result.status).toBe("unhealthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(result.message).toBe("Realtime hub unreachable");
	});

	it("returns disabled when MERCURE_ENABLED is false", async () => {
		vi.mocked(getConfig).mockReturnValue({
			MERCURE_ENABLED: false,
			MERCURE_HUB_BASE_URL: "https://mercure.example.com",
		} as unknown as ReturnType<typeof getConfig>);

		const check = createRealtimeCheck();
		const result = await check.check();

		expect(result.status).toBe("disabled");
		expect(result.message).toBe("Realtime not enabled");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("returns disabled when MERCURE_HUB_BASE_URL is not configured", async () => {
		vi.mocked(getConfig).mockReturnValue({
			MERCURE_ENABLED: true,
			MERCURE_HUB_BASE_URL: undefined,
		} as unknown as ReturnType<typeof getConfig>);

		const check = createRealtimeCheck();
		const result = await check.check();

		expect(result.status).toBe("disabled");
		expect(result.message).toBe("Realtime not enabled");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("strips trailing slash from hub URL", async () => {
		vi.mocked(getConfig).mockReturnValue({
			MERCURE_ENABLED: true,
			MERCURE_HUB_BASE_URL: "https://mercure.example.com/",
		} as unknown as ReturnType<typeof getConfig>);
		vi.mocked(fetch).mockResolvedValue({
			status: 200,
		} as Response);

		const check = createRealtimeCheck();
		await check.check();

		expect(fetch).toHaveBeenCalledWith("https://mercure.example.com/.well-known/mercure", expect.anything());
	});

	it("has correct name and critical flag", () => {
		vi.mocked(getConfig).mockReturnValue({
			MERCURE_ENABLED: true,
			MERCURE_HUB_BASE_URL: "https://mercure.example.com",
		} as unknown as ReturnType<typeof getConfig>);

		const check = createRealtimeCheck();

		expect(check.name).toBe("realtime");
		expect(check.critical).toBe(false);
	});
});
