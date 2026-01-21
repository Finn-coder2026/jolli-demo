import type { ClientAuth } from "./Client";
import { createDevToolsClient } from "./DevToolsClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Helper to create a mock auth object
function createMockAuth(checkUnauthorized?: (response: Response) => boolean): ClientAuth {
	const auth: ClientAuth = {
		createRequest: (method, body, additional) => {
			const headers: Record<string, string> = {};
			if (body) {
				headers["Content-Type"] = "application/json";
			}

			return {
				method,
				headers,
				body: body ? JSON.stringify(body) : null,
				credentials: "include" as RequestCredentials,
				...additional,
			};
		},
	};
	if (checkUnauthorized) {
		auth.checkUnauthorized = checkUnauthorized;
	}
	return auth;
}

describe("DevToolsClient", () => {
	beforeEach(() => {
		global.fetch = vi.fn();
		vi.clearAllMocks();
	});

	it("should create a client with all dev tools methods", () => {
		const client = createDevToolsClient("", createMockAuth());
		expect(client).toBeDefined();
		expect(client.getDevToolsInfo).toBeDefined();
		expect(client.completeGitHubAppSetup).toBeDefined();
		expect(client.triggerDemoJob).toBeDefined();
		expect(client.clearData).toBeDefined();
	});

	describe("getDevToolsInfo", () => {
		it("should get dev tools info when enabled", async () => {
			const mockInfo = {
				enabled: true,
				githubApp: {
					defaultOrg: "jolliai",
					defaultManifest: {
						name: "jolli-local",
						url: "http://localhost:8034",
						public: false,
					},
				},
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockInfo,
			});
			global.fetch = mockFetch;

			const client = createDevToolsClient("", createMockAuth());
			const result = await client.getDevToolsInfo();

			expect(mockFetch).toHaveBeenCalledWith("/api/dev-tools/info", {
				method: "GET",
				headers: {},
				body: null,
				credentials: "include",
			});
			expect(result).toEqual(mockInfo);
			expect(result.enabled).toBe(true);
		});

		it("should get dev tools info when disabled", async () => {
			const mockInfo = {
				enabled: false,
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockInfo,
			});
			global.fetch = mockFetch;

			const client = createDevToolsClient("", createMockAuth());
			const result = await client.getDevToolsInfo();

			expect(mockFetch).toHaveBeenCalledWith("/api/dev-tools/info", {
				method: "GET",
				headers: {},
				body: null,
				credentials: "include",
			});
			expect(result).toEqual(mockInfo);
			expect(result.enabled).toBe(false);
		});

		it("should throw error when fetch fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
			});

			const client = createDevToolsClient("", createMockAuth());

			await expect(client.getDevToolsInfo()).rejects.toThrow(
				"Failed to get dev tools info: Internal Server Error",
			);
		});

		it("should use custom baseUrl when provided", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ enabled: false }),
			});
			global.fetch = mockFetch;

			const client = createDevToolsClient("https://example.com", createMockAuth());
			await client.getDevToolsInfo();

			expect(mockFetch).toHaveBeenCalledWith("https://example.com/api/dev-tools/info", expect.any(Object));
		});
	});

	describe("completeGitHubAppSetup", () => {
		it("should complete GitHub App setup successfully", async () => {
			const mockResponse = {
				success: true,
				config: '{"app_id":123,"slug":"test-app"}',
				appInfo: {
					name: "Test App",
					htmlUrl: "https://github.com/apps/test-app",
				},
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});
			global.fetch = mockFetch;

			const client = createDevToolsClient("", createMockAuth());
			const result = await client.completeGitHubAppSetup("test-code-123");

			expect(mockFetch).toHaveBeenCalledWith("/api/dev-tools/github-app/callback?code=test-code-123", {
				method: "GET",
				headers: {},
				body: null,
				credentials: "include",
			});
			expect(result).toEqual(mockResponse);
			expect(result.success).toBe(true);
		});

		it("should encode special characters in code parameter", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ success: true, config: "{}", appInfo: { name: "Test", htmlUrl: "https://test" } }),
			});
			global.fetch = mockFetch;

			const client = createDevToolsClient("", createMockAuth());
			await client.completeGitHubAppSetup("code-with-special-chars!@#$%");

			expect(mockFetch).toHaveBeenCalledWith(
				"/api/dev-tools/github-app/callback?code=code-with-special-chars!%40%23%24%25",
				expect.any(Object),
			);
		});

		it("should throw error when setup fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Request",
			});

			const client = createDevToolsClient("", createMockAuth());

			await expect(client.completeGitHubAppSetup("invalid-code")).rejects.toThrow(
				"Failed to complete GitHub App setup: Bad Request",
			);
		});

		it("should use custom baseUrl when provided", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ success: true, config: "{}", appInfo: { name: "Test", htmlUrl: "https://test" } }),
			});
			global.fetch = mockFetch;

			const client = createDevToolsClient("https://example.com", createMockAuth());
			await client.completeGitHubAppSetup("test-code");

			expect(mockFetch).toHaveBeenCalledWith(
				"https://example.com/api/dev-tools/github-app/callback?code=test-code",
				expect.any(Object),
			);
		});
	});

	describe("triggerDemoJob", () => {
		it("should trigger demo job successfully without params", async () => {
			const mockResponse = {
				jobId: "test-job-123",
				name: "demo:quick-stats",
				message: "Job queued successfully",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});
			global.fetch = mockFetch;

			const client = createDevToolsClient("", createMockAuth());
			const result = await client.triggerDemoJob("demo:quick-stats");

			expect(mockFetch).toHaveBeenCalledWith("/api/dev-tools/trigger-demo-job", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ jobName: "demo:quick-stats" }),
				credentials: "include",
			});
			expect(result).toEqual(mockResponse);
			expect(result.jobId).toBe("test-job-123");
		});

		it("should trigger demo job successfully with params", async () => {
			const mockResponse = {
				jobId: "test-job-456",
				name: "demo:parameterized",
				message: "Job queued successfully",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});
			global.fetch = mockFetch;

			const client = createDevToolsClient("", createMockAuth());
			const params = { count: 10, filter: "active" };
			const result = await client.triggerDemoJob("demo:parameterized", params);

			expect(mockFetch).toHaveBeenCalledWith("/api/dev-tools/trigger-demo-job", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ jobName: "demo:parameterized", params }),
				credentials: "include",
			});
			expect(result).toEqual(mockResponse);
			expect(result.jobId).toBe("test-job-456");
		});

		it("should throw error when trigger fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Request",
			});

			const client = createDevToolsClient("", createMockAuth());

			await expect(client.triggerDemoJob("demo:invalid")).rejects.toThrow(
				"Failed to trigger demo job: Bad Request",
			);
		});

		it("should use custom baseUrl when provided", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ jobId: "123", name: "demo:test", message: "Success" }),
			});
			global.fetch = mockFetch;

			const client = createDevToolsClient("https://example.com", createMockAuth());
			await client.triggerDemoJob("demo:test-job");

			expect(mockFetch).toHaveBeenCalledWith(
				"https://example.com/api/dev-tools/trigger-demo-job",
				expect.any(Object),
			);
		});
	});

	describe("clearData", () => {
		it("should clear data successfully", async () => {
			const mockResponse = {
				success: true,
				deletedCount: 5,
				message: "All articles cleared successfully",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});
			global.fetch = mockFetch;

			const client = createDevToolsClient("", createMockAuth());
			const result = await client.clearData("articles");

			expect(mockFetch).toHaveBeenCalledWith("/api/dev-tools/clear-data", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ dataType: "articles" }),
				credentials: "include",
			});
			expect(result).toEqual(mockResponse);
			expect(result.success).toBe(true);
			expect(result.deletedCount).toBe(5);
		});

		it("should throw error when clear fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Request",
				json: async () => ({ message: "Cannot clear jobs while running" }),
			});

			const client = createDevToolsClient("", createMockAuth());

			await expect(client.clearData("jobs")).rejects.toThrow(
				"Failed to clear data: Cannot clear jobs while running",
			);
		});

		it("should throw error with statusText when json parsing fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
				json: () => Promise.reject(new Error("JSON parse error")),
			});

			const client = createDevToolsClient("", createMockAuth());

			await expect(client.clearData("articles")).rejects.toThrow("Failed to clear data: Internal Server Error");
		});
	});

	describe("generateDraftWithEdits", () => {
		it("should generate draft with title successfully", async () => {
			const mockResponse = {
				success: true,
				draftId: 456,
				message: "Draft created with 2 section edit suggestions",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});
			global.fetch = mockFetch;

			const client = createDevToolsClient("", createMockAuth());
			const result = await client.generateDraftWithEdits({ docJrn: "jrn:jolli:test-article", numEdits: 2 });

			expect(mockFetch).toHaveBeenCalledWith("/api/dev-tools/generate-draft-with-edits", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ docJrn: "jrn:jolli:test-article", numEdits: 2 }),
				credentials: "include",
			});
			expect(result).toEqual(mockResponse);
		});

		it("should generate draft with default numEdits successfully", async () => {
			const mockResponse = {
				success: true,
				draftId: 789,
				message: "Draft created with 2 section edit suggestions",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});
			global.fetch = mockFetch;

			const client = createDevToolsClient("", createMockAuth());
			const result = await client.generateDraftWithEdits({ docJrn: "jrn:jolli:another-article" });

			expect(mockFetch).toHaveBeenCalledWith("/api/dev-tools/generate-draft-with-edits", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ docJrn: "jrn:jolli:another-article" }),
				credentials: "include",
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw error on API failure with error message", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Request",
				json: async () => ({ error: "docJrn is required" }),
			});

			const client = createDevToolsClient("", createMockAuth());

			await expect(client.generateDraftWithEdits({ docJrn: "" })).rejects.toThrow(
				"Failed to generate draft: docJrn is required",
			);
		});

		it("should throw error with statusText when json parsing fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
				json: () => Promise.reject(new Error("JSON parse error")),
			});

			const client = createDevToolsClient("", createMockAuth());

			await expect(client.generateDraftWithEdits({ docJrn: "jrn:jolli:test" })).rejects.toThrow(
				"Failed to generate draft: Internal Server Error",
			);
		});
	});

	describe("reloadConfig", () => {
		it("should call correct endpoint", async () => {
			const mockResponse = { success: true, message: "Configuration reloaded successfully" };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createDevToolsClient("http://localhost:8034", createMockAuth());
			const result = await client.reloadConfig();

			expect(fetch).toHaveBeenCalledWith(
				"http://localhost:8034/api/dev-tools/reload-config",
				expect.objectContaining({ method: "POST" }),
			);
			expect(result).toEqual(mockResponse);
		});

		it("should throw error on API failure with error message", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Forbidden",
				json: async () => ({ error: "developer_tools_disabled" }),
			});

			const client = createDevToolsClient("", createMockAuth());

			await expect(client.reloadConfig()).rejects.toThrow("Failed to reload config: developer_tools_disabled");
		});

		it("should throw error with statusText when json parsing fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
				json: () => Promise.reject(new Error("JSON parse error")),
			});

			const client = createDevToolsClient("", createMockAuth());

			await expect(client.reloadConfig()).rejects.toThrow("Failed to reload config: Internal Server Error");
		});
	});

	describe("checkUnauthorized callback", () => {
		it("should call checkUnauthorized for getDevToolsInfo", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ enabled: false }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createDevToolsClient("", createMockAuth(checkUnauthorized));
			await client.getDevToolsInfo();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for completeGitHubAppSetup", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({ success: true, config: "{}", appInfo: { name: "Test", htmlUrl: "https://test" } }),
			};
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createDevToolsClient("", createMockAuth(checkUnauthorized));
			await client.completeGitHubAppSetup("test-code");

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for triggerDemoJob", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({ jobId: "123", name: "demo:test", message: "Success" }),
			};
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createDevToolsClient("", createMockAuth(checkUnauthorized));
			await client.triggerDemoJob("demo:test");

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for clearData", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ success: true, deletedCount: 0, message: "" }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createDevToolsClient("", createMockAuth(checkUnauthorized));
			await client.clearData("articles");

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for generateDraftWithEdits", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ success: true, draftId: 1, message: "" }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createDevToolsClient("", createMockAuth(checkUnauthorized));
			await client.generateDraftWithEdits({ docJrn: "jrn:jolli:test" });

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for reloadConfig", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ success: true, message: "" }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createDevToolsClient("", createMockAuth(checkUnauthorized));
			await client.reloadConfig();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});
	});
});
