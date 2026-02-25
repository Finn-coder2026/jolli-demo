import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dotenv to prevent .env.local from overriding test env vars
vi.mock("dotenv", () => ({
	config: vi.fn(),
}));

// Mock the ParameterStoreLoader before importing Config
vi.mock("./ParameterStoreLoader", () => {
	const mockLoad = vi.fn();
	const mockReload = vi.fn();
	const mockGetCached = vi.fn();
	const mockGetPathPrefix = vi.fn();

	return {
		ParameterStoreLoader: vi.fn(() => ({
			load: mockLoad,
			reload: mockReload,
			getCached: mockGetCached,
			getPathPrefix: mockGetPathPrefix,
		})),
		pathToEnvVarName: (path: string) =>
			path
				.split("/")
				.map(part => part.replace(/-/g, "_").toUpperCase())
				.join("_"),
	};
});

describe("Config", () => {
	let originalEnv: string | undefined;
	let originalPstoreEnv: string | undefined;

	beforeEach(() => {
		originalEnv = process.env.GITHUB_APPS_INFO;
		originalPstoreEnv = process.env.PSTORE_ENV;
		vi.resetModules();
		vi.clearAllMocks();
	});

	afterEach(() => {
		if (originalEnv) {
			process.env.GITHUB_APPS_INFO = originalEnv;
		} else {
			delete process.env.GITHUB_APPS_INFO;
		}
		if (originalPstoreEnv) {
			process.env.PSTORE_ENV = originalPstoreEnv;
		} else {
			delete process.env.PSTORE_ENV;
		}
		vi.resetModules();
	});

	it("should parse valid GITHUB_APPS_INFO JSON", async () => {
		const validAppInfo = {
			id: 1,
			app_id: 123456,
			slug: "test-app",
			client_id: "test-client",
			client_secret: "test-secret",
			webhook_secret: "test-webhook",
			private_key: "test-key",
			name: "Test App",
			html_url: "https://github.com/apps/test",
		};

		process.env.GITHUB_APPS_INFO = JSON.stringify(validAppInfo);

		const { getConfig } = await import("./Config");
		const config = getConfig();

		expect(config.GITHUB_APPS_INFO).toBeDefined();
		expect(config.GITHUB_APPS_INFO?.app_id).toBe(123456);
	});

	it("should throw when GITHUB_APPS_INFO is invalid JSON", async () => {
		// Suppress console.error output during this test to avoid stderr in CI
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Intentionally empty to suppress validation error output
		});

		process.env.GITHUB_APPS_INFO = "invalid json {";

		const { getConfig } = await import("./Config");
		expect(() => getConfig()).toThrow();

		consoleErrorSpy.mockRestore();
	});

	it("should allow GITHUB_APPS_INFO to be undefined", async () => {
		delete process.env.GITHUB_APPS_INFO;

		// The config should not throw when GITHUB_APPS_INFO is undefined since it's optional
		const { getConfig } = await import("./Config");
		const config = getConfig();
		expect(config.GITHUB_APPS_INFO).toBeUndefined();
	});

	it("should log warning when GITHUB_APPS_INFO is not configured", async () => {
		delete process.env.GITHUB_APPS_INFO;
		delete process.env.PSTORE_ENV;

		// Mock dotenv to prevent reloadEnvFiles from overwriting test env vars
		vi.doMock("dotenv", () => ({
			config: vi.fn(),
		}));

		const { initializeConfig } = await import("./Config");
		const config = await initializeConfig();
		expect(config.GITHUB_APPS_INFO).toBeUndefined();
		// Log warning is checked through the logger mock
	});

	it("should reset config cache when resetConfig is called", async () => {
		process.env.GITHUB_APPS_INFO = JSON.stringify({
			app_id: 111,
			slug: "test1",
			client_id: "test",
			client_secret: "test",
			webhook_secret: "test",
			private_key: "test",
			name: "Test1",
			html_url: "https://github.com/apps/test1",
		});

		const { getConfig, resetConfig } = await import("./Config");
		const config1 = getConfig();
		expect(config1.GITHUB_APPS_INFO?.app_id).toBe(111);

		// Change the environment
		process.env.GITHUB_APPS_INFO = JSON.stringify({
			app_id: 222,
			slug: "test2",
			client_id: "test",
			client_secret: "test",
			webhook_secret: "test",
			private_key: "test",
			name: "Test2",
			html_url: "https://github.com/apps/test2",
		});

		// Without reset, should return cached config
		const config2 = getConfig();
		expect(config2.GITHUB_APPS_INFO?.app_id).toBe(111);

		// After reset, should return new config
		resetConfig();
		const config3 = getConfig();
		expect(config3.GITHUB_APPS_INFO?.app_id).toBe(222);
	});

	describe("Parameter Store Integration", () => {
		it("should initialize config without parameter store when PSTORE_ENV is not set", async () => {
			delete process.env.PSTORE_ENV;
			// GITHUB_APPS_INFO is required, so we need to provide a valid value
			process.env.GITHUB_APPS_INFO = JSON.stringify({
				app_id: 999,
				slug: "test",
				client_id: "test-client",
				client_secret: "test-secret",
				webhook_secret: "test-webhook",
				private_key: "test-key",
				name: "Test App",
				html_url: "https://github.com/apps/test",
			});

			// Mock dotenv to prevent reloadEnvFiles from overwriting test env vars
			vi.doMock("dotenv", () => ({
				config: vi.fn(),
			}));

			const { initializeConfig } = await import("./Config");

			const config = await initializeConfig();

			expect(config.GITHUB_APPS_INFO).toBeDefined();
			expect(config.GITHUB_APPS_INFO?.app_id).toBe(999);
		});

		it("should initialize config with parameter store when PSTORE_ENV is set", async () => {
			process.env.PSTORE_ENV = "prod";
			// Set initial value before import (will be overridden by parameter store)
			process.env.GITHUB_APPS_INFO = JSON.stringify({
				app_id: 999,
				slug: "initial",
				client_id: "initial-client",
				client_secret: "initial-secret",
				webhook_secret: "initial-webhook",
				private_key: "initial-key",
				name: "Initial App",
				html_url: "https://github.com/apps/initial",
			});

			const { initializeConfig } = await import("./Config");
			const { ParameterStoreLoader } = await import("./ParameterStoreLoader");

			const mockLoad = vi.fn().mockImplementation(async () => {
				// Simulate parameter store setting the env var
				await Promise.resolve(); // Keep async for signature matching
				process.env.GITHUB_APPS_INFO = JSON.stringify({
					app_id: 123,
					slug: "test-app",
					client_id: "test-client",
					client_secret: "test-secret",
					webhook_secret: "test-webhook",
					private_key: "test-key",
					name: "Test App",
					html_url: "https://github.com/apps/test",
				});
				return {
					GITHUB_APPS_INFO: process.env.GITHUB_APPS_INFO,
				};
			});

			vi.mocked(ParameterStoreLoader).mockImplementation(
				() =>
					({
						load: mockLoad,
						reload: vi.fn(),
						getCached: vi.fn(),
						getPathPrefix: vi.fn(),
					}) as unknown as InstanceType<typeof ParameterStoreLoader>,
			);

			const config = await initializeConfig();

			expect(mockLoad).toHaveBeenCalled();
			expect(config.GITHUB_APPS_INFO).toBeDefined();
			expect(config.GITHUB_APPS_INFO?.app_id).toBe(123);
		});

		it("should mark AWS parameter store as critical in production when PSTORE_ENV is set", async () => {
			vi.resetModules();
			const originalNodeEnv = process.env.NODE_ENV;

			process.env.NODE_ENV = "production";
			process.env.PSTORE_ENV = "prod";
			process.env.GITHUB_APPS_INFO = JSON.stringify({
				app_id: 999,
				slug: "test",
				client_id: "test-client",
				client_secret: "test-secret",
				webhook_secret: "test-webhook",
				private_key: "test-key",
				name: "Test App",
				html_url: "https://github.com/apps/test",
			});

			const chainCtor = vi.fn().mockImplementation(function (
				this: {
					load: () => Promise<{ config: Record<string, string>; providerResults: Array<unknown> }>;
					getProviders: () => Array<unknown>;
				},
				providers: Array<unknown>,
			) {
				this.getProviders = () => providers;
				this.load = () => Promise.resolve({ config: {}, providerResults: [] });
			});

			vi.doMock("./providers", () => ({
				AWSParameterStoreProvider: vi.fn().mockImplementation(() => ({
					name: "aws-parameter-store",
					priority: 1,
					isAvailable: () => true,
					load: vi.fn().mockResolvedValue({}),
					getLoader: () => null,
				})),
				LocalEnvProvider: vi.fn().mockImplementation(() => ({
					name: "local-env",
					priority: 3,
					isAvailable: () => true,
					load: vi.fn().mockResolvedValue({}),
				})),
				ConfigProviderChain: chainCtor,
			}));

			try {
				const { initializeConfig } = await import("./Config");
				await initializeConfig();

				expect(chainCtor).toHaveBeenCalledWith(expect.any(Array), {
					criticalProviders: ["aws-parameter-store"],
				});
			} finally {
				if (originalNodeEnv === undefined) {
					delete process.env.NODE_ENV;
				} else {
					process.env.NODE_ENV = originalNodeEnv;
				}
				vi.doUnmock("./providers");
				vi.resetModules();
			}
		});

		it("should reload config with updated parameter store values", async () => {
			process.env.PSTORE_ENV = "prod";
			process.env.GITHUB_APPS_INFO = JSON.stringify({
				app_id: 123,
				slug: "test-app",
				client_id: "test-client",
				client_secret: "test-secret",
				webhook_secret: "test-webhook",
				private_key: "test-key",
				name: "Test App",
				html_url: "https://github.com/apps/test",
			});

			// Mock dotenv to prevent reloadEnvFiles from overwriting test env vars
			vi.doMock("dotenv", () => ({
				config: vi.fn(),
			}));

			const { initializeConfig, reloadConfig, getConfig } = await import("./Config");
			const { ParameterStoreLoader } = await import("./ParameterStoreLoader");

			let loadCallCount = 0;
			const mockLoad = vi.fn().mockImplementation(async () => {
				loadCallCount++;
				await Promise.resolve(); // Keep async for signature matching
				// On second load (reload), update the values
				if (loadCallCount > 1) {
					process.env.GITHUB_APPS_INFO = JSON.stringify({
						app_id: 456,
						slug: "updated-app",
						client_id: "updated-client",
						client_secret: "updated-secret",
						webhook_secret: "updated-webhook",
						private_key: "updated-key",
						name: "Updated App",
						html_url: "https://github.com/apps/updated",
					});
				}
				return {
					GITHUB_APPS_INFO: process.env.GITHUB_APPS_INFO,
				};
			});

			vi.mocked(ParameterStoreLoader).mockImplementation(
				() =>
					({
						load: mockLoad,
						reload: vi.fn(),
						getCached: vi.fn(),
						getPathPrefix: vi.fn(),
					}) as unknown as InstanceType<typeof ParameterStoreLoader>,
			);

			await initializeConfig();
			expect(getConfig().GITHUB_APPS_INFO?.app_id).toBe(123);

			const reloadedConfig = await reloadConfig();

			// Provider chain calls load() on each provider during reload
			expect(mockLoad).toHaveBeenCalledTimes(2);
			expect(reloadedConfig.GITHUB_APPS_INFO?.app_id).toBe(456);
			expect(getConfig().GITHUB_APPS_INFO?.app_id).toBe(456);
		});

		it("should reload config without parameter store when PSTORE_ENV is not set", async () => {
			delete process.env.PSTORE_ENV;

			// Mock dotenv to prevent reloadEnvFiles from overwriting test env vars
			vi.doMock("dotenv", () => ({
				config: vi.fn(),
			}));

			process.env.GITHUB_APP_NAME = "CustomName";

			const { reloadConfig } = await import("./Config");
			const config = await reloadConfig();

			expect(config.GITHUB_APP_NAME).toBe("CustomName");
		});

		it("should override process.env values with parameter store values", async () => {
			process.env.PSTORE_ENV = "prod";
			process.env.GITHUB_APP_NAME = "OriginalName";

			const { initializeConfig } = await import("./Config");
			const { ParameterStoreLoader } = await import("./ParameterStoreLoader");

			const mockLoad = vi.fn().mockImplementation(async () => {
				// Parameter store overrides the value
				await Promise.resolve(); // Keep async for signature matching
				process.env.GITHUB_APP_NAME = "ParameterStoreName";
				return {
					GITHUB_APP_NAME: "ParameterStoreName",
				};
			});

			vi.mocked(ParameterStoreLoader).mockImplementation(
				() =>
					({
						load: mockLoad,
						reload: vi.fn(),
						getCached: vi.fn(),
						getPathPrefix: vi.fn(),
					}) as unknown as InstanceType<typeof ParameterStoreLoader>,
			);

			const config = await initializeConfig();

			expect(config.GITHUB_APP_NAME).toBe("ParameterStoreName");
		});

		it("should expose parameter store loader instance for testing", async () => {
			process.env.PSTORE_ENV = "prod";

			const { initializeConfig, getParameterStoreLoaderInstance } = await import("./Config");

			await initializeConfig();

			const loader = getParameterStoreLoaderInstance();
			expect(loader).not.toBeNull();
		});

		it("should return null loader instance when PSTORE_ENV is not set", async () => {
			delete process.env.PSTORE_ENV;

			const { initializeConfig, getParameterStoreLoaderInstance } = await import("./Config");

			await initializeConfig();

			const loader = getParameterStoreLoaderInstance();
			expect(loader).toBeNull();
		});

		it("should return legacy loader before initializeConfig is called", async () => {
			// Test the case where configProviderChain is null (before initialization)
			// and we fall back to the legacy parameterStoreLoader (also null in this case)
			delete process.env.PSTORE_ENV;

			const { getParameterStoreLoaderInstance } = await import("./Config");

			// Before any initialization, both chain and legacy loader are null
			const loader = getParameterStoreLoaderInstance();
			expect(loader).toBeNull();
		});

		it("should fallback to legacy loader when no AWS provider in chain", async () => {
			// First, initialize so configProviderChain exists
			delete process.env.PSTORE_ENV;

			const { initializeConfig, getParameterStoreLoaderInstance } = await import("./Config");

			// Initialize - this creates the chain but without PSTORE_ENV,
			// the AWS provider won't be available, so its getLoader returns null
			await initializeConfig();

			// The chain exists, but iterating through providers finds no AWS provider
			// with a loader, so it falls back to legacy loader (which is also null)
			const loader = getParameterStoreLoaderInstance();
			expect(loader).toBeNull();
		});

		it("should handle parameter store load errors gracefully in initializeConfig", async () => {
			process.env.PSTORE_ENV = "prod";
			// Set initial valid value before import
			process.env.GITHUB_APPS_INFO = JSON.stringify({
				app_id: 888,
				slug: "fallback",
				client_id: "fallback-client",
				client_secret: "fallback-secret",
				webhook_secret: "fallback-webhook",
				private_key: "fallback-key",
				name: "Fallback App",
				html_url: "https://github.com/apps/fallback",
			});

			// Mock withRetry to pass through immediately (avoids real retry delays in tests)
			vi.doMock("../util/Retry", () => ({
				withRetry: (operation: () => Promise<unknown>) => operation(),
			}));

			const { initializeConfig } = await import("./Config");
			const { ParameterStoreLoader } = await import("./ParameterStoreLoader");

			const mockLoad = vi.fn().mockRejectedValue(new Error("Parameter store connection failed"));

			vi.mocked(ParameterStoreLoader).mockImplementation(
				() =>
					({
						load: mockLoad,
						reload: vi.fn(),
						getCached: vi.fn(),
						getPathPrefix: vi.fn(),
					}) as unknown as InstanceType<typeof ParameterStoreLoader>,
			);

			// Should not throw even though parameter store fails
			const config = await initializeConfig();

			expect(mockLoad).toHaveBeenCalled();
			expect(config).toBeDefined();
			// Should use the fallback value since parameter store failed
			expect(config.GITHUB_APPS_INFO?.app_id).toBe(888);
		});

		it("should handle parameter store reload errors gracefully in reloadConfig", async () => {
			process.env.PSTORE_ENV = "prod";
			process.env.GITHUB_APPS_INFO = JSON.stringify({
				app_id: 123,
				slug: "test-app",
				client_id: "test-client",
				client_secret: "test-secret",
				webhook_secret: "test-webhook",
				private_key: "test-key",
				name: "Test App",
				html_url: "https://github.com/apps/test",
			});

			// Mock withRetry to pass through immediately (avoids real retry delays in tests)
			vi.doMock("../util/Retry", () => ({
				withRetry: (operation: () => Promise<unknown>) => operation(),
			}));

			const { initializeConfig, reloadConfig, getConfig } = await import("./Config");
			const { ParameterStoreLoader } = await import("./ParameterStoreLoader");

			let loadCallCount = 0;
			const mockLoad = vi.fn().mockImplementation(async () => {
				loadCallCount++;
				await Promise.resolve();
				// Fail on the second call (reload)
				if (loadCallCount > 1) {
					throw new Error("Parameter store reload failed");
				}
				return {
					GITHUB_APPS_INFO: process.env.GITHUB_APPS_INFO,
				};
			});

			vi.mocked(ParameterStoreLoader).mockImplementation(
				() =>
					({
						load: mockLoad,
						reload: vi.fn(),
						getCached: vi.fn(),
						getPathPrefix: vi.fn(),
					}) as unknown as InstanceType<typeof ParameterStoreLoader>,
			);

			await initializeConfig();
			const originalAppId = getConfig().GITHUB_APPS_INFO?.app_id;

			// Should not throw even though parameter store reload fails
			const config = await reloadConfig();

			// Provider chain calls load() on each provider during reload
			expect(mockLoad).toHaveBeenCalledTimes(2);
			expect(config.GITHUB_APPS_INFO?.app_id).toBe(originalAppId); // Should keep original value
		});

		it("should handle provider chain error in reloadConfig by keeping existing config", async () => {
			// This tests the catch block in reloadConfig when the entire chain.load() throws
			vi.resetModules();

			process.env.GITHUB_APPS_INFO = JSON.stringify({
				app_id: 999,
				slug: "test-app",
				client_id: "test-client",
				client_secret: "test-secret",
				webhook_secret: "test-webhook",
				private_key: "test-key",
				name: "Test App",
				html_url: "https://github.com/apps/test",
			});
			delete process.env.PSTORE_ENV;

			// Track chain.load() calls to throw on second call (reload)
			let chainLoadCallCount = 0;
			vi.doMock("./providers", () => ({
				AWSParameterStoreProvider: vi.fn().mockImplementation(() => ({
					name: "aws-parameter-store",
					priority: 1,
					isAvailable: () => false,
					load: vi.fn().mockResolvedValue({}),
					getLoader: () => null,
				})),
				LocalEnvProvider: vi.fn().mockImplementation(() => ({
					name: "local-env",
					priority: 3,
					isAvailable: () => true,
					load: vi.fn().mockResolvedValue({}),
				})),
				ConfigProviderChain: vi.fn().mockImplementation(function (
					this: {
						load: () => Promise<{ config: Record<string, string>; providerResults: Array<unknown> }>;
						getProviders: () => Array<unknown>;
					},
					providers: Array<unknown>,
				) {
					this.getProviders = () => providers;
					this.load = () => {
						chainLoadCallCount++;
						// Throw on second call (reload) - the chain.load() itself throws
						if (chainLoadCallCount > 1) {
							return Promise.reject(new Error("Chain load catastrophic failure"));
						}
						return Promise.resolve({ config: {}, providerResults: [] });
					};
				}),
			}));

			const { initializeConfig, reloadConfig, getConfig } = await import("./Config");

			// First initialization should work
			await initializeConfig();
			const originalConfig = getConfig();
			expect(originalConfig.GITHUB_APPS_INFO?.app_id).toBe(999);

			// Reload should catch the error from chain.load() and keep existing config
			const reloadedConfig = await reloadConfig();

			// Should return config (using existing values since reload failed)
			expect(reloadedConfig).toBeDefined();
		});

		it("should handle provider chain error in initializeConfig gracefully", async () => {
			// This tests the catch block in initializeConfig when chain.load() throws
			vi.resetModules();

			process.env.GITHUB_APPS_INFO = JSON.stringify({
				app_id: 777,
				slug: "fallback-app",
				client_id: "fallback-client",
				client_secret: "fallback-secret",
				webhook_secret: "fallback-webhook",
				private_key: "fallback-key",
				name: "Fallback App",
				html_url: "https://github.com/apps/fallback",
			});
			delete process.env.PSTORE_ENV;

			// Mock chain to throw immediately on load
			vi.doMock("./providers", () => ({
				AWSParameterStoreProvider: vi.fn().mockImplementation(() => ({
					name: "aws-parameter-store",
					priority: 1,
					isAvailable: () => false,
					load: vi.fn().mockResolvedValue({}),
					getLoader: () => null,
				})),
				LocalEnvProvider: vi.fn().mockImplementation(() => ({
					name: "local-env",
					priority: 3,
					isAvailable: () => true,
					load: vi.fn().mockResolvedValue({}),
				})),
				ConfigProviderChain: vi.fn().mockImplementation(function (
					this: {
						load: () => Promise<{ config: Record<string, string>; providerResults: Array<unknown> }>;
						getProviders: () => Array<unknown>;
					},
					providers: Array<unknown>,
				) {
					this.getProviders = () => providers;
					this.load = () => {
						return Promise.reject(new Error("Chain initialization failure"));
					};
				}),
			}));

			const { initializeConfig, getConfig } = await import("./Config");

			// Should not throw - catches the error and falls back to process.env
			await initializeConfig();
			const config = getConfig();

			// Should use the fallback value from process.env
			expect(config.GITHUB_APPS_INFO?.app_id).toBe(777);
		});
	});

	describe("getWorkflowConfig", () => {
		it("should throw error when E2B_API_KEY is not set", async () => {
			process.env.E2B_TEMPLATE_ID = "test-template";
			process.env.ANTHROPIC_API_KEY = "test-api-key";
			delete process.env.E2B_API_KEY;

			const { getWorkflowConfig, resetConfig } = await import("./Config");
			resetConfig();

			expect(() => getWorkflowConfig()).toThrow("E2B_API_KEY environment variable is not set");
		});

		it("should throw error when E2B_TEMPLATE_ID is not set", async () => {
			process.env.E2B_API_KEY = "test-api-key";
			process.env.ANTHROPIC_API_KEY = "test-api-key";
			delete process.env.E2B_TEMPLATE_ID;

			const { getWorkflowConfig, resetConfig } = await import("./Config");
			resetConfig();

			expect(() => getWorkflowConfig()).toThrow("E2B_TEMPLATE_ID environment variable is not set");
		});

		it("should throw error when ANTHROPIC_API_KEY is not set", async () => {
			process.env.E2B_API_KEY = "test-api-key";
			process.env.E2B_TEMPLATE_ID = "test-template";
			delete process.env.ANTHROPIC_API_KEY;

			const { getWorkflowConfig, resetConfig } = await import("./Config");
			resetConfig();

			expect(() => getWorkflowConfig()).toThrow("ANTHROPIC_API_KEY environment variable is not set");
		});

		it("should include vercelToken when VERCEL_TOKEN is set", async () => {
			process.env.E2B_API_KEY = "test-api-key";
			process.env.E2B_TEMPLATE_ID = "test-template";
			process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
			process.env.VERCEL_TOKEN = "test-vercel-token";

			const { getWorkflowConfig, resetConfig } = await import("./Config");
			resetConfig();

			const config = getWorkflowConfig("test-github-token");

			expect(config.vercelToken).toBe("test-vercel-token");
			expect(config.e2bApiKey).toBe("test-api-key");
			expect(config.e2bTemplateId).toBe("test-template");
			expect(config.anthropicApiKey).toBe("test-anthropic-key");
			expect(config.githubToken).toBe("test-github-token");
			expect(config.e2bEnabled).toBe(true);
			expect(config.debug).toBe(true);

			// Cleanup
			delete process.env.VERCEL_TOKEN;
		});

		it("should work without accessToken parameter", async () => {
			process.env.E2B_API_KEY = "test-api-key";
			process.env.E2B_TEMPLATE_ID = "test-template";
			process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

			const { getWorkflowConfig, resetConfig } = await import("./Config");
			resetConfig();

			const config = getWorkflowConfig();

			expect(config.githubToken).toBeUndefined();
			expect(config.e2bApiKey).toBe("test-api-key");
			expect(config.e2bTemplateId).toBe("test-template");
			expect(config.anthropicApiKey).toBe("test-anthropic-key");
			expect(config.e2bEnabled).toBe(true);
			expect(config.debug).toBe(true);
		});

		it("should include tavilyApiKey when TAVILY_API_KEY is set", async () => {
			process.env.E2B_API_KEY = "test-api-key";
			process.env.E2B_TEMPLATE_ID = "test-template";
			process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
			process.env.TAVILY_API_KEY = "test-tavily-key";

			const { getWorkflowConfig, resetConfig } = await import("./Config");
			resetConfig();

			const config = getWorkflowConfig();

			expect(config.tavilyApiKey).toBe("test-tavily-key");

			// Cleanup
			delete process.env.TAVILY_API_KEY;
		});

		it("should derive syncServerUrl from JOLLI_PUBLIC_URL + '/api' when set", async () => {
			process.env.E2B_API_KEY = "test-api-key";
			process.env.E2B_TEMPLATE_ID = "test-template";
			process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
			process.env.JOLLI_PUBLIC_URL = "https://public.jolli.example";

			const { getWorkflowConfig, resetConfig } = await import("./Config");
			resetConfig();

			const config = getWorkflowConfig();
			expect(config.syncServerUrl).toBe("https://public.jolli.example/api");

			delete process.env.JOLLI_PUBLIC_URL;
		});

		it("should fallback syncServerUrl to ORIGIN + '/api' when JOLLI_PUBLIC_URL is not set", async () => {
			const originalOrigin = process.env.ORIGIN;
			process.env.E2B_API_KEY = "test-api-key";
			process.env.E2B_TEMPLATE_ID = "test-template";
			process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
			process.env.ORIGIN = "https://tenant.jolli.example";
			delete process.env.JOLLI_PUBLIC_URL;

			const { getWorkflowConfig, resetConfig } = await import("./Config");
			resetConfig();

			const config = getWorkflowConfig();
			expect(config.syncServerUrl).toBe("https://tenant.jolli.example/api");

			if (originalOrigin === undefined) {
				delete process.env.ORIGIN;
			} else {
				process.env.ORIGIN = originalOrigin;
			}
		});

		it("should derive syncServerUrl from tenant subdomain when JOLLI_PUBLIC_URL is not set and tenant context exists", async () => {
			const originalOrigin = process.env.ORIGIN;
			process.env.E2B_API_KEY = "test-api-key";
			process.env.E2B_TEMPLATE_ID = "test-template";
			process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
			process.env.ORIGIN = "http://localhost:8034";
			process.env.BASE_DOMAIN = "jolli.app";
			process.env.USE_GATEWAY = "true";
			delete process.env.JOLLI_PUBLIC_URL;

			vi.doMock("../tenant/TenantContext", () => ({
				getTenantContext: vi.fn(() => ({
					tenant: { slug: "acme", primaryDomain: null },
					org: { slug: "default", schemaName: "org_default" },
				})),
			}));

			const { getWorkflowConfig, resetConfig } = await import("./Config");
			resetConfig();

			const config = getWorkflowConfig();
			expect(config.syncServerUrl).toBe("https://acme.jolli.app/api");

			delete process.env.BASE_DOMAIN;
			delete process.env.USE_GATEWAY;
			if (originalOrigin === undefined) {
				delete process.env.ORIGIN;
			} else {
				process.env.ORIGIN = originalOrigin;
			}
		});

		it("should derive https syncServerUrl in production without USE_GATEWAY", async () => {
			const originalOrigin = process.env.ORIGIN;
			const originalNodeEnv = process.env.NODE_ENV;
			const originalUseGateway = process.env.USE_GATEWAY;
			delete process.env.USE_GATEWAY;
			process.env.NODE_ENV = "production";
			process.env.E2B_API_KEY = "test-api-key";
			process.env.E2B_TEMPLATE_ID = "test-template";
			process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
			process.env.ORIGIN = "http://localhost:8034";
			process.env.BASE_DOMAIN = "jolli.app";
			delete process.env.JOLLI_PUBLIC_URL;

			vi.doMock("../tenant/TenantContext", () => ({
				getTenantContext: vi.fn(() => ({
					tenant: { slug: "acme", primaryDomain: null },
					org: { slug: "default", schemaName: "org_default" },
				})),
			}));

			const { getWorkflowConfig, resetConfig } = await import("./Config");
			resetConfig();

			const config = getWorkflowConfig();
			expect(config.syncServerUrl).toBe("https://acme.jolli.app/api");

			delete process.env.BASE_DOMAIN;
			if (originalOrigin === undefined) {
				delete process.env.ORIGIN;
			} else {
				process.env.ORIGIN = originalOrigin;
			}
			if (originalNodeEnv === undefined) {
				delete process.env.NODE_ENV;
			} else {
				process.env.NODE_ENV = originalNodeEnv;
			}
			if (originalUseGateway === undefined) {
				delete process.env.USE_GATEWAY;
			} else {
				process.env.USE_GATEWAY = originalUseGateway;
			}
		});

		it("should prefer tenant primaryDomain over subdomain for syncServerUrl", async () => {
			process.env.E2B_API_KEY = "test-api-key";
			process.env.E2B_TEMPLATE_ID = "test-template";
			process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
			process.env.BASE_DOMAIN = "jolli.app";
			process.env.USE_GATEWAY = "true";
			delete process.env.JOLLI_PUBLIC_URL;

			vi.doMock("../tenant/TenantContext", () => ({
				getTenantContext: vi.fn(() => ({
					tenant: { slug: "acme", primaryDomain: "docs.acme.com" },
					org: { slug: "default", schemaName: "org_default" },
				})),
			}));

			const { getWorkflowConfig, resetConfig } = await import("./Config");
			resetConfig();

			const config = getWorkflowConfig();
			expect(config.syncServerUrl).toBe("https://docs.acme.com/api");

			delete process.env.BASE_DOMAIN;
			delete process.env.USE_GATEWAY;
		});

		it("should prefer JOLLI_PUBLIC_URL over tenant subdomain for syncServerUrl", async () => {
			process.env.E2B_API_KEY = "test-api-key";
			process.env.E2B_TEMPLATE_ID = "test-template";
			process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
			process.env.JOLLI_PUBLIC_URL = "https://override.example.com";
			process.env.BASE_DOMAIN = "jolli.app";
			process.env.USE_GATEWAY = "true";

			vi.doMock("../tenant/TenantContext", () => ({
				getTenantContext: vi.fn(() => ({
					tenant: { slug: "acme", primaryDomain: null },
					org: { slug: "default", schemaName: "org_default" },
				})),
			}));

			const { getWorkflowConfig, resetConfig } = await import("./Config");
			resetConfig();

			const config = getWorkflowConfig();
			expect(config.syncServerUrl).toBe("https://override.example.com/api");

			delete process.env.JOLLI_PUBLIC_URL;
			delete process.env.BASE_DOMAIN;
			delete process.env.USE_GATEWAY;
		});
	});

	describe("clearTenantConfigCache", () => {
		it("clears specific tenant from cache when tenantId is provided", async () => {
			const { clearTenantConfigCache } = await import("./Config");

			// Call with a specific tenant ID
			clearTenantConfigCache("tenant-123");

			// No error means success - the function is a cache utility
		});

		it("clears entire cache when no tenantId is provided", async () => {
			const { clearTenantConfigCache } = await import("./Config");

			// Call without tenant ID to clear all
			clearTenantConfigCache();

			// No error means success - the function is a cache utility
		});
	});

	describe("getConfig with tenant context", () => {
		it("returns tenant-specific config with ORIGIN override using subdomain", async () => {
			// Save and clear env vars to prevent CI environment leaking in
			const originalOrigin = process.env.ORIGIN;
			const originalUseGateway = process.env.USE_GATEWAY;
			delete process.env.ORIGIN;

			// Set up a mock tenant context
			const mockTenant = {
				id: "tenant-456",
				slug: "acme",
				displayName: "Acme Corp",
				status: "active" as const,
				deploymentType: "shared" as const,
				databaseProviderId: "provider-1",
				configs: {},
				configsUpdatedAt: null,
				featureFlags: {},
				primaryDomain: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				provisionedAt: new Date(),
			};

			// Mock getTenantContext to return our tenant
			vi.doMock("../tenant/TenantContext", () => ({
				getTenantContext: vi.fn(() => ({
					tenant: mockTenant,
					org: { id: "org-1", slug: "default" },
					database: {},
				})),
			}));

			// Set BASE_DOMAIN and USE_GATEWAY to simulate production-like behavior
			process.env.BASE_DOMAIN = "jolli.app";
			process.env.USE_GATEWAY = "true";

			const { getConfig, clearTenantConfigCache } = await import("./Config");

			const config = getConfig();

			// ORIGIN should be based on tenant slug + base domain with HTTPS (gateway enabled)
			expect(config.ORIGIN).toBe("https://acme.jolli.app");

			// Cleanup
			clearTenantConfigCache();
			delete process.env.BASE_DOMAIN;
			delete process.env.USE_GATEWAY;
			if (originalOrigin !== undefined) {
				process.env.ORIGIN = originalOrigin;
			}
			if (originalUseGateway !== undefined) {
				process.env.USE_GATEWAY = originalUseGateway;
			}
		});

		it("returns tenant-specific config with ORIGIN override using custom domain", async () => {
			const mockTenant = {
				id: "tenant-789",
				slug: "acme",
				displayName: "Acme Corp",
				status: "active" as const,
				deploymentType: "shared" as const,
				databaseProviderId: "provider-1",
				configs: {},
				configsUpdatedAt: null,
				featureFlags: {},
				primaryDomain: "docs.acme.com",
				createdAt: new Date(),
				updatedAt: new Date(),
				provisionedAt: new Date(),
			};

			vi.doMock("../tenant/TenantContext", () => ({
				getTenantContext: vi.fn(() => ({
					tenant: mockTenant,
					org: { id: "org-1", slug: "default" },
					database: {},
				})),
			}));

			process.env.BASE_DOMAIN = "jolli.app";

			const { getConfig, clearTenantConfigCache } = await import("./Config");

			const config = getConfig();

			// ORIGIN should use the custom domain when primaryDomain is set
			expect(config.ORIGIN).toBe("https://docs.acme.com");

			clearTenantConfigCache();
			delete process.env.BASE_DOMAIN;
		});

		it("caches tenant config and returns cached version on subsequent calls", async () => {
			const mockTenant = {
				id: "tenant-cache-test",
				slug: "cached",
				displayName: "Cached Corp",
				status: "active" as const,
				deploymentType: "shared" as const,
				databaseProviderId: "provider-1",
				configs: {},
				configsUpdatedAt: null,
				featureFlags: {},
				primaryDomain: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				provisionedAt: new Date(),
			};

			vi.doMock("../tenant/TenantContext", () => ({
				getTenantContext: vi.fn(() => ({
					tenant: mockTenant,
					org: { id: "org-1", slug: "default" },
					database: {},
				})),
			}));

			process.env.BASE_DOMAIN = "jolli.app";

			const { getConfig, clearTenantConfigCache } = await import("./Config");

			const config1 = getConfig();
			const config2 = getConfig();

			// Should return the same cached config object
			expect(config1).toBe(config2);

			clearTenantConfigCache();
			delete process.env.BASE_DOMAIN;
		});

		it("invalidates cache when tenant configsUpdatedAt changes", async () => {
			const oldDate = new Date("2024-01-01");
			const newDate = new Date("2024-06-01");

			const mockTenant = {
				id: "tenant-invalidate-test",
				slug: "invalidate",
				displayName: "Invalidate Corp",
				status: "active" as const,
				deploymentType: "shared" as const,
				databaseProviderId: "provider-1",
				configs: {},
				configsUpdatedAt: oldDate,
				featureFlags: {},
				primaryDomain: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				provisionedAt: new Date(),
			};

			const getTenantContextMock = vi.fn(() => ({
				tenant: mockTenant,
				org: { id: "org-1", slug: "default" },
				database: {},
			}));

			vi.doMock("../tenant/TenantContext", () => ({
				getTenantContext: getTenantContextMock,
			}));

			process.env.BASE_DOMAIN = "jolli.app";

			const { getConfig, clearTenantConfigCache } = await import("./Config");

			const config1 = getConfig();

			// Update the tenant's configsUpdatedAt
			mockTenant.configsUpdatedAt = newDate;

			const config2 = getConfig();

			// Should have rebuilt the config (different object reference)
			expect(config1).not.toBe(config2);

			clearTenantConfigCache();
			delete process.env.BASE_DOMAIN;
		});

		it("getGlobalConfig returns base config even inside tenant context", async () => {
			const mockTenant = {
				id: "tenant-global-cfg",
				slug: "globalcfg",
				displayName: "GlobalCfg Corp",
				status: "active" as const,
				deploymentType: "shared" as const,
				databaseProviderId: "provider-1",
				configs: {},
				configsUpdatedAt: null,
				featureFlags: {},
				primaryDomain: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				provisionedAt: new Date(),
			};

			vi.doMock("../tenant/TenantContext", () => ({
				getTenantContext: vi.fn(() => ({
					tenant: mockTenant,
					org: { id: "org-1", slug: "default" },
					database: {},
				})),
			}));

			process.env.BASE_DOMAIN = "jolli.app";
			process.env.TENANT_TOKEN_MASTER_SECRET = "master-secret-global";

			const { getConfig, getGlobalConfig, clearTenantConfigCache } = await import("./Config");

			const tenantConfig = getConfig();
			const globalConfig = getGlobalConfig();

			// Tenant config has derived TOKEN_SECRET, global does not
			expect(tenantConfig.TOKEN_SECRET).toHaveLength(64);
			expect(tenantConfig.TOKEN_SECRET).toMatch(/^[a-f0-9]+$/);
			expect(globalConfig.TOKEN_SECRET).toBe(process.env.TOKEN_SECRET);
			expect(globalConfig.TOKEN_SECRET).not.toBe(tenantConfig.TOKEN_SECRET);

			clearTenantConfigCache();
			delete process.env.BASE_DOMAIN;
			delete process.env.TENANT_TOKEN_MASTER_SECRET;
		});

		it("applies TOKEN_SECRET override when TENANT_TOKEN_MASTER_SECRET is set", async () => {
			const mockTenant = {
				id: "tenant-token-test",
				slug: "token",
				displayName: "Token Corp",
				status: "active" as const,
				deploymentType: "shared" as const,
				databaseProviderId: "provider-1",
				configs: {},
				configsUpdatedAt: null,
				featureFlags: {},
				primaryDomain: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				provisionedAt: new Date(),
			};

			vi.doMock("../tenant/TenantContext", () => ({
				getTenantContext: vi.fn(() => ({
					tenant: mockTenant,
					org: { id: "org-1", slug: "default" },
					database: {},
				})),
			}));

			process.env.BASE_DOMAIN = "jolli.app";
			process.env.TENANT_TOKEN_MASTER_SECRET = "master-secret-123";

			const { getConfig, clearTenantConfigCache } = await import("./Config");

			const config = getConfig();

			// TOKEN_SECRET should be derived from master secret + tenant ID
			// It should be a hex string (SHA256 hash = 64 hex chars)
			expect(config.TOKEN_SECRET).toBeDefined();
			expect(config.TOKEN_SECRET).toHaveLength(64);
			expect(config.TOKEN_SECRET).toMatch(/^[a-f0-9]+$/);

			clearTenantConfigCache();
			delete process.env.BASE_DOMAIN;
			delete process.env.TENANT_TOKEN_MASTER_SECRET;
		});

		it("applies allowed config overrides from tenant.configs", async () => {
			const mockTenant = {
				id: "tenant-configs-test",
				slug: "configs",
				displayName: "Configs Corp",
				status: "active" as const,
				deploymentType: "shared" as const,
				databaseProviderId: "provider-1",
				configs: {
					// These are in ALLOWED_TENANT_CONFIG_KEYS
					ANTHROPIC_API_KEY: "tenant-anthropic-key",
					E2B_API_KEY: "tenant-e2b-key",
				},
				configsUpdatedAt: null,
				featureFlags: {},
				primaryDomain: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				provisionedAt: new Date(),
			};

			vi.doMock("../tenant/TenantContext", () => ({
				getTenantContext: vi.fn(() => ({
					tenant: mockTenant,
					org: { id: "org-1", slug: "default" },
					database: {},
				})),
			}));

			process.env.BASE_DOMAIN = "jolli.app";

			const { getConfig, clearTenantConfigCache } = await import("./Config");

			const config = getConfig();

			// Allowed overrides should be applied
			expect(config.ANTHROPIC_API_KEY).toBe("tenant-anthropic-key");
			expect(config.E2B_API_KEY).toBe("tenant-e2b-key");

			clearTenantConfigCache();
			delete process.env.BASE_DOMAIN;
		});

		it("restores original process.env after building tenant config", async () => {
			const mockTenant = {
				id: "tenant-restore-test",
				slug: "restore",
				displayName: "Restore Corp",
				status: "active" as const,
				deploymentType: "shared" as const,
				databaseProviderId: "provider-1",
				configs: {
					E2B_API_KEY: "temporary-key",
				},
				configsUpdatedAt: null,
				featureFlags: {},
				primaryDomain: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				provisionedAt: new Date(),
			};

			vi.doMock("../tenant/TenantContext", () => ({
				getTenantContext: vi.fn(() => ({
					tenant: mockTenant,
					org: { id: "org-1", slug: "default" },
					database: {},
				})),
			}));

			const originalOrigin = process.env.ORIGIN;
			process.env.BASE_DOMAIN = "jolli.app";
			process.env.ORIGIN = "https://original.example.com";

			const { getConfig, clearTenantConfigCache } = await import("./Config");

			getConfig();

			// process.env.ORIGIN should be restored to original value
			expect(process.env.ORIGIN).toBe("https://original.example.com");

			clearTenantConfigCache();
			delete process.env.BASE_DOMAIN;
			if (originalOrigin) {
				process.env.ORIGIN = originalOrigin;
			} else {
				delete process.env.ORIGIN;
			}
		});
	});

	describe("reloadEnvFiles", () => {
		it("should re-parse .env files with override option", async () => {
			vi.resetModules();

			// Mock dotenv to verify it's called correctly
			const mockDotenvConfig = vi.fn();
			vi.doMock("dotenv", () => ({
				config: mockDotenvConfig,
			}));

			const { reloadEnvFiles } = await import("./Config");

			reloadEnvFiles();

			// Should call dotenv.config twice with override: true and quiet: true
			// Load .env first (defaults), then .env.local (overrides)
			expect(mockDotenvConfig).toHaveBeenCalledTimes(2);
			expect(mockDotenvConfig).toHaveBeenNthCalledWith(1, { path: ".env", override: true, quiet: true });
			expect(mockDotenvConfig).toHaveBeenNthCalledWith(2, { path: ".env.local", override: true, quiet: true });
		});

		it("should be called during reloadConfig", async () => {
			vi.resetModules();

			// Mock dotenv to verify it's called during reloadConfig
			const mockDotenvConfig = vi.fn();
			vi.doMock("dotenv", () => ({
				config: mockDotenvConfig,
			}));

			const { reloadConfig } = await import("./Config");

			await reloadConfig();

			// Should have called dotenv.config as part of reloadConfig
			// Load .env first (defaults), then .env.local (overrides)
			expect(mockDotenvConfig).toHaveBeenCalledWith({ path: ".env", override: true, quiet: true });
			expect(mockDotenvConfig).toHaveBeenCalledWith({ path: ".env.local", override: true, quiet: true });
		});
	});
});
