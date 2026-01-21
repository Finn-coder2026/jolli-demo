import type { MercureService } from "../services/MercureService";
import { createMercureRouter } from "./MercureRouter";
import express, { type Express } from "express";
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

describe("MercureRouter", () => {
	let app: Express;
	let mockMercureService: MercureService;
	const mockGetConfig = getConfig as Mock;
	const mockCreateMercureService = createMercureService as Mock;

	const defaultConfig = {
		MERCURE_ENABLED: true,
		MERCURE_HUB_BASE_URL: "http://localhost:3001",
		MERCURE_PUBLISHER_JWT_SECRET: "test-publisher-secret",
		MERCURE_SUBSCRIBER_JWT_SECRET: "test-subscriber-secret",
	};

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup mock service
		mockMercureService = {
			isEnabled: vi.fn().mockReturnValue(true),
			getJobEventsTopic: vi.fn().mockReturnValue("/tenants/default/jobs/events"),
			getDraftTopic: vi.fn().mockImplementation((id: number) => `/tenants/default/drafts/${id}`),
			getConvoTopic: vi.fn().mockImplementation((id: number) => `/tenants/default/convos/${id}`),
			createSubscriberToken: vi.fn().mockReturnValue("mock-subscriber-token"),
			publishJobEvent: vi.fn().mockResolvedValue({ success: true }),
			publishDraftEvent: vi.fn().mockResolvedValue({ success: true }),
			publishConvoEvent: vi.fn().mockResolvedValue({ success: true }),
		};
		mockCreateMercureService.mockReturnValue(mockMercureService);

		// Setup default config
		mockGetConfig.mockReturnValue(defaultConfig);

		// Setup Express app
		app = express();
		app.use(express.json());
		app.use("/mercure", createMercureRouter(mockMercureService));
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it("should use createMercureService when no service is provided", async () => {
		// Create router without passing a service to hit the ?? fallback branch
		const appWithDefaultService = express();
		appWithDefaultService.use(express.json());
		appWithDefaultService.use("/mercure", createMercureRouter());

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
				createSubscriberToken: vi.fn().mockReturnValue("custom-token"),
				publishJobEvent: vi.fn(),
				publishDraftEvent: vi.fn(),
				publishConvoEvent: vi.fn(),
			};

			const customApp = express();
			customApp.use(express.json());
			customApp.use("/mercure", createMercureRouter(customService));

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
			// Call without providing a service - triggers the ?? fallback
			defaultApp.use("/mercure", createMercureRouter());

			const response = await request(defaultApp).get("/mercure/config");

			expect(response.status).toBe(200);
			expect(mockCreateMercureService).toHaveBeenCalled();
		});
	});
});
