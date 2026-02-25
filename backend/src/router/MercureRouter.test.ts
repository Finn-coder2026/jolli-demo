import type { MercureService } from "../services/MercureService";
import type { TokenUtil } from "../util/TokenUtil";
import { createMercureRouter } from "./MercureRouter";
import express, { type Express } from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Mock dependencies
vi.mock("../config/Config", () => ({
	getConfig: vi.fn(),
}));

vi.mock("../services/MercureService", () => ({
	createMercureService: vi.fn(),
}));

// Import after mocking
import { getConfig } from "../config/Config";
import { createMercureService } from "../services/MercureService";

/**
 * Create a mock TokenUtil for testing.
 * decodePayload returns a UserInfo with the given userId by default.
 */
function createMockTokenUtil(userId = 42): TokenUtil<UserInfo> {
	return {
		generateToken: vi.fn().mockReturnValue("mock-token"),
		decodePayload: vi.fn().mockReturnValue({ userId, email: "test@test.com", name: "Test", picture: undefined }),
		decodePayloadFromToken: vi
			.fn()
			.mockReturnValue({ userId, email: "test@test.com", name: "Test", picture: undefined }),
	};
}

/**
 * Create an Express middleware that simulates UserProvisioningMiddleware
 * by setting req.orgUser with the given user ID.
 */
function createMockUserMiddleware(userId: number) {
	return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
		req.orgUser = { id: userId, email: "test@test.com", name: "Test", picture: undefined };
		next();
	};
}

