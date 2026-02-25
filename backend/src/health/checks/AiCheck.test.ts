import { createAiCheck } from "./AiCheck";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/Config", () => ({
	getConfig: vi.fn(),
}));

import { getConfig } from "../../config/Config";

describe("AiCheck", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns healthy when Anthropic API responds successfully", async () => {
		vi.mocked(getConfig).mockReturnValue({
			ANTHROPIC_API_KEY: "sk-ant-test-key",
		} as unknown as ReturnType<typeof getConfig>);

		vi.mocked(fetch).mockResolvedValue({
			ok: true,
		} as Response);

		const check = createAiCheck();
		const result = await check.check();

		expect(result.status).toBe("healthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(fetch).toHaveBeenCalledWith("https://api.anthropic.com/v1/models", {
			method: "GET",
			headers: {
				"x-api-key": "sk-ant-test-key",
				"anthropic-version": "2023-06-01",
			},
		});
	});

	it("returns unhealthy when Anthropic API returns non-200", async () => {
		vi.mocked(getConfig).mockReturnValue({
			ANTHROPIC_API_KEY: "sk-ant-test-key",
		} as unknown as ReturnType<typeof getConfig>);

		vi.mocked(fetch).mockResolvedValue({
			ok: false,
			status: 401,
		} as Response);

		const check = createAiCheck();
		const result = await check.check();

		expect(result.status).toBe("unhealthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(result.message).toBe("AI service returned 401");
	});

	it("returns unhealthy when Anthropic API is unreachable", async () => {
		vi.mocked(getConfig).mockReturnValue({
			ANTHROPIC_API_KEY: "sk-ant-test-key",
		} as unknown as ReturnType<typeof getConfig>);

		vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

		const check = createAiCheck();
		const result = await check.check();

		expect(result.status).toBe("unhealthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(result.message).toBe("AI service unreachable");
	});

	it("returns disabled when Anthropic API key is not configured", async () => {
		vi.mocked(getConfig).mockReturnValue({
			ANTHROPIC_API_KEY: undefined,
		} as unknown as ReturnType<typeof getConfig>);

		const check = createAiCheck();
		const result = await check.check();

		expect(result.status).toBe("disabled");
		expect(result.message).toBe("AI not configured");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("returns disabled when Anthropic API key is empty string", async () => {
		vi.mocked(getConfig).mockReturnValue({
			ANTHROPIC_API_KEY: "",
		} as unknown as ReturnType<typeof getConfig>);

		const check = createAiCheck();
		const result = await check.check();

		expect(result.status).toBe("disabled");
		expect(result.message).toBe("AI not configured");
	});

	it("has correct name and critical flag", () => {
		vi.mocked(getConfig).mockReturnValue({
			ANTHROPIC_API_KEY: "sk-ant-test-key",
		} as unknown as ReturnType<typeof getConfig>);

		const check = createAiCheck();

		expect(check.name).toBe("ai");
		expect(check.critical).toBe(false);
	});
});
