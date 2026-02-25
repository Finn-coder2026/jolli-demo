/**
 * Tests for OnboardingAgentFsm.
 */

import type { UserOnboardingDao } from "../dao/UserOnboardingDao";
import { createOnboardingAgentFsm } from "./OnboardingAgentFsm";
import type { OnboardingSSEEvent, OnboardingStepData } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock IntentClassifier to avoid LLM calls in tests
vi.mock("./IntentClassifier", () => ({
	classifyIntent: vi.fn(() => Promise.resolve("confirm")),
	classifyByPattern: vi.fn(() => "confirm"),
}));

// Mock FSM transition to return predictable results.
// First call per test: WELCOME → GITHUB_CHECK (auto-state, triggers agent loop).
// Second call: GITHUB_CHECK → GITHUB_INSTALL_PROMPT (prompt state, stops loop).
const mockTransition = vi.fn();
vi.mock("./OnboardingFsm", () => ({
	deriveFsmStateFromStepData: vi.fn(() => "WELCOME"),
	transition: (...args: Array<unknown>) => mockTransition(...args),
}));

/**
 * Create a mock UserOnboardingDao.
 */
function createMockDao(stepData: Partial<OnboardingStepData> = {}): UserOnboardingDao {
	const record = {
		id: 1,
		userId: 42,
		currentStep: "welcome" as const,
		status: "in_progress" as const,
		goals: {},
		stepData: stepData as OnboardingStepData,
		completedSteps: [],
		skippedAt: null,
		completedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	return {
		getByUserId: vi.fn(() => Promise.resolve(record)),
		create: vi.fn(() => Promise.resolve(record)),
		getOrCreate: vi.fn(() => Promise.resolve(record)),
		update: vi.fn(() => Promise.resolve(record)),
		skip: vi.fn(() => Promise.resolve(record)),
		complete: vi.fn(() => Promise.resolve(record)),
		restart: vi.fn(() => Promise.resolve(record)),
		advanceStep: vi.fn(() => Promise.resolve(record)),
		updateStepData: vi.fn(() => Promise.resolve(record)),
		findByFsmStateAndRepo: vi.fn(() => Promise.resolve([])),
	};
}

describe("OnboardingAgentFsm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default: first call → auto-state (GITHUB_CHECK), second → prompt state
		mockTransition
			.mockResolvedValueOnce({
				newState: "GITHUB_CHECK",
				events: [{ type: "content", content: "Let me check your GitHub status..." }],
			})
			.mockResolvedValue({
				newState: "GITHUB_INSTALL_PROMPT",
				events: [{ type: "content", content: "Would you like to install the GitHub App?" }],
			});
	});

	it("should create an agent with chat method", () => {
		const dao = createMockDao();
		const agent = createOnboardingAgentFsm({ apiKey: "test-key" }, { userOnboardingDao: dao, userId: 42 });

		expect(agent.chat).toBeDefined();
		expect(typeof agent.chat).toBe("function");
	});

	it("should yield SSE events from FSM transition", async () => {
		const dao = createMockDao();
		const agent = createOnboardingAgentFsm({ apiKey: "test-key" }, { userOnboardingDao: dao, userId: 42 });

		const events: Array<OnboardingSSEEvent> = [];
		for await (const event of agent.chat("yes")) {
			events.push(event);
		}

		// Should have content event + done event
		expect(events.some(e => e.type === "content")).toBe(true);
		expect(events.some(e => e.type === "done")).toBe(true);
	});

	it("should persist new FSM state to stepData", async () => {
		const dao = createMockDao();
		const agent = createOnboardingAgentFsm({ apiKey: "test-key" }, { userOnboardingDao: dao, userId: 42 });

		const events: Array<OnboardingSSEEvent> = [];
		for await (const event of agent.chat("yes")) {
			events.push(event);
		}

		// First persists GITHUB_CHECK (auto-state), then GITHUB_INSTALL_PROMPT (final state)
		expect(dao.updateStepData).toHaveBeenCalledWith(42, { fsmState: "GITHUB_CHECK" });
		expect(dao.updateStepData).toHaveBeenCalledWith(42, { fsmState: "GITHUB_INSTALL_PROMPT" });
	});

	it("should process auto-states in a loop and yield events between steps", async () => {
		const dao = createMockDao();
		const agent = createOnboardingAgentFsm({ apiKey: "test-key" }, { userOnboardingDao: dao, userId: 42 });

		const events: Array<OnboardingSSEEvent> = [];
		for await (const event of agent.chat("yes")) {
			events.push(event);
		}

		// Should have events from BOTH transitions (GITHUB_CHECK + GITHUB_INSTALL_PROMPT)
		const contentEvents = events.filter(e => e.type === "content");
		expect(contentEvents.length).toBe(2);
		expect(contentEvents[0].content).toBe("Let me check your GitHub status...");
		expect(contentEvents[1].content).toBe("Would you like to install the GitHub App?");

		// Transition should have been called twice (initial + auto-loop)
		expect(mockTransition).toHaveBeenCalledTimes(2);
	});

	it("should yield error event on failure", async () => {
		const dao = createMockDao();
		// Override getByUserId to throw
		dao.getByUserId = vi.fn(() => Promise.reject(new Error("Database error")));

		const agent = createOnboardingAgentFsm({ apiKey: "test-key" }, { userOnboardingDao: dao, userId: 42 });

		const events: Array<OnboardingSSEEvent> = [];
		for await (const event of agent.chat("yes")) {
			events.push(event);
		}

		expect(events.some(e => e.type === "error")).toBe(true);
		expect(events.find(e => e.type === "error")?.error).toBe("Database error");
	});

	it("should yield done event with final state", async () => {
		// Make transition return a non-auto state so the loop doesn't trigger
		mockTransition.mockReset().mockResolvedValue({
			newState: "GITHUB_INSTALL_PROMPT",
			events: [{ type: "content", content: "Install GitHub App" }],
		});

		const dao = createMockDao({ fsmState: "WELCOME" });
		const agent = createOnboardingAgentFsm({ apiKey: "test-key" }, { userOnboardingDao: dao, userId: 42 });

		const events: Array<OnboardingSSEEvent> = [];
		for await (const event of agent.chat("yes")) {
			events.push(event);
		}

		const doneEvent = events.find(e => e.type === "done");
		expect(doneEvent).toBeDefined();
		expect(doneEvent?.state?.userId).toBe(42);
	});

	it("should not yield done event when getByUserId returns null", async () => {
		mockTransition.mockReset().mockResolvedValue({
			newState: "GITHUB_INSTALL_PROMPT",
			events: [{ type: "content", content: "Install GitHub App" }],
		});

		const dao = createMockDao();
		// Second call (after transition) returns null
		vi.mocked(dao.getByUserId).mockResolvedValueOnce({
			id: 1,
			userId: 42,
			currentStep: "welcome" as const,
			status: "in_progress" as const,
			goals: {},
			stepData: {},
			completedSteps: [],
			skippedAt: null,
			completedAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		vi.mocked(dao.getByUserId).mockResolvedValueOnce(null as never);

		const agent = createOnboardingAgentFsm({ apiKey: "test-key" }, { userOnboardingDao: dao, userId: 42 });

		const events: Array<OnboardingSSEEvent> = [];
		for await (const event of agent.chat("yes")) {
			events.push(event);
		}

		expect(events.some(e => e.type === "done")).toBe(false);
	});

	it("should handle non-Error thrown in catch block", async () => {
		const dao = createMockDao();
		dao.getByUserId = vi.fn(() => Promise.reject("string error"));

		const agent = createOnboardingAgentFsm({ apiKey: "test-key" }, { userOnboardingDao: dao, userId: 42 });

		const events: Array<OnboardingSSEEvent> = [];
		for await (const event of agent.chat("yes")) {
			events.push(event);
		}

		const errorEvent = events.find(e => e.type === "error");
		expect(errorEvent?.error).toBe("Unknown error");
	});

	it("should map record with skippedAt and completedAt to undefined", async () => {
		mockTransition.mockReset().mockResolvedValue({
			newState: "GITHUB_INSTALL_PROMPT",
			events: [],
		});

		const dao = createMockDao();
		// Record with null skippedAt/completedAt (which should map to undefined)
		vi.mocked(dao.getByUserId).mockResolvedValue({
			id: 1,
			userId: 42,
			currentStep: "welcome" as const,
			status: "in_progress" as const,
			goals: {},
			stepData: {},
			completedSteps: [],
			skippedAt: null,
			completedAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const agent = createOnboardingAgentFsm({ apiKey: "test-key" }, { userOnboardingDao: dao, userId: 42 });

		const events: Array<OnboardingSSEEvent> = [];
		for await (const event of agent.chat("yes")) {
			events.push(event);
		}

		const doneEvent = events.find(e => e.type === "done");
		expect(doneEvent?.state?.skippedAt).toBeUndefined();
		expect(doneEvent?.state?.completedAt).toBeUndefined();
	});

	it("should use stub DAOs when none are provided", async () => {
		mockTransition.mockReset().mockResolvedValue({
			newState: "GITHUB_INSTALL_PROMPT",
			events: [{ type: "content", content: "Test" }],
		});

		const dao = createMockDao();
		// Create agent WITHOUT optional DAOs — createToolContext should use stubs
		const agent = createOnboardingAgentFsm({ apiKey: "test-key" }, { userOnboardingDao: dao, userId: 42 });

		const events: Array<OnboardingSSEEvent> = [];
		for await (const event of agent.chat("yes")) {
			events.push(event);
		}

		// Should work without errors (stubs don't throw)
		expect(events.some(e => e.type === "content")).toBe(true);
		// Verify transition was called with a tool context that has all required fields
		expect(mockTransition).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(String),
			expect.objectContaining({
				userId: 42,
				integrationDao: expect.anything(),
				docDao: expect.anything(),
				githubInstallationDao: expect.anything(),
				spaceDao: expect.anything(),
			}),
		);
	});

	it("should yield fsm_transition events", async () => {
		const dao = createMockDao();
		const agent = createOnboardingAgentFsm({ apiKey: "test-key" }, { userOnboardingDao: dao, userId: 42 });

		const events: Array<OnboardingSSEEvent> = [];
		for await (const event of agent.chat("yes")) {
			events.push(event);
		}

		const transitionEvents = events.filter(e => e.type === "fsm_transition");
		// Should have 2 transition events: initial + auto-loop
		expect(transitionEvents.length).toBe(2);
		expect(transitionEvents[0].fsmTransition?.from).toBe("WELCOME");
		expect(transitionEvents[0].fsmTransition?.to).toBe("GITHUB_CHECK");
		expect(transitionEvents[1].fsmTransition?.from).toBe("GITHUB_CHECK");
	});

	it("should process multiple consecutive auto-states", async () => {
		// Chain: WELCOME → GITHUB_CHECK → REPO_SCANNING → GITHUB_INSTALL_PROMPT
		mockTransition
			.mockReset()
			.mockResolvedValueOnce({
				newState: "GITHUB_CHECK",
				events: [{ type: "content", content: "Checking GitHub..." }],
			})
			.mockResolvedValueOnce({
				newState: "REPO_SCANNING",
				events: [{ type: "content", content: "Scanning repo..." }],
			})
			.mockResolvedValue({
				newState: "GITHUB_INSTALL_PROMPT",
				events: [{ type: "content", content: "Done" }],
			});

		const dao = createMockDao();
		const agent = createOnboardingAgentFsm({ apiKey: "test-key" }, { userOnboardingDao: dao, userId: 42 });

		const events: Array<OnboardingSSEEvent> = [];
		for await (const event of agent.chat("yes")) {
			events.push(event);
		}

		// Should have called transition 3 times (initial + 2 auto-loops)
		expect(mockTransition).toHaveBeenCalledTimes(3);
		const contentEvents = events.filter(e => e.type === "content");
		expect(contentEvents.length).toBe(3);
	});

	it("should create agent without apiKey (pattern matching only)", () => {
		const dao = createMockDao();
		const agent = createOnboardingAgentFsm({}, { userOnboardingDao: dao, userId: 42 });
		expect(agent.chat).toBeDefined();
	});
});
