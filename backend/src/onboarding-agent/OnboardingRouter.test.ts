/**
 * Tests for OnboardingRouter.
 */

import type { DaoProvider } from "../dao/DaoProvider";
import type { UserOnboardingDao } from "../dao/UserOnboardingDao";
import type { MercureService } from "../services/MercureService";
import type { TokenUtil } from "../util/TokenUtil";
import { createOnboardingRouter } from "./OnboardingRouter";
import express, { type Express } from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock TenantContext to return undefined context
vi.mock("../tenant/TenantContext", () => ({
	// biome-ignore lint/suspicious/noEmptyBlockStatements: Mock returns undefined
	getTenantContext: vi.fn(() => {}),
}));

// Mock OnboardingAgentFsm
vi.mock("./OnboardingAgentFsm", () => ({
	createOnboardingAgentFsm: vi.fn(() => ({
		// biome-ignore lint/suspicious/useAwait: Mock async generator for testing
		chat: vi.fn(async function* () {
			yield { type: "content", content: "Hello" };
			yield { type: "content", content: " world" };
			yield { type: "done", state: undefined };
		}),
	})),
}));

// Mock OnboardingWebhookListener
vi.mock("./OnboardingWebhookListener", () => ({
	createOnboardingWebhookListener: vi.fn(() => ({ dispose: vi.fn() })),
}));

function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