describe("MercureRouter", () => {
	let app: Express;
	let mockMercureService: MercureService;
	let mockTokenUtil: TokenUtil<UserInfo>;
	const mockGetConfig = getConfig as Mock;
	const mockCreateMercureService = createMercureService as Mock;

	const defaultConfig = {
		MERCURE_ENABLED: true,
		MERCURE_HUB_BASE_URL: "http://localhost:3001",
		MERCURE_PUBLISHER_JWT_SECRET: "test-publisher-secret",
		MERCURE_SUBSCRIBER_JWT_SECRET: "test-subscriber-secret",
	};

	const TEST_USER_ID = 42;

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup mock service
		mockMercureService = {
			isEnabled: vi.fn().mockReturnValue(true),
			getJobEventsTopic: vi.fn().mockReturnValue("/tenants/default/jobs/events"),
			getDraftTopic: vi.fn().mockImplementation((id: number) => `/tenants/default/drafts/${id}`),
			getConvoTopic: vi.fn().mockImplementation((id: number) => `/tenants/default/convos/${id}`),
			getOnboardingTopic: vi
				.fn()
				.mockImplementation((id: number) => `/tenants/default/orgs/default/onboarding/${id}`),
			createSubscriberToken: vi.fn().mockReturnValue("mock-subscriber-token"),
			publishJobEvent: vi.fn().mockResolvedValue({ success: true }),
			publishDraftEvent: vi.fn().mockResolvedValue({ success: true }),
			publishConvoEvent: vi.fn().mockResolvedValue({ success: true }),
			publishOnboardingEvent: vi.fn().mockResolvedValue({ success: true }),
		};
		mockCreateMercureService.mockReturnValue(mockMercureService);

		// Setup default config
		mockGetConfig.mockReturnValue(defaultConfig);

		// Setup mock TokenUtil
		mockTokenUtil = createMockTokenUtil(TEST_USER_ID);

		// Setup Express app with user middleware to simulate auth + provisioning
		app = express();
		app.use(express.json());
		app.use(createMockUserMiddleware(TEST_USER_ID));
		app.use("/mercure", createMercureRouter({ tokenUtil: mockTokenUtil, mercureService: mockMercureService }));
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it("should use createMercureService when no service is provided", async () => {
		// Create router without passing a service to hit the ?? fallback branch
		const appWithDefaultService = express();
		appWithDefaultService.use(express.json());
		appWithDefaultService.use("/mercure", createMercureRouter({ tokenUtil: mockTokenUtil }));

		const response = await request(appWithDefaultService).get("/mercure/config");

		expect(response.status).toBe(200);
		expect(mockCreateMercureService).toHaveBeenCalled();
	});

	describe("GET /config", () => {
		it("should return enabled status and hub URL", async () => {
			const response = await request(app).get("/mercure/config");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				enabled: true,
				hubUrl: "http://localhost:3001/.well-known/mercure",
			});
		});

		it("should return enabled: false when Mercure is disabled", async () => {
			(mockMercureService.isEnabled as Mock).mockReturnValue(false);
			mockGetConfig.mockReturnValue({
				...defaultConfig,
				MERCURE_ENABLED: false,
				MERCURE_HUB_BASE_URL: undefined,
			});

			const response = await request(app).get("/mercure/config");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				enabled: false,
				hubUrl: null,
			});
		});

		it("should return hubUrl: null when not configured", async () => {
			mockGetConfig.mockReturnValue({
				...defaultConfig,
				MERCURE_HUB_BASE_URL: undefined,
			});

			const response = await request(app).get("/mercure/config");

			expect(response.status).toBe(200);
			expect(response.body.hubUrl).toBeNull();
		});
	});

	describe("POST /token", () => {
		describe("with topics array", () => {
			it("should return token for specified topics", async () => {
				const response = await request(app)
					.post("/mercure/token")
					.send({ topics: ["/tenants/test/drafts/123", "/tenants/test/convos/456"] });

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					token: "mock-subscriber-token",
					topics: ["/tenants/test/drafts/123", "/tenants/test/convos/456"],
				});
				expect(mockMercureService.createSubscriberToken).toHaveBeenCalledWith([
					"/tenants/test/drafts/123",
					"/tenants/test/convos/456",
				]);
			});
		});

		describe("with type shorthand", () => {
			it("should return token for jobs type", async () => {
				const response = await request(app).post("/mercure/token").send({ type: "jobs" });

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					token: "mock-subscriber-token",
					topics: ["/tenants/default/jobs/events"],
				});
				expect(mockMercureService.getJobEventsTopic).toHaveBeenCalled();
			});

			it("should return token for draft type with id", async () => {
				const response = await request(app).post("/mercure/token").send({ type: "draft", id: 123 });

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					token: "mock-subscriber-token",
					topics: ["/tenants/default/drafts/123"],
				});
				expect(mockMercureService.getDraftTopic).toHaveBeenCalledWith(123);
			});

			it("should return token for convo type with id", async () => {
				const response = await request(app).post("/mercure/token").send({ type: "convo", id: 456 });

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					token: "mock-subscriber-token",
					topics: ["/tenants/default/convos/456"],
				});
				expect(mockMercureService.getConvoTopic).toHaveBeenCalledWith(456);
			});

			it("should return 400 for draft type without id", async () => {
				const response = await request(app).post("/mercure/token").send({ type: "draft" });

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: "Draft ID required for type 'draft'" });
			});

			it("should return 400 for convo type without id", async () => {
				const response = await request(app).post("/mercure/token").send({ type: "convo" });

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: "Convo ID required for type 'convo'" });
			});

			it("should return token for onboarding type using authenticated user's ID", async () => {
				// Even if client sends a different id (e.g., 999), the router should use
				// the authenticated user's ID (42) from req.orgUser
				const response = await request(app).post("/mercure/token").send({ type: "onboarding", id: 999 });

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					token: "mock-subscriber-token",
					topics: [`/tenants/default/orgs/default/onboarding/${TEST_USER_ID}`],
				});
				// Should use the authenticated user ID (42), not the requested ID (999)
				expect(mockMercureService.getOnboardingTopic).toHaveBeenCalledWith(TEST_USER_ID);
			});

			it("should return token for onboarding type without id in body", async () => {
				// No id needed in body — the router uses the authenticated user's ID
				const response = await request(app).post("/mercure/token").send({ type: "onboarding" });

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					token: "mock-subscriber-token",
					topics: [`/tenants/default/orgs/default/onboarding/${TEST_USER_ID}`],
				});
				expect(mockMercureService.getOnboardingTopic).toHaveBeenCalledWith(TEST_USER_ID);
			});

			it("should return 401 for onboarding type when user ID cannot be determined", async () => {
				// Create an app without user middleware and with a tokenUtil that returns undefined
				const noUserTokenUtil = createMockTokenUtil();
				(noUserTokenUtil.decodePayload as Mock).mockReturnValue(undefined);

				const noUserApp = express();
				noUserApp.use(express.json());
				noUserApp.use(
					"/mercure",
					createMercureRouter({ tokenUtil: noUserTokenUtil, mercureService: mockMercureService }),
				);

				const response = await request(noUserApp).post("/mercure/token").send({ type: "onboarding" });

				expect(response.status).toBe(401);
				expect(response.body).toEqual({ error: "Could not determine authenticated user ID" });
			});

			it("should return 400 for invalid type", async () => {
				const response = await request(app).post("/mercure/token").send({ type: "invalid" });

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: "Invalid type: invalid" });
			});
		});

		describe("error handling", () => {
			it("should return 400 when neither topics nor type is provided", async () => {
				const response = await request(app).post("/mercure/token").send({});

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: "Either 'topics' array or 'type' is required" });
			});

			it("should return 400 for empty topics array", async () => {
				const response = await request(app).post("/mercure/token").send({ topics: [] });

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: "Either 'topics' array or 'type' is required" });
			});

			it("should return 503 when Mercure is disabled", async () => {
				(mockMercureService.isEnabled as Mock).mockReturnValue(false);

				const response = await request(app)
					.post("/mercure/token")
					.send({ topics: ["/test/topic"] });

				expect(response.status).toBe(503);
				expect(response.body).toEqual({ error: "Mercure is not enabled" });
			});

			it("should return 500 when token creation fails", async () => {
				(mockMercureService.createSubscriberToken as Mock).mockImplementation(() => {
					throw new Error("Token creation failed");
				});

				const response = await request(app).post("/mercure/token").send({ type: "jobs" });

				expect(response.status).toBe(500);
				expect(response.body).toEqual({ error: "Failed to create subscriber token" });
			});
		});
	});

	describe("dependency injection", () => {
		it("should use provided MercureService", async () => {
			const customService: MercureService = {
				isEnabled: vi.fn().mockReturnValue(true),
				getJobEventsTopic: vi.fn().mockReturnValue("/custom/topic"),
				getDraftTopic: vi.fn(),
				getConvoTopic: vi.fn(),
				getOnboardingTopic: vi.fn(),
				createSubscriberToken: vi.fn().mockReturnValue("custom-token"),
				publishJobEvent: vi.fn(),
				publishDraftEvent: vi.fn(),
				publishConvoEvent: vi.fn(),
				publishOnboardingEvent: vi.fn(),
			};

			const customApp = express();
			customApp.use(express.json());
			customApp.use("/mercure", createMercureRouter({ tokenUtil: mockTokenUtil, mercureService: customService }));

			const response = await request(customApp).post("/mercure/token").send({ type: "jobs" });

			expect(response.status).toBe(200);
			expect(response.body.token).toBe("custom-token");
			expect(response.body.topics).toEqual(["/custom/topic"]);
		});

		it("should create default MercureService when not provided", async () => {
			// Configure the mock to return a working service
			mockCreateMercureService.mockReturnValue(mockMercureService);

			const defaultApp = express();
			defaultApp.use(express.json());
			// Call without providing a mercureService - triggers the ?? fallback
			defaultApp.use("/mercure", createMercureRouter({ tokenUtil: mockTokenUtil }));

			const response = await request(defaultApp).get("/mercure/config");

			expect(response.status).toBe(200);
			expect(mockCreateMercureService).toHaveBeenCalled();
		});
	});
});
