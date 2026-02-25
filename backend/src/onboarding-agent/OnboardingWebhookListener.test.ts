/**
 * Tests for OnboardingWebhookListener.
 */

import type { UserOnboardingDao } from "../dao/UserOnboardingDao";
import { GITHUB_PUSH } from "../events/GithubEvents";
import type { JobEventEmitter } from "../jobs/JobEventEmitter";
import type { JobEvent } from "../types/JobTypes";
import { createOnboardingWebhookListener } from "./OnboardingWebhookListener";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Configurable mock for MercureService
let mockMercureEnabled = false;
const mockPublishOnboardingEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("../services/MercureService", () => ({
	createMercureService: () => ({
		isEnabled: () => mockMercureEnabled,
		publishOnboardingEvent: mockPublishOnboardingEvent,
	}),
}));

/**
 * Create a mock event emitter for testing.
 */
function createMockEventEmitter(): JobEventEmitter & {
	listeners: Map<string, Array<(event: JobEvent<unknown>) => void>>;
} {
	const listeners = new Map<string, Array<(event: JobEvent<unknown>) => void>>();

	return {
		listeners,
		emit(eventName: string, eventData: unknown): void {
			const handlers = listeners.get(eventName) ?? [];
			const event = { name: eventName, data: eventData, timestamp: new Date() } as JobEvent<unknown>;
			for (const handler of handlers) {
				handler(event);
			}
		},
		on(eventName: string, listener: (event: JobEvent<unknown>) => void): void {
			const existing = listeners.get(eventName) ?? [];
			existing.push(listener);
			listeners.set(eventName, existing);
		},
		off(eventName: string, listener: (event: JobEvent<unknown>) => void): void {
			const existing = listeners.get(eventName) ?? [];
			listeners.set(
				eventName,
				existing.filter(l => l !== listener),
			);
		},
		removeAllListeners(eventName?: string): void {
			if (eventName) {
				listeners.delete(eventName);
			} else {
				listeners.clear();
			}
		},
	};
}

/**
 * Create a mock UserOnboardingDao for testing.
 */
function createMockDao(): { mockDao: UserOnboardingDao; findByFsmStateAndRepo: Mock; updateStepData: Mock } {
	const findByFsmStateAndRepo = vi.fn().mockResolvedValue([]);
	const updateStepData = vi.fn().mockResolvedValue(undefined);

	const mockDao = {
		findByFsmStateAndRepo,
		updateStepData,
		getByUserId: vi.fn(),
		create: vi.fn(),
		getOrCreate: vi.fn(),
		update: vi.fn(),
		skip: vi.fn(),
		complete: vi.fn(),
		advanceStep: vi.fn(),
	} as unknown as UserOnboardingDao;

	return { mockDao, findByFsmStateAndRepo, updateStepData };
}

