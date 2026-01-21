import type { MercureClient } from "../util/MercureClient";
import { createMercureService, type MercureService } from "./MercureService";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Mock dependencies
vi.mock("../config/Config", () => ({
	getConfig: vi.fn(),
}));

vi.mock("../tenant/TenantContext", () => ({
	getTenantContext: vi.fn(),
}));

vi.mock("../util/MercureClient", () => ({
	createMercureClient: vi.fn(),
}));

// Import after mocking
import { getConfig } from "../config/Config";
import { getTenantContext } from "../tenant/TenantContext";
import { createMercureClient } from "../util/MercureClient";

describe("MercureService", () => {
	const mockGetConfig = getConfig as Mock;
	const mockGetTenantContext = getTenantContext as Mock;
	const mockCreateMercureClient = createMercureClient as Mock;

	let mockClient: MercureClient;
	let mercureService: MercureService;

	const defaultConfig = {
		MERCURE_ENABLED: true,
		MERCURE_HUB_BASE_URL: "http://localhost:3001",
		MERCURE_PUBLISHER_JWT_SECRET: "test-publisher-secret-at-least-256-bits-long",
		MERCURE_SUBSCRIBER_JWT_SECRET: "test-subscriber-secret-at-least-256-bits-long",
	};

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup mock client
		mockClient = {
			isEnabled: vi.fn().mockReturnValue(true),
			publish: vi.fn().mockResolvedValue({ success: true, eventId: "test-event-id" }),
		};
		mockCreateMercureClient.mockReturnValue(mockClient);

		// Setup default config
		mockGetConfig.mockReturnValue(defaultConfig);

		// Setup default tenant context (none)
		mockGetTenantContext.mockReturnValue(undefined);

		mercureService = createMercureService();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("isEnabled", () => {
		it("should delegate to MercureClient.isEnabled", () => {
			expect(mercureService.isEnabled()).toBe(true);
			expect(mockClient.isEnabled).toHaveBeenCalledTimes(1);
		});

		it("should return false when client reports disabled", () => {
			(mockClient.isEnabled as Mock).mockReturnValue(false);
			expect(mercureService.isEnabled()).toBe(false);
		});
	});

	describe("topic builders", () => {
		describe("without tenant context", () => {
			it("should use 'default' tenant and org for getJobEventsTopic", () => {
				expect(mercureService.getJobEventsTopic()).toBe("/tenants/default/orgs/default/jobs/events");
			});

			it("should use 'default' tenant for getDraftTopic", () => {
				expect(mercureService.getDraftTopic(123)).toBe("/tenants/default/drafts/123");
			});

			it("should use 'default' tenant for getConvoTopic", () => {
				expect(mercureService.getConvoTopic(456)).toBe("/tenants/default/convos/456");
			});
		});

		describe("with tenant context", () => {
			beforeEach(() => {
				mockGetTenantContext.mockReturnValue({
					tenant: { slug: "acme-corp" },
					org: { slug: "engineering", schemaName: "org_acme" },
				});
			});

			it("should use tenant and org slug for getJobEventsTopic", () => {
				expect(mercureService.getJobEventsTopic()).toBe("/tenants/acme-corp/orgs/engineering/jobs/events");
			});

			it("should use tenant slug for getDraftTopic", () => {
				expect(mercureService.getDraftTopic(789)).toBe("/tenants/acme-corp/drafts/789");
			});

			it("should use tenant slug for getConvoTopic", () => {
				expect(mercureService.getConvoTopic(101)).toBe("/tenants/acme-corp/convos/101");
			});
		});

		describe("with incomplete tenant context", () => {
			it("should use 'default' tenant and org when tenant context has no tenant", () => {
				mockGetTenantContext.mockReturnValue({ org: { slug: "sales", schemaName: "test" } });
				expect(mercureService.getJobEventsTopic()).toBe("/tenants/default/orgs/sales/jobs/events");
			});

			it("should use 'default' tenant when tenant has no slug", () => {
				mockGetTenantContext.mockReturnValue({ tenant: {}, org: { slug: "marketing", schemaName: "test" } });
				expect(mercureService.getJobEventsTopic()).toBe("/tenants/default/orgs/marketing/jobs/events");
			});

			it("should use 'default' org when org has no slug", () => {
				mockGetTenantContext.mockReturnValue({ tenant: { slug: "acme" }, org: { schemaName: "test" } });
				expect(mercureService.getJobEventsTopic()).toBe("/tenants/acme/orgs/default/jobs/events");
			});
		});
	});

	describe("createSubscriberToken", () => {
		it("should create a valid JWT with subscribe claim", () => {
			const topics = ["/tenants/acme/drafts/123", "/tenants/acme/convos/456"];
			const token = mercureService.createSubscriberToken(topics);

			expect(token).toBeDefined();
			expect(typeof token).toBe("string");

			// Verify the JWT
			const decoded = jwt.verify(token, defaultConfig.MERCURE_SUBSCRIBER_JWT_SECRET) as {
				mercure: { subscribe: Array<string> };
			};

			expect(decoded.mercure.subscribe).toEqual(topics);
		});

		it("should create token with 24h expiration", () => {
			const token = mercureService.createSubscriberToken(["/tenants/test/jobs/events"]);
			const decoded = jwt.decode(token) as { exp: number; iat: number };

			// 24 hours = 86400 seconds
			expect(decoded.exp - decoded.iat).toBe(86400);
		});

		it("should throw when MERCURE_SUBSCRIBER_JWT_SECRET is not configured", () => {
			mockGetConfig.mockReturnValue({
				...defaultConfig,
				MERCURE_SUBSCRIBER_JWT_SECRET: undefined,
			});

			expect(() => mercureService.createSubscriberToken(["/test/topic"])).toThrow(
				"MERCURE_SUBSCRIBER_JWT_SECRET not configured",
			);
		});
	});

	describe("publishJobEvent", () => {
		it("should publish to correct topic with event data", async () => {
			const result = await mercureService.publishJobEvent("job:started", {
				jobId: "123",
				name: "test-job",
			});

			expect(result.success).toBe(true);
			expect(mockClient.publish).toHaveBeenCalledTimes(1);

			const publishCall = (mockClient.publish as Mock).mock.calls[0][0];
			expect(publishCall.topic).toBe("/tenants/default/orgs/default/jobs/events");
			expect(publishCall.type).toBeUndefined(); // We don't pass type to avoid named SSE events
			expect(publishCall.data.type).toBe("job:started");
			expect(publishCall.data.jobId).toBe("123");
			expect(publishCall.data.name).toBe("test-job");
			expect(publishCall.data.timestamp).toBeDefined();
		});

		it("should handle non-object data", async () => {
			await mercureService.publishJobEvent("job:completed", "simple-string");

			const publishCall = (mockClient.publish as Mock).mock.calls[0][0];
			expect(publishCall.data.data).toBe("simple-string");
		});

		it("should handle null data", async () => {
			await mercureService.publishJobEvent("job:cancelled", null);

			const publishCall = (mockClient.publish as Mock).mock.calls[0][0];
			expect(publishCall.data.data).toBeNull();
		});
	});

	describe("publishDraftEvent", () => {
		it("should publish to correct topic with event data and private flag", async () => {
			const result = await mercureService.publishDraftEvent(123, "content_update", {
				content: "Hello World",
				userId: 456,
			});

			expect(result.success).toBe(true);
			expect(mockClient.publish).toHaveBeenCalledTimes(1);

			const publishCall = (mockClient.publish as Mock).mock.calls[0][0];
			expect(publishCall.topic).toBe("/tenants/default/drafts/123");
			expect(publishCall.type).toBeUndefined(); // We don't pass type to avoid named SSE events
			expect(publishCall.private).toBe(true);
			expect(publishCall.data.type).toBe("content_update");
			expect(publishCall.data.draftId).toBe(123);
			expect(publishCall.data.content).toBe("Hello World");
			expect(publishCall.data.userId).toBe(456);
			expect(publishCall.data.timestamp).toBeDefined();
		});

		it("should use tenant context for topic", async () => {
			mockGetTenantContext.mockReturnValue({
				tenant: { slug: "widgets-inc" },
			});

			await mercureService.publishDraftEvent(999, "user_joined", { userId: 1 });

			const publishCall = (mockClient.publish as Mock).mock.calls[0][0];
			expect(publishCall.topic).toBe("/tenants/widgets-inc/drafts/999");
		});
	});

	describe("publishConvoEvent", () => {
		it("should publish to correct topic with event data and private flag", async () => {
			const result = await mercureService.publishConvoEvent(456, "typing", {
				userId: 789,
				isTyping: true,
			});

			expect(result.success).toBe(true);
			expect(mockClient.publish).toHaveBeenCalledTimes(1);

			const publishCall = (mockClient.publish as Mock).mock.calls[0][0];
			expect(publishCall.topic).toBe("/tenants/default/convos/456");
			expect(publishCall.type).toBeUndefined(); // We don't pass type to avoid named SSE events
			expect(publishCall.private).toBe(true);
			expect(publishCall.data.type).toBe("typing");
			expect(publishCall.data.convoId).toBe(456);
			expect(publishCall.data.userId).toBe(789);
			expect(publishCall.data.isTyping).toBe(true);
			expect(publishCall.data.timestamp).toBeDefined();
		});

		it("should use tenant context for topic", async () => {
			mockGetTenantContext.mockReturnValue({
				tenant: { slug: "startup-xyz" },
			});

			await mercureService.publishConvoEvent(888, "message_complete", { messageId: 111 });

			const publishCall = (mockClient.publish as Mock).mock.calls[0][0];
			expect(publishCall.topic).toBe("/tenants/startup-xyz/convos/888");
		});

		it("should handle non-object data by wrapping in data property", async () => {
			await mercureService.publishConvoEvent(123, "raw_message", "plain string data");

			const publishCall = (mockClient.publish as Mock).mock.calls[0][0];
			expect(publishCall.data.type).toBe("raw_message");
			expect(publishCall.data.convoId).toBe(123);
			expect(publishCall.data.data).toBe("plain string data");
		});
	});

	describe("publishDraftEvent with non-object data", () => {
		it("should handle non-object data by wrapping in data property", async () => {
			await mercureService.publishDraftEvent(456, "status_update", 42);

			const publishCall = (mockClient.publish as Mock).mock.calls[0][0];
			expect(publishCall.data.type).toBe("status_update");
			expect(publishCall.data.draftId).toBe(456);
			expect(publishCall.data.data).toBe(42);
		});
	});

	describe("dependency injection", () => {
		it("should use provided MercureClient", async () => {
			const customClient: MercureClient = {
				isEnabled: vi.fn().mockReturnValue(false),
				publish: vi.fn().mockResolvedValue({ success: false }),
			};

			const service = createMercureService(customClient);

			expect(service.isEnabled()).toBe(false);
			expect(customClient.isEnabled).toHaveBeenCalled();

			await service.publishJobEvent("test", {});
			expect(customClient.publish).toHaveBeenCalled();
		});
	});
});
