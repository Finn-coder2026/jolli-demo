import { createAuthCheck } from "./AuthCheck";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/Config", () => ({
	getConfig: vi.fn(),
}));

import { getConfig } from "../../config/Config";

describe("AuthCheck", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns healthy when GitHub OAuth is configured and reachable", async () => {
		vi.mocked(getConfig).mockReturnValue({
			GITHUB_CLIENT_ID: "github-client-id",
			GITHUB_CLIENT_SECRET: "github-client-secret",
			GOOGLE_CLIENT_ID: undefined,
			GOOGLE_CLIENT_SECRET: undefined,
		} as unknown as ReturnType<typeof getConfig>);

		vi.mocked(fetch).mockResolvedValue({
			ok: true,
		} as Response);

		const check = createAuthCheck();
		const result = await check.check();

		expect(result.status).toBe("healthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
	});

	it("returns healthy when Google OAuth is configured and reachable", async () => {
		vi.mocked(getConfig).mockReturnValue({
			GITHUB_CLIENT_ID: undefined,
			GITHUB_CLIENT_SECRET: undefined,
			GOOGLE_CLIENT_ID: "google-client-id",
			GOOGLE_CLIENT_SECRET: "google-client-secret",
		} as unknown as ReturnType<typeof getConfig>);

		vi.mocked(fetch).mockResolvedValue({
			ok: true,
		} as Response);

		const check = createAuthCheck();
		const result = await check.check();

		expect(result.status).toBe("healthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
	});

	it("returns healthy when both providers are configured and at least one is reachable", async () => {
		vi.mocked(getConfig).mockReturnValue({
			GITHUB_CLIENT_ID: "github-client-id",
			GITHUB_CLIENT_SECRET: "github-client-secret",
			GOOGLE_CLIENT_ID: "google-client-id",
			GOOGLE_CLIENT_SECRET: "google-client-secret",
		} as unknown as ReturnType<typeof getConfig>);

		// GitHub fails, Google succeeds
		vi.mocked(fetch)
			.mockResolvedValueOnce({ ok: false } as Response)
			.mockResolvedValueOnce({ ok: true } as Response);

		const check = createAuthCheck();
		const result = await check.check();

		expect(result.status).toBe("healthy");
	});

	it("returns unhealthy when configured providers are unreachable", async () => {
		vi.mocked(getConfig).mockReturnValue({
			GITHUB_CLIENT_ID: "github-client-id",
			GITHUB_CLIENT_SECRET: "github-client-secret",
			GOOGLE_CLIENT_ID: undefined,
			GOOGLE_CLIENT_SECRET: undefined,
		} as unknown as ReturnType<typeof getConfig>);

		vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

		const check = createAuthCheck();
		const result = await check.check();

		expect(result.status).toBe("unhealthy");
		expect(result.message).toBe("OAuth providers unreachable: GitHub");
	});

	it("returns unhealthy when all configured providers are unreachable", async () => {
		vi.mocked(getConfig).mockReturnValue({
			GITHUB_CLIENT_ID: "github-client-id",
			GITHUB_CLIENT_SECRET: "github-client-secret",
			GOOGLE_CLIENT_ID: "google-client-id",
			GOOGLE_CLIENT_SECRET: "google-client-secret",
		} as unknown as ReturnType<typeof getConfig>);

		vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

		const check = createAuthCheck();
		const result = await check.check();

		expect(result.status).toBe("unhealthy");
		expect(result.message).toBe("OAuth providers unreachable: GitHub, Google");
	});

	it("returns disabled when no OAuth providers are configured", async () => {
		vi.mocked(getConfig).mockReturnValue({
			GITHUB_CLIENT_ID: undefined,
			GITHUB_CLIENT_SECRET: undefined,
			GOOGLE_CLIENT_ID: undefined,
			GOOGLE_CLIENT_SECRET: undefined,
		} as unknown as ReturnType<typeof getConfig>);

		const check = createAuthCheck();
		const result = await check.check();

		expect(result.status).toBe("disabled");
		expect(result.message).toBe("No OAuth providers configured");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("returns disabled when only partial credentials are configured", async () => {
		vi.mocked(getConfig).mockReturnValue({
			GITHUB_CLIENT_ID: "github-client-id",
			GITHUB_CLIENT_SECRET: undefined, // Missing secret
			GOOGLE_CLIENT_ID: undefined,
			GOOGLE_CLIENT_SECRET: "google-secret", // Missing ID
		} as unknown as ReturnType<typeof getConfig>);

		const check = createAuthCheck();
		const result = await check.check();

		expect(result.status).toBe("disabled");
		expect(result.message).toBe("No OAuth providers configured");
	});

	it("has correct name and critical flag", () => {
		vi.mocked(getConfig).mockReturnValue({
			GITHUB_CLIENT_ID: "github-client-id",
			GITHUB_CLIENT_SECRET: "github-client-secret",
		} as unknown as ReturnType<typeof getConfig>);

		const check = createAuthCheck();

		expect(check.name).toBe("auth");
		expect(check.critical).toBe(false);
	});

	it("handles non-200 responses as unreachable", async () => {
		vi.mocked(getConfig).mockReturnValue({
			GITHUB_CLIENT_ID: "github-client-id",
			GITHUB_CLIENT_SECRET: "github-client-secret",
			GOOGLE_CLIENT_ID: undefined,
			GOOGLE_CLIENT_SECRET: undefined,
		} as unknown as ReturnType<typeof getConfig>);

		vi.mocked(fetch).mockResolvedValue({
			ok: false,
			status: 503,
		} as Response);

		const check = createAuthCheck();
		const result = await check.check();

		expect(result.status).toBe("unhealthy");
		expect(result.message).toBe("OAuth providers unreachable: GitHub");
	});
});
