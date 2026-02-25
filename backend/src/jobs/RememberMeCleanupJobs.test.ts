import type { RememberMeService } from "../services/RememberMeService";
import type { JobScheduler } from "./JobScheduler";
import { CLEANUP_EXPIRED_REMEMBER_ME_TOKENS, createRememberMeCleanupJobs } from "./RememberMeCleanupJobs";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("RememberMeCleanupJobs", () => {
	let mockRememberMeService: RememberMeService;
	let mockJobScheduler: JobScheduler;

	beforeEach(() => {
		vi.clearAllMocks();

		mockRememberMeService = {
			cleanupExpiredTokens: vi.fn().mockResolvedValue(5),
			createToken: vi.fn(),
			validateToken: vi.fn(),
			revokeToken: vi.fn(),
			revokeAllTokensForUser: vi.fn(),
		} as unknown as RememberMeService;

		mockJobScheduler = {
			registerJob: vi.fn(),
			queueJob: vi.fn().mockResolvedValue(undefined),
		} as unknown as JobScheduler;
	});

	describe("getDefinitions", () => {
		it("should return cleanup job definition", () => {
			const authCleanupJobs = createRememberMeCleanupJobs(mockRememberMeService);
			const definitions = authCleanupJobs.getDefinitions();

			expect(definitions).toHaveLength(1);
			expect(definitions[0].name).toBe(CLEANUP_EXPIRED_REMEMBER_ME_TOKENS);
			expect(definitions[0].category).toBe("auth");
			expect(definitions[0].showInDashboard).toBe(true);
		});
	});

	describe("registerJobs", () => {
		it("should register all job definitions with the scheduler", () => {
			const authCleanupJobs = createRememberMeCleanupJobs(mockRememberMeService);

			authCleanupJobs.registerJobs(mockJobScheduler);

			expect(mockJobScheduler.registerJob).toHaveBeenCalledTimes(1);
			expect(mockJobScheduler.registerJob).toHaveBeenCalledWith(
				expect.objectContaining({ name: CLEANUP_EXPIRED_REMEMBER_ME_TOKENS }),
			);
		});
	});

	describe("queueJobs", () => {
		it("should queue the cleanup job with daily cron schedule", async () => {
			const authCleanupJobs = createRememberMeCleanupJobs(mockRememberMeService);

			await authCleanupJobs.queueJobs(mockJobScheduler);

			expect(mockJobScheduler.queueJob).toHaveBeenCalledTimes(1);
			expect(mockJobScheduler.queueJob).toHaveBeenCalledWith({
				name: CLEANUP_EXPIRED_REMEMBER_ME_TOKENS,
				params: {},
				options: {
					cron: "0 2 * * *",
					singletonKey: CLEANUP_EXPIRED_REMEMBER_ME_TOKENS,
				},
			});
		});
	});

	describe("cleanup job handler", () => {
		it("should call cleanupExpiredTokens and log results", async () => {
			const authCleanupJobs = createRememberMeCleanupJobs(mockRememberMeService);
			const definitions = authCleanupJobs.getDefinitions();
			const cleanupJob = definitions[0];

			const mockContext = {
				log: vi.fn(),
				setCompletionInfo: vi.fn().mockResolvedValue(undefined),
				updateStats: vi.fn().mockResolvedValue(undefined),
			};

			await cleanupJob.handler({}, mockContext as never);

			expect(mockRememberMeService.cleanupExpiredTokens).toHaveBeenCalledTimes(1);
			expect(mockContext.log).toHaveBeenCalledWith("starting", {}, "info");
			expect(mockContext.log).toHaveBeenCalledWith("cleanup-complete", { deletedCount: 5 }, "info");
			expect(mockContext.setCompletionInfo).toHaveBeenCalledWith({
				messageKey: "success",
				context: { deleted: 5 },
			});
			expect(mockContext.updateStats).toHaveBeenCalledWith({ deletedCount: 5 });
		});

		it("should handle zero deleted tokens", async () => {
			vi.mocked(mockRememberMeService.cleanupExpiredTokens).mockResolvedValue(0);

			const authCleanupJobs = createRememberMeCleanupJobs(mockRememberMeService);
			const definitions = authCleanupJobs.getDefinitions();
			const cleanupJob = definitions[0];

			const mockContext = {
				log: vi.fn(),
				setCompletionInfo: vi.fn().mockResolvedValue(undefined),
				updateStats: vi.fn().mockResolvedValue(undefined),
			};

			await cleanupJob.handler({}, mockContext as never);

			expect(mockContext.updateStats).toHaveBeenCalledWith({ deletedCount: 0 });
		});
	});
});