describe("OnboardingRouter", () => {
	let app: Express;
	let mockUserOnboardingDao: UserOnboardingDao;
	let mockTokenUtil: TokenUtil<UserInfo>;

	const mockOnboardingRecord = {
		id: 1,
		userId: 1,
		currentStep: "welcome" as const,
		status: "not_started" as const,
		goals: {},
		stepData: {},
		completedSteps: [] as Array<"welcome" | "connect_github" | "scan_repos" | "import_docs" | "complete">,
		skippedAt: null,
		completedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	beforeEach(() => {
		vi.clearAllMocks();

		mockUserOnboardingDao = {
			getByUserId: vi.fn().mockResolvedValue(mockOnboardingRecord),
			create: vi.fn().mockResolvedValue(mockOnboardingRecord),
			getOrCreate: vi.fn().mockResolvedValue(mockOnboardingRecord),
			update: vi.fn().mockResolvedValue(mockOnboardingRecord),
			skip: vi.fn().mockResolvedValue({ ...mockOnboardingRecord, status: "skipped", skippedAt: new Date() }),
			complete: vi
				.fn()
				.mockResolvedValue({ ...mockOnboardingRecord, status: "completed", completedAt: new Date() }),
			restart: vi.fn().mockResolvedValue({ ...mockOnboardingRecord, status: "in_progress" }),
			advanceStep: vi.fn().mockResolvedValue(mockOnboardingRecord),
			updateStepData: vi.fn().mockResolvedValue(mockOnboardingRecord),
			findByFsmStateAndRepo: vi.fn().mockResolvedValue([]),
		};

		mockTokenUtil = {
			decodePayload: vi.fn().mockReturnValue({ userId: 1 }),
		} as unknown as TokenUtil<UserInfo>;

		app = express();
		app.use(express.json());
		app.use(
			"/api/onboarding",
			createOnboardingRouter({
				userOnboardingDaoProvider: mockDaoProvider(mockUserOnboardingDao),
				tokenUtil: mockTokenUtil,
				anthropicApiKey: "test-api-key",
				anthropicModel: "claude-sonnet-4-20250514",
			}),
		);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("GET /api/onboarding", () => {
		it("should return onboarding state for user", async () => {
			const response = await request(app).get("/api/onboarding").expect(200);

			expect(response.body.needsOnboarding).toBe(true);
			expect(response.body.state).toBeDefined();
			expect(response.body.state.status).toBe("not_started");
		});

		it("should return needsOnboarding true when status is in_progress", async () => {
			mockUserOnboardingDao.getByUserId = vi.fn().mockResolvedValue({
				...mockOnboardingRecord,
				status: "in_progress",
			});

			const response = await request(app).get("/api/onboarding").expect(200);

			expect(response.body.needsOnboarding).toBe(true);
		});

		it("should return needsOnboarding false when completed", async () => {
			mockUserOnboardingDao.getByUserId = vi.fn().mockResolvedValue({
				...mockOnboardingRecord,
				status: "completed",
				completedAt: new Date(),
			});

			const response = await request(app).get("/api/onboarding").expect(200);

			expect(response.body.needsOnboarding).toBe(false);
		});

		it("should return needsOnboarding false when skipped", async () => {
			mockUserOnboardingDao.getByUserId = vi.fn().mockResolvedValue({
				...mockOnboardingRecord,
				status: "skipped",
				skippedAt: new Date(),
			});

			const response = await request(app).get("/api/onboarding").expect(200);

			expect(response.body.needsOnboarding).toBe(false);
		});

		it("should return needsOnboarding true when no record exists", async () => {
			mockUserOnboardingDao.getByUserId = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).get("/api/onboarding").expect(200);

			expect(response.body.needsOnboarding).toBe(true);
			expect(response.body.state).toBeUndefined();
		});

		it("should return 401 when user is not authenticated", async () => {
			mockTokenUtil.decodePayload = vi.fn().mockReturnValue(undefined);

			const response = await request(app).get("/api/onboarding").expect(401);

			expect(response.body.error).toBe("unauthorized");
		});

		it("should handle errors and return 500", async () => {
			mockUserOnboardingDao.getByUserId = vi.fn().mockRejectedValue(new Error("DB error"));

			const response = await request(app).get("/api/onboarding").expect(500);

			expect(response.body.error).toBe("server_error");
		});
	});

	describe("POST /api/onboarding/chat", () => {
		it("should return 401 when user is not authenticated", async () => {
			mockTokenUtil.decodePayload = vi.fn().mockReturnValue(undefined);

			const response = await request(app).post("/api/onboarding/chat").send({ message: "Hello" }).expect(401);

			expect(response.body.error).toBe("unauthorized");
		});

		it("should stream chat response even without API key (pattern-matching only)", async () => {
			const appWithoutKey = express();
			appWithoutKey.use(express.json());
			appWithoutKey.use(
				"/api/onboarding",
				createOnboardingRouter({
					userOnboardingDaoProvider: mockDaoProvider(mockUserOnboardingDao),
					tokenUtil: mockTokenUtil,
					// No anthropicApiKey — FSM uses pattern matching only
				}),
			);

			const response = await request(appWithoutKey)
				.post("/api/onboarding/chat")
				.send({ message: "Hello" })
				.expect(200);

			expect(response.headers["content-type"]).toContain("text/event-stream");
			expect(response.text).toContain("data: ");
			expect(response.text).toContain("data: [DONE]");
		});

		it("should return 400 when message is missing", async () => {
			const response = await request(app).post("/api/onboarding/chat").send({}).expect(400);

			expect(response.body.error).toBe("message_required");
		});

		it("should return 400 when message is not a string", async () => {
			const response = await request(app).post("/api/onboarding/chat").send({ message: 123 }).expect(400);

			expect(response.body.error).toBe("message_required");
		});

		it("should stream chat response via SSE", async () => {
			const response = await request(app).post("/api/onboarding/chat").send({ message: "Hello" }).expect(200);

			expect(response.headers["content-type"]).toContain("text/event-stream");
			expect(response.text).toContain('data: {"type":"content","content":"Hello"}');
			expect(response.text).toContain('data: {"type":"content","content":" world"}');
			expect(response.text).toContain("data: [DONE]");
		});

		it("should update status to in_progress if not_started", async () => {
			await request(app).post("/api/onboarding/chat").send({ message: "Hello" }).expect(200);

			expect(mockUserOnboardingDao.getOrCreate).toHaveBeenCalledWith(1);
			expect(mockUserOnboardingDao.update).toHaveBeenCalledWith(1, { status: "in_progress" });
		});

		it("should not update status if already in_progress", async () => {
			mockUserOnboardingDao.getByUserId = vi.fn().mockResolvedValue({
				...mockOnboardingRecord,
				status: "in_progress",
			});

			await request(app).post("/api/onboarding/chat").send({ message: "Hello" }).expect(200);

			expect(mockUserOnboardingDao.update).not.toHaveBeenCalled();
		});

		it("should pass history to agent", async () => {
			const { createOnboardingAgentFsm } = await import("./OnboardingAgentFsm");

			await request(app)
				.post("/api/onboarding/chat")
				.send({
					message: "New message",
					history: [
						{ role: "user", content: "Previous" },
						{ role: "assistant", content: "Response" },
					],
				})
				.expect(200);

			const mockAgent = vi.mocked(createOnboardingAgentFsm).mock.results[0]?.value;
			expect(mockAgent?.chat).toHaveBeenCalledWith("New message", [
				{ role: "user", content: "Previous" },
				{ role: "assistant", content: "Response" },
			]);
		});
	});

	describe("POST /api/onboarding/skip", () => {
		it("should skip onboarding", async () => {
			const response = await request(app).post("/api/onboarding/skip").expect(200);

			expect(response.body.success).toBe(true);
			expect(response.body.state.status).toBe("skipped");
			expect(mockUserOnboardingDao.skip).toHaveBeenCalledWith(1);
		});

		it("should return 401 when user is not authenticated", async () => {
			mockTokenUtil.decodePayload = vi.fn().mockReturnValue(undefined);

			const response = await request(app).post("/api/onboarding/skip").expect(401);

			expect(response.body.error).toBe("unauthorized");
		});

		it("should return 500 when skip fails", async () => {
			mockUserOnboardingDao.skip = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).post("/api/onboarding/skip").expect(500);

			expect(response.body.error).toBe("update_failed");
		});

		it("should handle errors and return 500", async () => {
			mockUserOnboardingDao.skip = vi.fn().mockRejectedValue(new Error("DB error"));

			const response = await request(app).post("/api/onboarding/skip").expect(500);

			expect(response.body.error).toBe("server_error");
		});
	});

	describe("POST /api/onboarding/complete", () => {
		it("should complete onboarding", async () => {
			const response = await request(app).post("/api/onboarding/complete").expect(200);

			expect(response.body.success).toBe(true);
			expect(response.body.state.status).toBe("completed");
			expect(mockUserOnboardingDao.complete).toHaveBeenCalledWith(1);
		});

		it("should return 401 when user is not authenticated", async () => {
			mockTokenUtil.decodePayload = vi.fn().mockReturnValue(undefined);

			const response = await request(app).post("/api/onboarding/complete").expect(401);

			expect(response.body.error).toBe("unauthorized");
		});

		it("should return 500 when complete fails", async () => {
			mockUserOnboardingDao.complete = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).post("/api/onboarding/complete").expect(500);

			expect(response.body.error).toBe("update_failed");
		});

		it("should handle errors and return 500", async () => {
			mockUserOnboardingDao.complete = vi.fn().mockRejectedValue(new Error("DB error"));

			const response = await request(app).post("/api/onboarding/complete").expect(500);

			expect(response.body.error).toBe("server_error");
		});
	});

	describe("POST /api/onboarding/restart", () => {
		it("should restart onboarding", async () => {
			mockUserOnboardingDao.restart = vi
				.fn()
				.mockResolvedValue({ ...mockOnboardingRecord, status: "in_progress", currentStep: "welcome" });

			const response = await request(app).post("/api/onboarding/restart").expect(200);

			expect(response.body.success).toBe(true);
			expect(response.body.state.status).toBe("in_progress");
			expect(mockUserOnboardingDao.restart).toHaveBeenCalledWith(1);
		});

		it("should return 401 when user is not authenticated", async () => {
			mockTokenUtil.decodePayload = vi.fn().mockReturnValue(undefined);

			const response = await request(app).post("/api/onboarding/restart").expect(401);

			expect(response.body.error).toBe("unauthorized");
		});

		it("should return 500 when restart fails", async () => {
			mockUserOnboardingDao.restart = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).post("/api/onboarding/restart").expect(500);

			expect(response.body.error).toBe("update_failed");
		});

		it("should handle errors and return 500", async () => {
			mockUserOnboardingDao.restart = vi.fn().mockRejectedValue(new Error("DB error"));

			const response = await request(app).post("/api/onboarding/restart").expect(500);

			expect(response.body.error).toBe("server_error");
		});
	});

	describe("getUserId with orgUser", () => {
		it("should use orgUser.id when available", async () => {
			// Create app with middleware that sets orgUser
			const appWithOrgUser = express();
			appWithOrgUser.use(express.json());
			appWithOrgUser.use((req, _res, next) => {
				req.orgUser = { id: 42 } as never;
				next();
			});
			appWithOrgUser.use(
				"/api/onboarding",
				createOnboardingRouter({
					userOnboardingDaoProvider: mockDaoProvider(mockUserOnboardingDao),
					tokenUtil: mockTokenUtil,
					anthropicApiKey: "test-api-key",
				}),
			);

			await request(appWithOrgUser).get("/api/onboarding").expect(200);

			expect(mockUserOnboardingDao.getByUserId).toHaveBeenCalledWith(42);
		});
	});

	describe("Mercure integration", () => {
		it("should publish events to Mercure when enabled", async () => {
			const mockMercureService: MercureService = {
				isEnabled: vi.fn().mockReturnValue(true),
				getJobEventsTopic: vi.fn(),
				getDraftTopic: vi.fn(),
				getConvoTopic: vi.fn(),
				getOnboardingTopic: vi.fn(),
				createSubscriberToken: vi.fn(),
				publishJobEvent: vi.fn(),
				publishDraftEvent: vi.fn(),
				publishConvoEvent: vi.fn(),
				publishOnboardingEvent: vi.fn().mockResolvedValue({ success: true }),
			};

			const appWithMercure = express();
			appWithMercure.use(express.json());
			appWithMercure.use(
				"/api/onboarding",
				createOnboardingRouter({
					userOnboardingDaoProvider: mockDaoProvider(mockUserOnboardingDao),
					tokenUtil: mockTokenUtil,
					anthropicApiKey: "test-api-key",
					mercureService: mockMercureService,
				}),
			);

			await request(appWithMercure).post("/api/onboarding/chat").send({ message: "Hello" }).expect(200);

			// Should publish events for each SSE event (3 events: content, content, done)
			expect(mockMercureService.publishOnboardingEvent).toHaveBeenCalledTimes(3);
			expect(mockMercureService.publishOnboardingEvent).toHaveBeenCalledWith(
				1,
				"content",
				expect.objectContaining({ type: "content", content: "Hello" }),
			);
		});

		it("should not publish to Mercure when disabled", async () => {
			const mockMercureService: MercureService = {
				isEnabled: vi.fn().mockReturnValue(false),
				getJobEventsTopic: vi.fn(),
				getDraftTopic: vi.fn(),
				getConvoTopic: vi.fn(),
				getOnboardingTopic: vi.fn(),
				createSubscriberToken: vi.fn(),
				publishJobEvent: vi.fn(),
				publishDraftEvent: vi.fn(),
				publishConvoEvent: vi.fn(),
				publishOnboardingEvent: vi.fn(),
			};

			const appWithMercure = express();
			appWithMercure.use(express.json());
			appWithMercure.use(
				"/api/onboarding",
				createOnboardingRouter({
					userOnboardingDaoProvider: mockDaoProvider(mockUserOnboardingDao),
					tokenUtil: mockTokenUtil,
					anthropicApiKey: "test-api-key",
					mercureService: mockMercureService,
				}),
			);

			await request(appWithMercure).post("/api/onboarding/chat").send({ message: "Hello" }).expect(200);

			expect(mockMercureService.publishOnboardingEvent).not.toHaveBeenCalled();
		});

		it("should continue streaming even if Mercure publish fails", async () => {
			const mockMercureService: MercureService = {
				isEnabled: vi.fn().mockReturnValue(true),
				getJobEventsTopic: vi.fn(),
				getDraftTopic: vi.fn(),
				getConvoTopic: vi.fn(),
				getOnboardingTopic: vi.fn(),
				createSubscriberToken: vi.fn(),
				publishJobEvent: vi.fn(),
				publishDraftEvent: vi.fn(),
				publishConvoEvent: vi.fn(),
				publishOnboardingEvent: vi.fn().mockRejectedValue(new Error("Mercure error")),
			};

			const appWithMercure = express();
			appWithMercure.use(express.json());
			appWithMercure.use(
				"/api/onboarding",
				createOnboardingRouter({
					userOnboardingDaoProvider: mockDaoProvider(mockUserOnboardingDao),
					tokenUtil: mockTokenUtil,
					anthropicApiKey: "test-api-key",
					mercureService: mockMercureService,
				}),
			);

			// Should still succeed with SSE even if Mercure fails
			const response = await request(appWithMercure)
				.post("/api/onboarding/chat")
				.send({ message: "Hello" })
				.expect(200);

			expect(response.text).toContain('data: {"type":"content","content":"Hello"}');
			expect(response.text).toContain("data: [DONE]");
		});
	});
});
