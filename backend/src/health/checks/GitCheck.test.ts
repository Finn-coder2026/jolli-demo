import { createGitCheck } from "./GitCheck";
import type { Octokit } from "@octokit/rest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/Config", () => ({
	getConfig: vi.fn(),
}));

import { getConfig } from "../../config/Config";

describe("GitCheck", () => {
	let mockOctokit: Octokit;

	beforeEach(() => {
		vi.clearAllMocks();
		mockOctokit = {
			rateLimit: {
				get: vi.fn(),
			},
		} as unknown as Octokit;
	});

	it("returns healthy with latency when GitHub API is reachable", async () => {
		vi.mocked(getConfig).mockReturnValue({
			GITHUB_APPS_INFO: { app_id: 123 },
		} as unknown as ReturnType<typeof getConfig>);
		vi.mocked(mockOctokit.rateLimit.get).mockResolvedValue({
			data: { rate: { limit: 5000, remaining: 4999 } },
		} as never);

		const check = createGitCheck(mockOctokit);
		const result = await check.check();

		expect(result.status).toBe("healthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(result.message).toBeUndefined();
	});

	it("returns unhealthy when GitHub API is unreachable", async () => {
		vi.mocked(getConfig).mockReturnValue({
			GITHUB_APPS_INFO: { app_id: 123 },
		} as unknown as ReturnType<typeof getConfig>);
		vi.mocked(mockOctokit.rateLimit.get).mockRejectedValue(new Error("Network error"));

		const check = createGitCheck(mockOctokit);
		const result = await check.check();

		expect(result.status).toBe("unhealthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(result.message).toBe("Git service unreachable");
	});

	it("returns unhealthy when auth fails", async () => {
		vi.mocked(getConfig).mockReturnValue({
			GITHUB_APPS_INFO: { app_id: 123 },
		} as unknown as ReturnType<typeof getConfig>);
		vi.mocked(mockOctokit.rateLimit.get).mockRejectedValue(new Error("Bad credentials"));

		const check = createGitCheck(mockOctokit);
		const result = await check.check();

		expect(result.status).toBe("unhealthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(result.message).toBe("Git service unreachable");
	});

	it("returns disabled when GITHUB_APPS_INFO is not configured", async () => {
		vi.mocked(getConfig).mockReturnValue({
			GITHUB_APPS_INFO: undefined,
		} as unknown as ReturnType<typeof getConfig>);

		const check = createGitCheck(mockOctokit);
		const result = await check.check();

		expect(result.status).toBe("disabled");
		expect(result.message).toBe("Git integration not configured");
		expect(mockOctokit.rateLimit.get).not.toHaveBeenCalled();
	});

	it("has correct name and critical flag", () => {
		vi.mocked(getConfig).mockReturnValue({
			GITHUB_APPS_INFO: { app_id: 123 },
		} as unknown as ReturnType<typeof getConfig>);

		const check = createGitCheck(mockOctokit);

		expect(check.name).toBe("git");
		expect(check.critical).toBe(false);
	});
});
