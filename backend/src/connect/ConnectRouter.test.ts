import { resetConfig } from "../config/Config";
import { runWithTenantContext, type TenantOrgContext } from "../tenant/TenantContext";
import type {
	AvailableInstallation,
	ConnectCallbackResult,
	ConnectCompleteResult,
	ConnectProvider,
} from "./ConnectProvider";
import { ConnectProviderRegistry } from "./ConnectProviderRegistry";
import { createConnectRouter, getConnectGatewayUrl, isConnectGateway } from "./ConnectRouter";
import { generateConnectCode, generateConnectState } from "./ConnectStateService";
import cookieParser from "cookie-parser";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Database
const mockDatabase = {} as TenantOrgContext["database"];

// Helper to create a mock tenant context
function createMockTenantContext(tenantSlug = "test-tenant", orgSlug = "test-org"): TenantOrgContext {
	return {
		tenant: {
			id: "1",
			slug: tenantSlug,
			displayName: "Test Tenant",
			status: "active",
			deploymentType: "shared",
			databaseProviderId: "default",
			configs: {},
			configsUpdatedAt: null,
			featureFlags: {},
			primaryDomain: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			provisionedAt: new Date(),
		},
		org: {
			id: "1",
			tenantId: "1",
			slug: orgSlug,
			displayName: "Test Org",
			schemaName: `org_${orgSlug}`,
			status: "active",
			isDefault: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		schemaName: `org_${orgSlug}`,
		database: mockDatabase,
	};
}

// Middleware to inject tenant context for tests
function tenantContextMiddleware(context: TenantOrgContext | undefined) {
	return (_req: Request, _res: Response, next: NextFunction) => {
		if (context) {
			runWithTenantContext(context, () => {
				next();
			});
		} else {
			next();
		}
	};
}

// Mock provider implementation
function createMockProvider(name: string): ConnectProvider & {
	handleCallback: ReturnType<typeof vi.fn>;
	handleComplete: ReturnType<typeof vi.fn>;
	handleWebhook: ReturnType<typeof vi.fn>;
	getSetupRedirectUrl: ReturnType<typeof vi.fn>;
	listAvailableInstallations: ReturnType<typeof vi.fn>;
	connectExistingInstallation: ReturnType<typeof vi.fn>;
} {
	const mockInstallations: Array<AvailableInstallation> = [
		{
			accountLogin: "acme-org",
			accountType: "Organization",
			installationId: 123,
			repos: ["acme-org/repo1", "acme-org/repo2"],
			alreadyConnectedToCurrentOrg: false,
		},
		{
			accountLogin: "other-org",
			accountType: "Organization",
			installationId: 456,
			repos: ["other-org/repo1"],
			alreadyConnectedToCurrentOrg: true,
		},
	];

	return {
		name,
		getSetupRedirectUrl: vi.fn().mockResolvedValue(`https://example.com/${name}/auth?state=mock`),
		handleCallback: vi.fn().mockResolvedValue({
			success: true,
			redirectUrl: "https://tenant.example.com/api/connect/github/complete?code=mock",
		} as ConnectCallbackResult),
		handleComplete: vi.fn().mockResolvedValue({
			success: true,
			redirectPath: "/integrations/github/org/test-org",
		} as ConnectCompleteResult),
		handleWebhook: vi.fn().mockResolvedValue(undefined),
		listAvailableInstallations: vi.fn().mockResolvedValue(mockInstallations),
		connectExistingInstallation: vi.fn().mockResolvedValue({
			success: true,
			redirectPath: "/integrations/github/org/acme-org?new_installation=true",
		} as ConnectCompleteResult),
	};
}

describe("ConnectRouter", () => {
	let registry: ConnectProviderRegistry;
	let mockProvider: ReturnType<typeof createMockProvider>;

	// Helper to create an app with optional tenant context
	function createApp(tenantContext?: TenantOrgContext): Express {
		const app = express();
		app.use(express.json());
		app.use(cookieParser());
		app.use(tenantContextMiddleware(tenantContext));
		app.use("/api/connect", createConnectRouter(registry, {}));
		return app;
	}

	beforeEach(() => {
		// Reset environment and config
		delete process.env.MULTI_TENANT_ENABLED;
		delete process.env.CONNECT_GATEWAY_DOMAIN;
		// Set ORIGIN, BASE_DOMAIN, and USE_GATEWAY for tests
		// The router computes redirect URLs from tenant slug + BASE_DOMAIN
		process.env.ORIGIN = "http://localhost:3000";
		process.env.BASE_DOMAIN = "example.com";
		process.env.USE_GATEWAY = "true";
		resetConfig();

		// Set up registry with mock provider
		registry = new ConnectProviderRegistry();
		mockProvider = createMockProvider("github");
		registry.register(mockProvider);

		vi.clearAllMocks();
	});

	describe("POST /:provider/setup", () => {
		it("should return 404 for unknown provider", async () => {
			const app = createApp();
			const response = await request(app).post("/api/connect/unknown/setup").send({});

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Connect provider not found: unknown" });
		});

		it("should return 400 if tenant context is not set", async () => {
			const app = createApp(); // No tenant context
			const response = await request(app).post("/api/connect/github/setup").send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Tenant context required for connect setup" });
		});

		it("should return redirect URL with tenant context", async () => {
			const app = createApp(createMockTenantContext());
			const response = await request(app).post("/api/connect/github/setup").send({});

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty("redirectUrl");
			// The returnTo defaults to getConfig().ORIGIN which is tenant-scoped
			expect(mockProvider.getSetupRedirectUrl).toHaveBeenCalledWith(
				"test-tenant",
				"test-org",
				expect.any(String), // Origin from config (tenant-scoped)
				undefined,
			);
		});

		it("should use custom returnTo if provided", async () => {
			const app = createApp(createMockTenantContext());
			const response = await request(app).post("/api/connect/github/setup").send({
				returnTo: "https://custom.example.com",
			});

			expect(response.status).toBe(200);
			expect(mockProvider.getSetupRedirectUrl).toHaveBeenCalledWith(
				"test-tenant",
				"test-org",
				"https://custom.example.com",
				undefined,
			);
		});

		it("should pass options to provider", async () => {
			const app = createApp(createMockTenantContext());
			const response = await request(app)
				.post("/api/connect/github/setup")
				.send({
					options: { feature: "custom" },
				});

			expect(response.status).toBe(200);
			// The returnTo defaults to getConfig().ORIGIN which is tenant-scoped
			expect(mockProvider.getSetupRedirectUrl).toHaveBeenCalledWith(
				"test-tenant",
				"test-org",
				expect.any(String), // Origin from config (tenant-scoped)
				{ feature: "custom" },
			);
		});

		it("should return 500 on provider error", async () => {
			const app = createApp(createMockTenantContext());
			mockProvider.getSetupRedirectUrl.mockRejectedValueOnce(new Error("Provider error"));

			const response = await request(app).post("/api/connect/github/setup").send({});

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to generate connect redirect URL" });
		});
	});

	describe("GET /:provider/callback", () => {
		beforeEach(() => {
			// Set up encryption keys for state validation
			process.env.GITHUB_CONNECT_ENCRYPTION_KEY = Buffer.from("12345678901234567890123456789012").toString(
				"base64",
			);
			process.env.GITHUB_CONNECT_SIGNING_KEY = "test-signing-key-for-github-connect";
			resetConfig();
		});

		it("should redirect to error for unknown provider", async () => {
			const app = createApp();
			const response = await request(app).get("/api/connect/unknown/callback?state=test");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("http://localhost:3000/?error=unknown_provider");
		});

		it("should redirect to error for missing state", async () => {
			const app = createApp();
			const response = await request(app).get("/api/connect/github/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("http://localhost:3000/?error=missing_state");
		});

		it("should redirect to error for invalid state", async () => {
			const app = createApp();
			const response = await request(app).get("/api/connect/github/callback?state=invalid-state");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("http://localhost:3000/?error=invalid_state");
		});

		it("should redirect to error for provider mismatch", async () => {
			// Try to use GitHub state on the callback for GitHub but with a different provider name in state
			// We'll test by sending a valid GitHub state to an endpoint that expects provider validation
			// Actually, we need to test that when the state says "gitlab" but endpoint is "github", it fails

			// Set up GitLab keys so we can generate a GitLab state
			process.env.GITLAB_CONNECT_ENCRYPTION_KEY = Buffer.from("12345678901234567890123456789012").toString(
				"base64",
			);
			process.env.GITLAB_CONNECT_SIGNING_KEY = "test-signing-key-for-gitlab-connect";
			// Keep GitHub keys too
			process.env.GITHUB_CONNECT_ENCRYPTION_KEY = Buffer.from("12345678901234567890123456789012").toString(
				"base64",
			);
			process.env.GITHUB_CONNECT_SIGNING_KEY = "test-signing-key-for-github-connect";
			resetConfig();

			const gitlabProvider = createMockProvider("gitlab");
			registry.register(gitlabProvider);

			// Generate a state for GitLab
			const state = generateConnectState("gitlab", "test-tenant", "test-org", "https://tenant.example.com");

			// But call the GitHub callback endpoint
			const app = createApp();
			const response = await request(app).get(`/api/connect/github/callback?state=${state}`);

			// Should fail because state says "gitlab" but endpoint is for "github"
			expect(response.status).toBe(302);
			// The state will be validated successfully (because we try all providers),
			// but then the provider mismatch check will fail
			expect(response.headers.location).toBe("https://tenant.example.com/?error=provider_mismatch");
		});

		it("should handle valid callback and redirect", async () => {
			const state = generateConnectState("github", "test-tenant", "test-org", "https://tenant.example.com");

			const app = createApp();
			const response = await request(app).get(`/api/connect/github/callback?state=${state}`);

			expect(response.status).toBe(302);
			expect(mockProvider.handleCallback).toHaveBeenCalled();
			expect(response.headers.location).toBe("https://tenant.example.com/api/connect/github/complete?code=mock");
		});

		it("should redirect to error on callback exception", async () => {
			const state = generateConnectState("github", "test-tenant", "test-org", "https://tenant.example.com");
			mockProvider.handleCallback.mockRejectedValueOnce(new Error("Callback error"));

			const app = createApp();
			const response = await request(app).get(`/api/connect/github/callback?state=${state}`);

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("http://localhost:3000/?error=callback_failed");
		});
	});

	describe("GET /:provider/complete", () => {
		beforeEach(() => {
			// Set up encryption keys for code validation
			process.env.GITHUB_CONNECT_ENCRYPTION_KEY = Buffer.from("12345678901234567890123456789012").toString(
				"base64",
			);
			process.env.GITHUB_CONNECT_SIGNING_KEY = "test-signing-key-for-github-connect";
			resetConfig();
		});

		it("should redirect to error for unknown provider", async () => {
			const app = createApp(createMockTenantContext());
			const response = await request(app).get("/api/connect/unknown/complete?code=test");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/?error=unknown_provider");
		});

		it("should redirect to error for missing code", async () => {
			const app = createApp(createMockTenantContext());
			const response = await request(app).get("/api/connect/github/complete");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/?error=missing_code");
		});

		it("should redirect to error for invalid code", async () => {
			const app = createApp(createMockTenantContext());
			const response = await request(app).get("/api/connect/github/complete?code=invalid-code");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/?error=invalid_code");
		});

		it("should redirect to error for tenant mismatch", async () => {
			const code = generateConnectCode("github", "other-tenant", "other-org", { data: "test" });
			const app = createApp(createMockTenantContext());

			const response = await request(app).get(`/api/connect/github/complete?code=${code}`);

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/?error=tenant_mismatch");
		});

		it("should handle valid complete and redirect to success path", async () => {
			const code = generateConnectCode("github", "test-tenant", "test-org", { installationId: 123 });
			const app = createApp(createMockTenantContext());

			const response = await request(app).get(`/api/connect/github/complete?code=${code}`);

			expect(response.status).toBe(302);
			expect(mockProvider.handleComplete).toHaveBeenCalledWith(
				{ installationId: 123 },
				expect.objectContaining({
					tenant: expect.objectContaining({ slug: "test-tenant" }),
					org: expect.objectContaining({ slug: "test-org" }),
				}),
			);
			expect(response.headers.location).toBe("/integrations/github/org/test-org");
		});

		it("should handle org mismatch with warning but continue", async () => {
			const code = generateConnectCode("github", "test-tenant", "different-org", { installationId: 123 });
			const app = createApp(createMockTenantContext());

			const response = await request(app).get(`/api/connect/github/complete?code=${code}`);

			// Should still succeed despite org mismatch (warning only)
			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/integrations/github/org/test-org");
		});

		it("should redirect to error on failed completion", async () => {
			const code = generateConnectCode("github", "test-tenant", "test-org", { installationId: 123 });
			const app = createApp(createMockTenantContext());

			mockProvider.handleComplete.mockResolvedValueOnce({
				success: false,
				error: "installation_failed",
			});

			const response = await request(app).get(`/api/connect/github/complete?code=${code}`);

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/?error=installation_failed");
		});

		it("should redirect to error on exception", async () => {
			const code = generateConnectCode("github", "test-tenant", "test-org", { installationId: 123 });
			const app = createApp(createMockTenantContext());

			mockProvider.handleComplete.mockRejectedValueOnce(new Error("Complete error"));

			const response = await request(app).get(`/api/connect/github/complete?code=${code}`);

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/?error=complete_failed");
		});
	});

	describe("POST /:provider/list-available", () => {
		it("should return 404 for unknown provider", async () => {
			const app = createApp();
			const response = await request(app).post("/api/connect/unknown/list-available").send({});

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Connect provider not found: unknown" });
		});

		it("should return 404 if provider does not support listing", async () => {
			const noListProvider = createMockProvider("no-list");
			noListProvider.listAvailableInstallations = undefined as unknown as ReturnType<typeof vi.fn>;
			registry.register(noListProvider);

			const app = createApp(createMockTenantContext());
			const response = await request(app).post("/api/connect/no-list/list-available").send({});

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Provider does not support listing available installations" });
		});

		it("should return 400 if tenant context is not set", async () => {
			const app = createApp(); // No tenant context
			const response = await request(app).post("/api/connect/github/list-available").send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Tenant context required" });
		});

		it("should return list of available installations", async () => {
			const app = createApp(createMockTenantContext());
			const response = await request(app).post("/api/connect/github/list-available").send({});

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty("installations");
			expect(response.body.installations).toHaveLength(2);
			expect(response.body.installations[0]).toEqual({
				accountLogin: "acme-org",
				accountType: "Organization",
				installationId: 123,
				repos: ["acme-org/repo1", "acme-org/repo2"],
				alreadyConnectedToCurrentOrg: false,
			});
			expect(mockProvider.listAvailableInstallations).toHaveBeenCalledWith(
				"", // accessToken defaults to empty string
				expect.objectContaining({
					tenant: expect.objectContaining({ slug: "test-tenant" }),
					org: expect.objectContaining({ slug: "test-org" }),
				}),
			);
		});

		it("should pass accessToken if provided", async () => {
			const app = createApp(createMockTenantContext());
			const response = await request(app).post("/api/connect/github/list-available").send({
				accessToken: "user-oauth-token",
			});

			expect(response.status).toBe(200);
			expect(mockProvider.listAvailableInstallations).toHaveBeenCalledWith(
				"user-oauth-token",
				expect.any(Object),
			);
		});

		it("should return 500 on provider error", async () => {
			const app = createApp(createMockTenantContext());
			mockProvider.listAvailableInstallations.mockRejectedValueOnce(new Error("Provider error"));

			const response = await request(app).post("/api/connect/github/list-available").send({});

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to list available installations" });
		});

		it("should return 500 on non-Error rejection", async () => {
			const app = createApp(createMockTenantContext());
			mockProvider.listAvailableInstallations.mockRejectedValueOnce("string error");

			const response = await request(app).post("/api/connect/github/list-available").send({});

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to list available installations" });
		});
	});

	describe("POST /:provider/connect-existing", () => {
		it("should return 404 for unknown provider", async () => {
			const app = createApp();
			const response = await request(app)
				.post("/api/connect/unknown/connect-existing")
				.send({ installationId: 123 });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Connect provider not found: unknown" });
		});

		it("should return 404 if provider does not support connecting existing", async () => {
			const noConnectProvider = createMockProvider("no-connect");
			noConnectProvider.connectExistingInstallation = undefined as unknown as ReturnType<typeof vi.fn>;
			registry.register(noConnectProvider);

			const app = createApp(createMockTenantContext());
			const response = await request(app)
				.post("/api/connect/no-connect/connect-existing")
				.send({ installationId: 123 });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Provider does not support connecting existing installations" });
		});

		it("should return 400 if tenant context is not set", async () => {
			const app = createApp(); // No tenant context
			const response = await request(app)
				.post("/api/connect/github/connect-existing")
				.send({ installationId: 123 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Tenant context required" });
		});

		it("should return 400 if installationId is missing", async () => {
			const app = createApp(createMockTenantContext());
			const response = await request(app).post("/api/connect/github/connect-existing").send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "installationId is required and must be a number" });
		});

		it("should return 400 if installationId is not a number", async () => {
			const app = createApp(createMockTenantContext());
			const response = await request(app)
				.post("/api/connect/github/connect-existing")
				.send({ installationId: "abc" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "installationId is required and must be a number" });
		});

		it("should connect existing installation and return success with full redirect URL", async () => {
			const app = createApp(createMockTenantContext());
			const response = await request(app)
				.post("/api/connect/github/connect-existing")
				.send({ installationId: 123 });

			expect(response.status).toBe(200);
			// ORIGIN is computed from tenant context: https://{tenantSlug}.{BASE_DOMAIN}
			expect(response.body).toEqual({
				success: true,
				redirectUrl: "https://test-tenant.example.com/integrations/github/org/acme-org?new_installation=true",
			});
			expect(mockProvider.connectExistingInstallation).toHaveBeenCalledWith(
				123,
				expect.objectContaining({
					tenant: expect.objectContaining({ slug: "test-tenant" }),
					org: expect.objectContaining({ slug: "test-org" }),
				}),
			);
		});

		it("should return error when connection fails", async () => {
			const app = createApp(createMockTenantContext());
			mockProvider.connectExistingInstallation.mockResolvedValueOnce({
				success: false,
				error: "installation_not_found",
			});

			const response = await request(app)
				.post("/api/connect/github/connect-existing")
				.send({ installationId: 999 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				success: false,
				error: "installation_not_found",
			});
		});

		it("should return 500 on provider error", async () => {
			const app = createApp(createMockTenantContext());
			mockProvider.connectExistingInstallation.mockRejectedValueOnce(new Error("Provider error"));

			const response = await request(app)
				.post("/api/connect/github/connect-existing")
				.send({ installationId: 123 });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to connect existing installation" });
		});
	});

	describe("POST /:provider/webhook", () => {
		it("should return 404 for unknown provider", async () => {
			const app = createApp();
			const response = await request(app).post("/api/connect/unknown/webhook").send({ data: "test" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Unknown provider" });
		});

		it("should return 404 if provider does not support webhooks", async () => {
			const noWebhookProvider = createMockProvider("no-webhook");
			noWebhookProvider.handleWebhook = undefined as unknown as ReturnType<typeof vi.fn>;
			registry.register(noWebhookProvider);

			const app = createApp();
			const response = await request(app).post("/api/connect/no-webhook/webhook").send({ data: "test" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Webhooks not supported" });
		});

		it("should call provider webhook handler", async () => {
			const app = createApp();
			const response = await request(app).post("/api/connect/github/webhook").send({ event: "push" });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(mockProvider.handleWebhook).toHaveBeenCalled();
		});

		it("should return 500 on webhook error", async () => {
			mockProvider.handleWebhook.mockRejectedValueOnce(new Error("Webhook error"));

			const app = createApp();
			const response = await request(app).post("/api/connect/github/webhook").send({ event: "push" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Webhook processing failed" });
		});
	});
});

describe("isConnectGateway", () => {
	beforeEach(() => {
		delete process.env.BASE_DOMAIN;
		delete process.env.CONNECT_GATEWAY_DOMAIN;
		resetConfig();
	});

	it("should return false when BASE_DOMAIN is not set", () => {
		expect(isConnectGateway("connect.example.com")).toBe(false);
	});

	it("should return true for default connect gateway domain", () => {
		process.env.BASE_DOMAIN = "example.com";
		resetConfig();

		expect(isConnectGateway("connect.example.com")).toBe(true);
	});

	it("should return false for non-gateway domain", () => {
		process.env.BASE_DOMAIN = "example.com";
		resetConfig();

		expect(isConnectGateway("tenant.example.com")).toBe(false);
	});

	it("should handle custom connect gateway domain", () => {
		process.env.BASE_DOMAIN = "example.com";
		process.env.CONNECT_GATEWAY_DOMAIN = "custom-connect.example.com";
		resetConfig();

		expect(isConnectGateway("custom-connect.example.com")).toBe(true);
		expect(isConnectGateway("connect.example.com")).toBe(false);
	});

	it("should handle host with port", () => {
		process.env.BASE_DOMAIN = "example.com";
		resetConfig();

		expect(isConnectGateway("connect.example.com:3000")).toBe(true);
	});
});

describe("getConnectGatewayUrl", () => {
	beforeEach(() => {
		delete process.env.BASE_DOMAIN;
		delete process.env.CONNECT_GATEWAY_DOMAIN;
		delete process.env.USE_GATEWAY;
		delete process.env.ORIGIN;
		resetConfig();
	});

	it("should return origin when BASE_DOMAIN is not set", () => {
		process.env.ORIGIN = "http://localhost:3000";
		resetConfig();

		expect(getConnectGatewayUrl()).toBe("http://localhost:3000");
	});

	it("should return https URL when USE_GATEWAY is true", () => {
		process.env.BASE_DOMAIN = "jolli.ai";
		process.env.USE_GATEWAY = "true";
		resetConfig();

		expect(getConnectGatewayUrl()).toBe("https://connect.jolli.ai");
	});

	it("should return http URL when USE_GATEWAY is false", () => {
		process.env.BASE_DOMAIN = "jolli.ai";
		process.env.USE_GATEWAY = "false";
		resetConfig();

		expect(getConnectGatewayUrl()).toBe("http://connect.jolli.ai");
	});

	it("should use custom CONNECT_GATEWAY_DOMAIN", () => {
		process.env.BASE_DOMAIN = "jolli.ai";
		process.env.CONNECT_GATEWAY_DOMAIN = "connect-custom.jolli.ai";
		process.env.USE_GATEWAY = "true";
		resetConfig();

		expect(getConnectGatewayUrl()).toBe("https://connect-custom.jolli.ai");
	});
});