describe("OnboardingWebhookListener", () => {
	let emitter: ReturnType<typeof createMockEventEmitter>;
	let dao: ReturnType<typeof createMockDao>;

	beforeEach(() => {
		emitter = createMockEventEmitter();
		dao = createMockDao();
		mockMercureEnabled = false;
		mockPublishOnboardingEvent.mockClear();
	});

	it("should register a listener for GITHUB_PUSH events", () => {
		createOnboardingWebhookListener(emitter, dao.mockDao);

		expect(emitter.listeners.get(GITHUB_PUSH)?.length).toBe(1);
	});

	it("should dispose the listener", () => {
		const handle = createOnboardingWebhookListener(emitter, dao.mockDao);

		expect(emitter.listeners.get(GITHUB_PUSH)?.length).toBe(1);

		handle.dispose();

		expect(emitter.listeners.get(GITHUB_PUSH)?.length).toBe(0);
	});

	it("should set syncTriggered=true when push event matches a user in SYNC_WAITING", async () => {
		const mockRecord = { userId: 42, stepData: { connectedRepo: "acme/docs", fsmState: "SYNC_WAITING" } };
		dao.findByFsmStateAndRepo.mockResolvedValue([mockRecord]);

		createOnboardingWebhookListener(emitter, dao.mockDao);

		// Emit a push event
		emitter.emit(GITHUB_PUSH, {
			repository: { full_name: "acme/docs" },
			ref: "refs/heads/main",
		});

		// Allow async processing
		await new Promise(resolve => setTimeout(resolve, 50));

		expect(dao.findByFsmStateAndRepo).toHaveBeenCalledWith(["SYNC_WAITING", "SYNC_EXPLAIN"], "acme/docs");
		expect(dao.updateStepData).toHaveBeenCalledWith(42, {
			syncTriggered: true,
			lastSyncTime: expect.any(String),
		});
	});

	it("should set syncTriggered=true when push event matches a user in SYNC_EXPLAIN", async () => {
		const mockRecord = { userId: 7, stepData: { connectedRepo: "acme/docs", fsmState: "SYNC_EXPLAIN" } };
		dao.findByFsmStateAndRepo.mockResolvedValue([mockRecord]);

		createOnboardingWebhookListener(emitter, dao.mockDao);

		emitter.emit(GITHUB_PUSH, {
			repository: { full_name: "acme/docs" },
			ref: "refs/heads/main",
		});

		await new Promise(resolve => setTimeout(resolve, 50));

		expect(dao.updateStepData).toHaveBeenCalledWith(7, {
			syncTriggered: true,
			lastSyncTime: expect.any(String),
		});
	});

	it("should handle push events without repository name", async () => {
		createOnboardingWebhookListener(emitter, dao.mockDao);

		emitter.emit(GITHUB_PUSH, { ref: "refs/heads/main" });

		await new Promise(resolve => setTimeout(resolve, 50));

		expect(dao.findByFsmStateAndRepo).not.toHaveBeenCalled();
	});

	it("should handle no matching records gracefully", async () => {
		dao.findByFsmStateAndRepo.mockResolvedValue([]);

		createOnboardingWebhookListener(emitter, dao.mockDao);

		emitter.emit(GITHUB_PUSH, {
			repository: { full_name: "acme/docs" },
		});

		await new Promise(resolve => setTimeout(resolve, 50));

		expect(dao.findByFsmStateAndRepo).toHaveBeenCalledWith(["SYNC_WAITING", "SYNC_EXPLAIN"], "acme/docs");
		expect(dao.updateStepData).not.toHaveBeenCalled();
	});

	it("should publish Mercure event when mercure is enabled", async () => {
		mockMercureEnabled = true;
		const mockRecord = { userId: 42, stepData: { connectedRepo: "acme/docs", fsmState: "SYNC_WAITING" } };
		dao.findByFsmStateAndRepo.mockResolvedValue([mockRecord]);

		createOnboardingWebhookListener(emitter, dao.mockDao);

		emitter.emit(GITHUB_PUSH, {
			repository: { full_name: "acme/docs" },
		});

		await new Promise(resolve => setTimeout(resolve, 50));

		expect(mockPublishOnboardingEvent).toHaveBeenCalledWith(42, "webhook_received", {
			type: "webhook_received",
			repo: "acme/docs",
		});
	});

	it("should handle updateStepData errors gracefully", async () => {
		const mockRecord = { userId: 42, stepData: { connectedRepo: "acme/docs", fsmState: "SYNC_WAITING" } };
		dao.findByFsmStateAndRepo.mockResolvedValue([mockRecord]);
		dao.updateStepData.mockRejectedValue(new Error("DB write failed"));

		createOnboardingWebhookListener(emitter, dao.mockDao);

		emitter.emit(GITHUB_PUSH, {
			repository: { full_name: "acme/docs" },
		});

		// Should not throw - error is caught internally
		await new Promise(resolve => setTimeout(resolve, 50));

		expect(dao.updateStepData).toHaveBeenCalled();
	});

	it("should handle findByFsmStateAndRepo errors gracefully", async () => {
		dao.findByFsmStateAndRepo.mockRejectedValue(new Error("DB read failed"));

		createOnboardingWebhookListener(emitter, dao.mockDao);

		emitter.emit(GITHUB_PUSH, {
			repository: { full_name: "acme/docs" },
		});

		// Should not throw - error is caught internally
		await new Promise(resolve => setTimeout(resolve, 50));

		expect(dao.findByFsmStateAndRepo).toHaveBeenCalled();
	});

	it("should handle Mercure publish failure gracefully", async () => {
		mockMercureEnabled = true;
		mockPublishOnboardingEvent.mockRejectedValue(new Error("Mercure unavailable"));
		const mockRecord = { userId: 42, stepData: { connectedRepo: "acme/docs", fsmState: "SYNC_WAITING" } };
		dao.findByFsmStateAndRepo.mockResolvedValue([mockRecord]);

		createOnboardingWebhookListener(emitter, dao.mockDao);

		emitter.emit(GITHUB_PUSH, {
			repository: { full_name: "acme/docs" },
		});

		await new Promise(resolve => setTimeout(resolve, 50));

		// Mercure publish was attempted but failure was handled gracefully
		expect(mockPublishOnboardingEvent).toHaveBeenCalled();
		expect(dao.updateStepData).toHaveBeenCalled();
	});
});
