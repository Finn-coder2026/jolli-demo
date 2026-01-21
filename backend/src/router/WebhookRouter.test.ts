import * as ConfigModule from "../config/Config";
import type { JobEventEmitter } from "../jobs/JobEventEmitter";
import type { MultiTenantJobSchedulerManager } from "../jobs/MultiTenantJobSchedulerManager";
import type { TenantOrgJobScheduler } from "../jobs/TenantOrgJobScheduler";
import * as GitHubAppModel from "../model/GitHubApp";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { createWebhookRouter } from "./WebhookRouter";
import crypto from "node:crypto";
import express, { type Express } from "express";
import type { Org, Tenant } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("WebhookRouter", () => {
	let app: Express;
	let mockEventEmitter: JobEventEmitter;

	const webhookSecret = "test-webhook-secret-123";

	// Helper function to generate valid GitHub webhook signature
	function generateSignature(payload: string): string {
		const hmac = crypto.createHmac("sha256", webhookSecret);
		hmac.update(payload);
		return `sha256=${hmac.digest("hex")}`;
	}

	// Helper function to send a webhook request with proper signature
	// biome-ignore lint/suspicious/useAwait: Returns a Promise from the request library
	async function sendWebhook(payload: object, event: string, delivery = "12345-67890"): Promise<request.Response> {
		const payloadString = JSON.stringify(payload);
		const signature = generateSignature(payloadString);

		return request(app)
			.post("/webhooks/github")
			.set("X-GitHub-Event", event)
			.set("X-GitHub-Delivery", delivery)
			.set("X-Hub-Signature-256", signature)
			.set("Content-Type", "application/json")
			.send(payloadString);
	}

	beforeEach(() => {
		vi.restoreAllMocks();

		// Create a mock event emitter
		mockEventEmitter = {
			emit: vi.fn(),
			on: vi.fn(),
			off: vi.fn(),
			removeAllListeners: vi.fn(),
		};

		// Mock getCoreJolliGithubApp to return a test configuration
		vi.spyOn(GitHubAppModel, "getCoreJolliGithubApp").mockReturnValue({
			appId: 12345,
			slug: "test-app",
			clientId: "test-client-id",
			clientSecret: "test-client-secret",
			webhookSecret,
			privateKey: "test-private-key",
			name: "Test App",
			htmlUrl: "https://github.com/apps/test-app",
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		app = express();
		app.use("/webhooks", createWebhookRouter(mockEventEmitter));
	});

	describe("POST /github", () => {
		it("should reject webhook with invalid signature", async () => {
			const webhookPayload = {
				action: "opened",
				pull_request: {
					id: 123,
					title: "Test PR",
				},
			};

			const payloadString = JSON.stringify(webhookPayload);

			const response = await request(app)
				.post("/webhooks/github")
				.set("X-GitHub-Event", "pull_request")
				.set("X-GitHub-Delivery", "12345-67890")
				.set("X-Hub-Signature-256", "sha256=invalid-signature")
				.set("Content-Type", "application/json")
				.send(payloadString);

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Invalid signature" });
		});

		it("should reject webhook with missing signature", async () => {
			const webhookPayload = {
				action: "opened",
				pull_request: {
					id: 123,
					title: "Test PR",
				},
			};

			const payloadString = JSON.stringify(webhookPayload);

			const response = await request(app)
				.post("/webhooks/github")
				.set("X-GitHub-Event", "pull_request")
				.set("X-GitHub-Delivery", "12345-67890")
				.set("Content-Type", "application/json")
				.send(payloadString);

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Invalid signature" });
		});

		it("should accept GitHub webhook with valid signature and return 200", async () => {
			const webhookPayload = {
				action: "opened",
				pull_request: {
					id: 123,
					title: "Test PR",
				},
				repository: {
					name: "test-repo",
					owner: {
						login: "test-owner",
					},
				},
			};

			const payloadString = JSON.stringify(webhookPayload);
			const signature = generateSignature(payloadString);

			const response = await request(app)
				.post("/webhooks/github")
				.set("X-GitHub-Event", "pull_request")
				.set("X-GitHub-Delivery", "12345-67890")
				.set("X-Hub-Signature-256", signature)
				.set("Content-Type", "application/json")
				.send(payloadString);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ received: true });
		});

		it("should handle push events with valid signature", async () => {
			const webhookPayload = {
				ref: "refs/heads/main",
				before: "abc123old",
				after: "abc123new",
				commits: [
					{
						id: "abc123",
						message: "test commit",
					},
				],
				repository: {
					id: 123,
					name: "test-repo",
					full_name: "owner/test-repo",
				},
				sender: {
					login: "testuser",
					id: 456,
				},
			};

			const payloadString = JSON.stringify(webhookPayload);
			const signature = generateSignature(payloadString);

			const response = await request(app)
				.post("/webhooks/github")
				.set("X-GitHub-Event", "push")
				.set("X-GitHub-Delivery", "12345-67890")
				.set("X-Hub-Signature-256", signature)
				.set("Content-Type", "application/json")
				.send(payloadString);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ received: true });
		});

		it("should emit event for push", async () => {
			const webhookPayload = {
				ref: "refs/heads/main",
				before: "abc123old",
				after: "abc123new",
				commits: [
					{
						id: "abc123",
						message: "test commit",
					},
				],
				repository: {
					id: 123,
					name: "test-repo",
					full_name: "owner/test-repo",
				},
				sender: {
					login: "testuser",
					id: 456,
				},
			};

			const response = await sendWebhook(webhookPayload, "push", "12345");

			expect(response.status).toBe(200);
			expect(mockEventEmitter.emit).toHaveBeenCalledWith("github:push", webhookPayload);
		});

		it("should reject malformed data with valid signature but return 200", async () => {
			// The webhook router is designed to be resilient and log errors
			// It still returns 200 to acknowledge receipt if signature is valid
			const webhookPayload = { invalid: "data" };
			const payloadString = JSON.stringify(webhookPayload);
			const signature = generateSignature(payloadString);

			const response = await request(app)
				.post("/webhooks/github")
				.set("X-GitHub-Event", "malformed")
				.set("X-GitHub-Delivery", "12345")
				.set("X-Hub-Signature-256", signature)
				.set("Content-Type", "application/json")
				.send(payloadString);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ received: true });
		});

		it("should have correct content-type header with valid signature", async () => {
			const webhookPayload = {};
			const payloadString = JSON.stringify(webhookPayload);
			const signature = generateSignature(payloadString);

			const response = await request(app)
				.post("/webhooks/github")
				.set("X-GitHub-Event", "ping")
				.set("X-GitHub-Delivery", "12345")
				.set("X-Hub-Signature-256", signature)
				.set("Content-Type", "application/json")
				.send(payloadString);

			expect(response.headers["content-type"]).toMatch(/json/);
		});

		it("should return 400 when raw body is missing", async () => {
			// Create a custom app without the rawBody middleware
			const customApp = express();
			customApp.use(express.json()); // Regular JSON parser without rawBody capture
			customApp.use("/webhooks", createWebhookRouter(mockEventEmitter));

			const webhookPayload = { test: "data" };
			const payloadString = JSON.stringify(webhookPayload);

			const response = await request(customApp)
				.post("/webhooks/github")
				.set("X-GitHub-Event", "push")
				.set("X-GitHub-Delivery", "12345")
				.set("X-Hub-Signature-256", "sha256=any-signature")
				.set("Content-Type", "application/json")
				.send(payloadString);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid request body" });
		});

		it("should return 500 when GitHub App is not configured", async () => {
			// Mock getCoreJolliGithubApp to return null (GitHub App not configured)
			vi.spyOn(GitHubAppModel, "getCoreJolliGithubApp").mockReturnValue(
				null as unknown as GitHubAppModel.GitHubApp,
			);

			// Recreate the app with the new mock
			const testApp = express();
			testApp.use("/webhooks", createWebhookRouter(mockEventEmitter));

			const webhookPayload = { test: "data" };
			const payloadString = JSON.stringify(webhookPayload);

			const response = await request(testApp)
				.post("/webhooks/github")
				.set("X-GitHub-Event", "push")
				.set("X-GitHub-Delivery", "12345")
				.set("X-Hub-Signature-256", "sha256=any-signature")
				.set("Content-Type", "application/json")
				.send(payloadString);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "GitHub App not configured" });
		});

		it("should handle internal errors and return 500", async () => {
			// Mock emit to throw an error
			mockEventEmitter.emit = vi.fn().mockImplementation(() => {
				throw new Error("Event emission error");
			});

			const webhookPayload = {
				action: "created",
				installation: {
					id: 67890,
					app_id: 12345,
				},
				repositories: [],
			};

			const response = await sendWebhook(webhookPayload, "installation", "12345");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to process webhook" });
		});

		it("should emit event for installation.created", async () => {
			const webhookPayload = {
				action: "created",
				installation: {
					id: 67890,
					app_id: 12345,
				},
				repositories: [
					{
						full_name: "owner/repo1",
						default_branch: "main",
					},
					{
						full_name: "owner/repo2",
						default_branch: "develop",
					},
				],
			};

			const response = await sendWebhook(webhookPayload, "installation", "12345");

			expect(response.status).toBe(200);
			expect(mockEventEmitter.emit).toHaveBeenCalledWith("github:installation:created", webhookPayload);
		});

		it("should emit event for installation_repositories.added", async () => {
			const webhookPayload = {
				action: "added",
				installation: {
					id: 67890,
					app_id: 12345,
				},
				repositories_added: [
					{
						full_name: "owner/repo3",
						default_branch: "main",
					},
				],
			};

			const response = await sendWebhook(webhookPayload, "installation_repositories", "12345");

			expect(response.status).toBe(200);
			expect(mockEventEmitter.emit).toHaveBeenCalledWith(
				"github:installation_repositories:added",
				webhookPayload,
			);
		});

		it("should emit event for installation.deleted", async () => {
			const webhookPayload = {
				action: "deleted",
				installation: {
					id: 67890,
					app_id: 12345,
				},
			};

			const response = await sendWebhook(webhookPayload, "installation", "12345");

			expect(response.status).toBe(200);
			expect(mockEventEmitter.emit).toHaveBeenCalledWith("github:installation:deleted", webhookPayload);
		});

		it("should emit event for installation_repositories.removed", async () => {
			const webhookPayload = {
				action: "removed",
				installation: {
					id: 67890,
					app_id: 12345,
				},
				repositories_removed: [
					{
						full_name: "owner/repo1",
					},
				],
			};

			const response = await sendWebhook(webhookPayload, "installation_repositories", "12345");

			expect(response.status).toBe(200);
			expect(mockEventEmitter.emit).toHaveBeenCalledWith(
				"github:installation_repositories:removed",
				webhookPayload,
			);
		});

		it("should not emit events for unhandled webhook types", async () => {
			const webhookPayload = {
				action: "synchronize",
				pull_request: {
					id: 123,
					title: "Test PR",
				},
			};

			const response = await sendWebhook(webhookPayload, "pull_request", "12345");

			expect(response.status).toBe(200);
			expect(mockEventEmitter.emit).not.toHaveBeenCalled();
		});
	});

	describe("multi-tenant routing", () => {
		let mockRegistryClient: TenantRegistryClient;
		let mockSchedulerManager: MultiTenantJobSchedulerManager;
		let mockTenantEventEmitter: JobEventEmitter;
		let multiTenantApp: Express;

		const mockTenant: Tenant = {
			id: "tenant-123",
			slug: "test-tenant",
			displayName: "Test Tenant",
			status: "active",
			deploymentType: "shared",
			databaseProviderId: "provider-123",
			configs: {},
			configsUpdatedAt: null,
			featureFlags: {},
			primaryDomain: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			provisionedAt: new Date(),
		};

		const mockOrg: Org = {
			id: "org-123",
			tenantId: "tenant-123",
			slug: "default",
			displayName: "Default Org",
			schemaName: "org_default",
			status: "active",
			isDefault: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		beforeEach(() => {
			// Create tenant-specific event emitter
			mockTenantEventEmitter = {
				emit: vi.fn(),
				on: vi.fn(),
				off: vi.fn(),
				removeAllListeners: vi.fn(),
			};

			// Mock registry client
			mockRegistryClient = {
				getTenantOrgByInstallationId: vi.fn(),
				createInstallationMapping: vi.fn(),
				deleteInstallationMapping: vi.fn(),
			} as unknown as TenantRegistryClient;

			// Mock scheduler manager
			const mockScheduler = {
				getEventEmitter: vi.fn().mockReturnValue(mockTenantEventEmitter),
			};
			const mockTenantOrgScheduler: TenantOrgJobScheduler = {
				tenant: mockTenant,
				org: mockOrg,
				scheduler: mockScheduler,
			} as unknown as TenantOrgJobScheduler;

			mockSchedulerManager = {
				getScheduler: vi.fn().mockResolvedValue(mockTenantOrgScheduler),
			} as unknown as MultiTenantJobSchedulerManager;

			// Mock multi-tenant enabled config
			vi.spyOn(ConfigModule, "getConfig").mockReturnValue({
				MULTI_TENANT_ENABLED: true,
			} as unknown as ReturnType<typeof ConfigModule.getConfig>);

			// Create app with multi-tenant dependencies
			multiTenantApp = express();
			multiTenantApp.use(
				"/webhooks",
				createWebhookRouter(mockEventEmitter, {
					registryClient: mockRegistryClient,
					schedulerManager: mockSchedulerManager,
				}),
			);
		});

		// Helper function to send a webhook request with proper signature
		// biome-ignore lint/suspicious/useAwait: Returns a Promise from the request library
		async function sendMultiTenantWebhook(
			payload: object,
			event: string,
			delivery = "12345-67890",
		): Promise<request.Response> {
			const payloadString = JSON.stringify(payload);
			const hmac = crypto.createHmac("sha256", webhookSecret);
			hmac.update(payloadString);
			const signature = `sha256=${hmac.digest("hex")}`;

			return request(multiTenantApp)
				.post("/webhooks/github")
				.set("X-GitHub-Event", event)
				.set("X-GitHub-Delivery", delivery)
				.set("X-Hub-Signature-256", signature)
				.set("Content-Type", "application/json")
				.send(payloadString);
		}

		it("should route webhook to tenant's event emitter when mapping exists", async () => {
			// Setup: installation mapping exists
			vi.mocked(mockRegistryClient.getTenantOrgByInstallationId).mockResolvedValue({
				tenant: mockTenant,
				org: mockOrg,
			});

			const webhookPayload = {
				action: "created",
				installation: {
					id: 67890,
					app_id: 12345,
				},
				repositories: [],
			};

			const response = await sendMultiTenantWebhook(webhookPayload, "installation", "12345");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ received: true });
			expect(mockRegistryClient.getTenantOrgByInstallationId).toHaveBeenCalledWith(67890);
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledWith(mockTenant, mockOrg);
			expect(mockTenantEventEmitter.emit).toHaveBeenCalledWith("github:installation:created", webhookPayload);
			// Shared emitter should NOT be called
			expect(mockEventEmitter.emit).not.toHaveBeenCalled();
		});

		it("should return warning when webhook has no installation ID", async () => {
			const webhookPayload = {
				action: "created",
				// No installation field
			};

			const response = await sendMultiTenantWebhook(webhookPayload, "installation", "12345");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ received: true, warning: "no_installation_id" });
			expect(mockRegistryClient.getTenantOrgByInstallationId).not.toHaveBeenCalled();
		});

		it("should return warning when installation is not mapped to a tenant", async () => {
			// Setup: no mapping found
			vi.mocked(mockRegistryClient.getTenantOrgByInstallationId).mockResolvedValue(undefined);

			const webhookPayload = {
				action: "created",
				installation: {
					id: 99999, // Unknown installation
					app_id: 12345,
				},
				repositories: [],
			};

			const response = await sendMultiTenantWebhook(webhookPayload, "installation", "12345");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ received: true, warning: "installation_not_mapped" });
			expect(mockRegistryClient.getTenantOrgByInstallationId).toHaveBeenCalledWith(99999);
			expect(mockSchedulerManager.getScheduler).not.toHaveBeenCalled();
		});

		it("should return 500 when scheduler lookup fails", async () => {
			// Setup: mapping exists but scheduler fails
			vi.mocked(mockRegistryClient.getTenantOrgByInstallationId).mockResolvedValue({
				tenant: mockTenant,
				org: mockOrg,
			});
			vi.mocked(mockSchedulerManager.getScheduler).mockRejectedValue(new Error("Scheduler error"));

			const webhookPayload = {
				action: "created",
				installation: {
					id: 67890,
					app_id: 12345,
				},
				repositories: [],
			};

			const response = await sendMultiTenantWebhook(webhookPayload, "installation", "12345");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to find tenant for webhook" });
			// Should NOT emit to any emitter
			expect(mockEventEmitter.emit).not.toHaveBeenCalled();
			expect(mockTenantEventEmitter.emit).not.toHaveBeenCalled();
		});

		it("should use shared emitter in single-tenant mode", async () => {
			// Mock single-tenant mode
			vi.spyOn(ConfigModule, "getConfig").mockReturnValue({
				MULTI_TENANT_ENABLED: false,
			} as unknown as ReturnType<typeof ConfigModule.getConfig>);

			// Recreate app with single-tenant mode config
			const singleTenantApp = express();
			singleTenantApp.use(
				"/webhooks",
				createWebhookRouter(mockEventEmitter, {
					registryClient: mockRegistryClient,
					schedulerManager: mockSchedulerManager,
				}),
			);

			const webhookPayload = {
				action: "created",
				installation: {
					id: 67890,
					app_id: 12345,
				},
				repositories: [],
			};

			const payloadString = JSON.stringify(webhookPayload);
			const hmac = crypto.createHmac("sha256", webhookSecret);
			hmac.update(payloadString);
			const signature = `sha256=${hmac.digest("hex")}`;

			const response = await request(singleTenantApp)
				.post("/webhooks/github")
				.set("X-GitHub-Event", "installation")
				.set("X-GitHub-Delivery", "12345")
				.set("X-Hub-Signature-256", signature)
				.set("Content-Type", "application/json")
				.send(payloadString);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ received: true });
			// Should use shared emitter, not tenant-specific
			expect(mockEventEmitter.emit).toHaveBeenCalledWith("github:installation:created", webhookPayload);
			// Registry should not be called in single-tenant mode
			expect(mockRegistryClient.getTenantOrgByInstallationId).not.toHaveBeenCalled();
		});

		it("should handle push events in multi-tenant mode", async () => {
			vi.mocked(mockRegistryClient.getTenantOrgByInstallationId).mockResolvedValue({
				tenant: mockTenant,
				org: mockOrg,
			});

			const webhookPayload = {
				ref: "refs/heads/main",
				before: "abc123old",
				after: "abc123new",
				commits: [{ id: "abc123", message: "test commit" }],
				installation: { id: 67890 },
				repository: { id: 123, name: "test-repo", full_name: "owner/test-repo" },
				sender: { login: "testuser", id: 456 },
			};

			const response = await sendMultiTenantWebhook(webhookPayload, "push", "12345");

			expect(response.status).toBe(200);
			expect(mockTenantEventEmitter.emit).toHaveBeenCalledWith("github:push", webhookPayload);
		});
	});
});
