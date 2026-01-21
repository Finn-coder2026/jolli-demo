import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("GitHubApp", () => {
	let originalEnv: string | undefined;

	beforeEach(() => {
		originalEnv = process.env.GITHUB_APPS_INFO;
		vi.resetModules();
	});

	afterEach(() => {
		if (originalEnv) {
			process.env.GITHUB_APPS_INFO = originalEnv;
		} else {
			delete process.env.GITHUB_APPS_INFO;
		}
		vi.resetModules();
	});

	describe("getCoreJolliGithubApp", () => {
		it("should return default app when GITHUB_APPS_INFO is not set", async () => {
			delete process.env.GITHUB_APPS_INFO;

			const { getCoreJolliGithubApp } = await import("./GitHubApp");
			const result = getCoreJolliGithubApp();

			// Should return a default/empty app
			expect(result).toBeDefined();
			expect(result.appId).toBe(-1);
			expect(result.slug).toBe("");
			expect(result.clientId).toBe("");
			expect(result.clientSecret).toBe("");
			expect(result.webhookSecret).toBe("");
			expect(result.privateKey).toBe("");
			expect(result.name).toBe("");
			expect(result.htmlUrl).toBe("");
			expect(result.createdAt).toBeInstanceOf(Date);
			expect(result.updatedAt).toBeInstanceOf(Date);
		});

		it("should return app when GITHUB_APPS_INFO is set", async () => {
			const appInfo = {
				app_id: 2160825,
				slug: "jolli",
				client_id: "test-client-id",
				client_secret: "test-client-secret",
				webhook_secret: "test-webhook-secret",
				private_key: "test-private-key",
				name: "Jolli",
				html_url: "https://github.com/apps/jolli",
			};

			process.env.GITHUB_APPS_INFO = JSON.stringify(appInfo);

			const { getCoreJolliGithubApp } = await import("./GitHubApp");
			const result = getCoreJolliGithubApp();

			expect(result).toBeDefined();
			expect(result.appId).toBe(2160825);
			expect(result.slug).toBe("jolli");
			expect(result.name).toBe("Jolli");
			expect(result.clientId).toBe("test-client-id");
			expect(result.clientSecret).toBe("test-client-secret");
			expect(result.webhookSecret).toBe("test-webhook-secret");
			expect(result.privateKey).toBe("test-private-key");
			expect(result.htmlUrl).toBe("https://github.com/apps/jolli");
			expect(result.createdAt).toBeInstanceOf(Date);
			expect(result.updatedAt).toBeInstanceOf(Date);
		});

		it("should create dates when not provided in config", async () => {
			const appInfo = {
				app_id: 123456,
				slug: "test-app",
				client_id: "test-client",
				client_secret: "test-secret",
				webhook_secret: "test-webhook",
				private_key: "test-key",
				name: "Test App",
				html_url: "https://github.com/apps/test",
			};

			process.env.GITHUB_APPS_INFO = JSON.stringify(appInfo);

			const { getCoreJolliGithubApp } = await import("./GitHubApp");
			const beforeCall = new Date();
			const result = getCoreJolliGithubApp();
			const afterCall = new Date();

			expect(result).toBeDefined();
			expect(result.createdAt).toBeInstanceOf(Date);
			expect(result.updatedAt).toBeInstanceOf(Date);
			// Dates should be around the time of the call
			expect(result.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
			expect(result.createdAt.getTime()).toBeLessThanOrEqual(afterCall.getTime());
		});

		it("should return consistent app on multiple calls", async () => {
			const appInfo = {
				app_id: 123456,
				slug: "test-app",
				client_id: "test-client",
				client_secret: "test-secret",
				webhook_secret: "test-webhook",
				private_key: "test-key",
				name: "Test App",
				html_url: "https://github.com/apps/test",
			};

			process.env.GITHUB_APPS_INFO = JSON.stringify(appInfo);

			const { getCoreJolliGithubApp } = await import("./GitHubApp");
			const result1 = getCoreJolliGithubApp();
			const result2 = getCoreJolliGithubApp();

			expect(result1).toBeDefined();
			expect(result2).toBeDefined();
			// Should have the same core values
			expect(result1.appId).toBe(result2.appId);
			expect(result1.slug).toBe(result2.slug);
			expect(result1.name).toBe(result2.name);
		});
	});
});
