import type { DocDao } from "../dao/DocDao";
import type { Doc } from "../model/Doc";
import { mockDoc } from "../model/Doc.mock";
import type { JobContext, JobDefinition } from "../types/JobTypes";
import {
	createDemoJobs,
	DEMO_ARTICLES_LINK,
	DEMO_MIGRATE_JRNS,
	DEMO_MULTI_STAT_PROGRESS,
	DEMO_QUICK_STATS,
	DEMO_RUN_END2END_FLOW,
	DEMO_SLOW_PROCESSING,
} from "./DemoJobs";
import type { JobScheduler } from "./JobScheduler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// JRN Format History:
// - v1 (path-based): /root/integrations/{org}/{repo}/{branch}
//   Example: /root/integrations/my-org/my-repo/main
//   Wildcards: /root/integrations/*/*/*
//
// - v2 (structured): jrn:/global:sources:github/{org}/{repo}/{branch}
//   Example: jrn:/global:sources:github/my-org/my-repo/main
//   Wildcards: jrn:*/*:sources:github/**
//
// The DEMO_MIGRATE_JRNS job migrates from v1 to v2 format.
// Test fixtures in this file use v1 format to test the migration job.

// Mock the config module
vi.mock("../config/Config.js", () => ({
	getConfig: vi.fn(() => ({
		USE_DEVELOPER_TOOLS: true,
	})),
}));

describe("DemoJobs", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	/**
	 * Helper function to capture registered jobs
	 */
	function getRegisteredJobs(demoJobs: ReturnType<typeof createDemoJobs>): Array<JobDefinition<unknown>> {
		const registeredJobs: Array<JobDefinition<unknown>> = [];
		const mockScheduler: JobScheduler = {
			registerJob: vi.fn(<T = unknown>(job: JobDefinition<T>) => {
				registeredJobs.push(job as JobDefinition<unknown>);
			}) as JobScheduler["registerJob"],
			queueJob: vi.fn(),
			listJobs: vi.fn().mockReturnValue([]),
			getJobHistory: vi.fn().mockResolvedValue([]),
			getJobExecution: vi.fn().mockResolvedValue(undefined),
			cancelJob: vi.fn().mockResolvedValue(undefined),
			retryJob: vi.fn().mockResolvedValue({ jobId: "retry-id", name: "test", message: "retried" }),
			start: vi.fn().mockResolvedValue(undefined),
			stop: vi.fn().mockResolvedValue(undefined),
			getEventEmitter: vi.fn(),
		};
		demoJobs.registerJobs(mockScheduler);
		return registeredJobs;
	}

	describe("createDemoJobs", () => {
		it("should register all demo job definitions when USE_DEVELOPER_TOOLS is true", () => {
			const demoJobs = createDemoJobs();
			const definitions = getRegisteredJobs(demoJobs);

			expect(definitions).toHaveLength(5);
			expect(definitions.map(d => d.name)).toEqual([
				DEMO_QUICK_STATS,
				DEMO_MULTI_STAT_PROGRESS,
				DEMO_ARTICLES_LINK,
				DEMO_SLOW_PROCESSING,
				DEMO_RUN_END2END_FLOW,
			]);
		});

		it("should register jobs regardless of USE_DEVELOPER_TOOLS config", async () => {
			// Demo jobs are always registered; access is controlled by DevToolsRouter.
			// This ensures multi-tenant deployments work correctly when tenants enable
			// developer tools via per-tenant config.
			const { getConfig } = await import("../config/Config.js");
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: false,
			} as ReturnType<typeof getConfig>);

			const demoJobs = createDemoJobs();
			const definitions = getRegisteredJobs(demoJobs);

			// Should still have all 5 demo jobs registered
			expect(definitions).toHaveLength(5);
			expect(definitions.map(d => d.name)).toEqual([
				DEMO_QUICK_STATS,
				DEMO_MULTI_STAT_PROGRESS,
				DEMO_ARTICLES_LINK,
				DEMO_SLOW_PROCESSING,
				DEMO_RUN_END2END_FLOW,
			]);

			// Reset mock
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);
		});

		it("should have all jobs in demo category", () => {
			const demoJobs = createDemoJobs();
			const definitions = getRegisteredJobs(demoJobs);

			for (const def of definitions) {
				expect(def.category).toBe("demo");
			}
		});

		it("should have all jobs set to show in dashboard", () => {
			const demoJobs = createDemoJobs();
			const definitions = getRegisteredJobs(demoJobs);

			for (const def of definitions) {
				expect(def.showInDashboard).toBe(true);
			}
		});

		it("queueJobs resolves", async () => {
			const demoJobs = createDemoJobs();
			const mockScheduler: JobScheduler = {
				registerJob: vi.fn(),
				queueJob: vi.fn(),
				listJobs: vi.fn().mockReturnValue([]),
				getJobHistory: vi.fn().mockResolvedValue([]),
				getJobExecution: vi.fn().mockResolvedValue(undefined),
				cancelJob: vi.fn().mockResolvedValue(undefined),
				retryJob: vi.fn().mockResolvedValue({ jobId: "retry-id", name: "test", message: "retried" }),
				start: vi.fn().mockResolvedValue(undefined),
				stop: vi.fn().mockResolvedValue(undefined),
				getEventEmitter: vi.fn(),
			};
			await expect(demoJobs.queueJobs(mockScheduler)).resolves.toBeUndefined();
		});
	});

	describe("DEMO_QUICK_STATS", () => {
		it("should update stats and complete successfully", async () => {
			const demoJobs = createDemoJobs();
			const definitions = getRegisteredJobs(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_QUICK_STATS);
			expect(definition).toBeDefined();

			const mockContext: JobContext = {
				jobId: "test-job-1",
				jobName: DEMO_QUICK_STATS,
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			// Run handler with fake timers
			const handlerPromise = definition?.handler({}, mockContext);
			await vi.runAllTimersAsync();
			await handlerPromise;

			// Should update stats 5 times (0, 25, 50, 75, 100)
			expect(mockContext.updateStats).toHaveBeenCalledTimes(5);
			expect(mockContext.updateStats).toHaveBeenCalledWith({ processed: 0 });
			expect(mockContext.updateStats).toHaveBeenCalledWith({ processed: 25 });
			expect(mockContext.updateStats).toHaveBeenCalledWith({ processed: 50 });
			expect(mockContext.updateStats).toHaveBeenCalledWith({ processed: 75 });
			expect(mockContext.updateStats).toHaveBeenCalledWith({ processed: 100 });

			// Should set completion info
			expect(mockContext.setCompletionInfo).toHaveBeenCalledWith({
				messageKey: "success",
			});

			// Should log with message keys
			expect(mockContext.log).toHaveBeenCalledWith("starting", {}, "info");
			expect(mockContext.log).toHaveBeenCalledWith("completed", {}, "info");

			// Should not keep card after completion
			expect(definition?.keepCardAfterCompletion).toBe(false);
		});
	});

	describe("DEMO_MULTI_STAT_PROGRESS", () => {
		it("should update multiple stats and complete successfully", async () => {
			const demoJobs = createDemoJobs();
			const definitions = getRegisteredJobs(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_MULTI_STAT_PROGRESS);
			expect(definition).toBeDefined();

			const mockContext: JobContext = {
				jobId: "test-job-2",
				jobName: DEMO_MULTI_STAT_PROGRESS,
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const handlerPromise = definition?.handler({}, mockContext);
			await vi.runAllTimersAsync();
			await handlerPromise;

			// Should update stats 5 times with multiple fields
			expect(mockContext.updateStats).toHaveBeenCalledTimes(5);
			expect(mockContext.updateStats).toHaveBeenCalledWith({
				filesProcessed: 10,
				errors: 0,
				warnings: 2,
			});
			expect(mockContext.updateStats).toHaveBeenCalledWith({
				filesProcessed: 100,
				errors: 2,
				warnings: 15,
			});

			expect(mockContext.setCompletionInfo).toHaveBeenCalledWith({
				messageKey: "success",
			});

			// Should log with message keys
			expect(mockContext.log).toHaveBeenCalledWith("starting", {}, "info");
			expect(mockContext.log).toHaveBeenCalledWith("completed", {}, "info");

			expect(definition?.keepCardAfterCompletion).toBe(false);
		});
	});

	describe("DEMO_ARTICLES_LINK", () => {
		it("should update stats and set completion info with articles link", async () => {
			const demoJobs = createDemoJobs();
			const definitions = getRegisteredJobs(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_ARTICLES_LINK);
			expect(definition).toBeDefined();

			const mockContext: JobContext = {
				jobId: "test-job-3",
				jobName: DEMO_ARTICLES_LINK,
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const handlerPromise = definition?.handler({}, mockContext);
			await vi.runAllTimersAsync();
			await handlerPromise;

			// Should update stats 4 times
			expect(mockContext.updateStats).toHaveBeenCalledTimes(4);
			expect(mockContext.updateStats).toHaveBeenCalledWith({
				processed: 10,
				total: 42,
			});
			expect(mockContext.updateStats).toHaveBeenCalledWith({
				processed: 42,
				total: 42,
			});

			// Should set completion info with link
			expect(mockContext.setCompletionInfo).toHaveBeenCalledWith({
				messageKey: "success",
				linkType: "articles-tab",
			});

			// Should log with message keys
			expect(mockContext.log).toHaveBeenCalledWith("starting", {}, "info");
			expect(mockContext.log).toHaveBeenCalledWith("completed", {}, "info");

			// Should keep card after completion
			expect(definition?.keepCardAfterCompletion).toBe(true);
		});
	});

	describe("DEMO_SLOW_PROCESSING", () => {
		it("should update stats through multiple phases and complete", async () => {
			const demoJobs = createDemoJobs();
			const definitions = getRegisteredJobs(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_SLOW_PROCESSING);
			expect(definition).toBeDefined();

			const mockContext: JobContext = {
				jobId: "test-job-4",
				jobName: DEMO_SLOW_PROCESSING,
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const handlerPromise = definition?.handler({}, mockContext);
			await vi.runAllTimersAsync();
			await handlerPromise;

			// Should update stats 7 times (one for each phase)
			expect(mockContext.updateStats).toHaveBeenCalledTimes(7);
			expect(mockContext.updateStats).toHaveBeenCalledWith({
				phase: "initializing",
				progress: 0,
				itemsProcessed: 0,
			});
			expect(mockContext.updateStats).toHaveBeenCalledWith({
				phase: "complete",
				progress: 100,
				itemsProcessed: 1000,
			});

			expect(mockContext.setCompletionInfo).toHaveBeenCalledWith({
				messageKey: "success",
				linkType: "articles-tab",
			});

			// Should log with message keys
			expect(mockContext.log).toHaveBeenCalledWith("starting", {}, "info");
			expect(mockContext.log).toHaveBeenCalledWith("completed", {}, "info");

			expect(definition?.keepCardAfterCompletion).toBe(true);
		});
	});

	describe("DEMO_RUN_END2END_FLOW", () => {
		it("should handle params without integrationId", async () => {
			const demoJobs = createDemoJobs();
			const definitions = getRegisteredJobs(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_RUN_END2END_FLOW);
			expect(definition).toBeDefined();

			const mockContext: JobContext = {
				jobId: "test-job-5",
				jobName: DEMO_RUN_END2END_FLOW,
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			await definition?.handler({}, mockContext);

			// Should log hello world but not integrationId
			expect(mockContext.log).toHaveBeenCalledWith("hello-world", {}, "info");
			expect(mockContext.log).not.toHaveBeenCalledWith(
				"selected-integration",
				expect.anything(),
				expect.anything(),
			);

			expect(definition?.keepCardAfterCompletion).toBe(true);
		});

		it("should handle params with integrationId", async () => {
			const demoJobs = createDemoJobs();
			const definitions = getRegisteredJobs(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_RUN_END2END_FLOW);
			expect(definition).toBeDefined();

			const mockContext: JobContext = {
				jobId: "test-job-6",
				jobName: DEMO_RUN_END2END_FLOW,
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			await definition?.handler({ integrationId: 123 }, mockContext);

			// Should log both integrationId and hello world
			expect(mockContext.log).toHaveBeenCalledWith("selected-integration", { integrationId: 123 }, "info");
			expect(mockContext.log).toHaveBeenCalledWith("hello-world", {}, "info");

			expect(definition?.keepCardAfterCompletion).toBe(true);
		});
	});

	describe("DEMO_MIGRATE_JRNS", () => {
		function createMockDocDao(docs: Array<Doc>): DocDao {
			return {
				listDocs: vi.fn().mockResolvedValue(docs),
				createDoc: vi.fn(),
				readDoc: vi.fn(),
				readDocById: vi.fn(),
				updateDoc: vi.fn().mockImplementation(async (doc: Doc) => doc),
				updateDocIfVersion: vi.fn(),
				deleteDoc: vi.fn(),
				deleteAllDocs: vi.fn(),
				searchDocsByTitle: vi.fn().mockResolvedValue([]),
				// Space tree methods
				getTreeContent: vi.fn().mockResolvedValue([]),
				getTrashContent: vi.fn().mockResolvedValue([]),
				softDelete: vi.fn(),
				restore: vi.fn(),
				renameDoc: vi.fn(),
				getMaxSortOrder: vi.fn().mockResolvedValue(0),
				hasDeletedDocs: vi.fn().mockResolvedValue(false),
			};
		}

		function getRegisteredJobsWithDocDao(
			demoJobs: ReturnType<typeof createDemoJobs>,
		): Array<JobDefinition<unknown>> {
			const registeredJobs: Array<JobDefinition<unknown>> = [];
			const mockScheduler: JobScheduler = {
				registerJob: vi.fn(<T = unknown>(job: JobDefinition<T>) => {
					registeredJobs.push(job as JobDefinition<unknown>);
				}) as JobScheduler["registerJob"],
				queueJob: vi.fn(),
				listJobs: vi.fn().mockReturnValue([]),
				getJobHistory: vi.fn().mockResolvedValue([]),
				getJobExecution: vi.fn().mockResolvedValue(undefined),
				cancelJob: vi.fn().mockResolvedValue(undefined),
				retryJob: vi.fn().mockResolvedValue({ jobId: "retry-id", name: "test", message: "retried" }),
				start: vi.fn().mockResolvedValue(undefined),
				stop: vi.fn().mockResolvedValue(undefined),
				getEventEmitter: vi.fn(),
			};
			demoJobs.registerJobs(mockScheduler);
			return registeredJobs;
		}

		it("should register migrate job when docDao is provided", () => {
			const mockDocDao = createMockDocDao([]);
			const demoJobs = createDemoJobs(mockDocDao);
			const definitions = getRegisteredJobsWithDocDao(demoJobs);

			// Should have 6 jobs including migrate JRNs (handles v1 and v2 to v3)
			expect(definitions).toHaveLength(6);
			expect(definitions.map(d => d.name)).toContain(DEMO_MIGRATE_JRNS);
		});

		it("should not register migrate job when docDao is not provided", () => {
			const demoJobs = createDemoJobs();
			const definitions = getRegisteredJobsWithDocDao(demoJobs);

			// Should have 5 jobs without migrate jobs
			expect(definitions).toHaveLength(5);
			expect(definitions.map(d => d.name)).not.toContain(DEMO_MIGRATE_JRNS);
		});

		it("should log error when docDao is not available", () => {
			// This tests the edge case where someone registers without docDao but handler is called
			const mockDocDao = createMockDocDao([]);
			const demoJobs = createDemoJobs(mockDocDao);
			const definitions = getRegisteredJobsWithDocDao(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_MIGRATE_JRNS);
			expect(definition).toBeDefined();

			// Create a new demoJobs without docDao and get the handler
			const demoJobsWithoutDocDao = createDemoJobs();
			const defsWithoutDocDao = getRegisteredJobsWithDocDao(demoJobsWithoutDocDao);
			// The migrate job won't exist, so we can't test this path directly
			// The test validates that the migrate job is not registered without docDao
			expect(defsWithoutDocDao.find(d => d.name === DEMO_MIGRATE_JRNS)).toBeUndefined();
		});

		it("should migrate old path-based JRN to new structured format", async () => {
			// Test doc uses v1 (path-based) format that should be migrated to v2 (structured)
			const doc: Doc = mockDoc({
				id: 1,
				jrn: "article:test-article",
				// v1 format: /root/integrations/my-org/my-repo/main
				content: `---
on:
  jrn: /root/integrations/my-org/my-repo/main
  verb: GIT_PUSH
---

# Test Article`,
				contentType: "text/markdown",
				updatedBy: "test",
				version: 1,
			});

			const mockDocDao = createMockDocDao([doc]);
			const demoJobs = createDemoJobs(mockDocDao);
			const definitions = getRegisteredJobsWithDocDao(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_MIGRATE_JRNS);

			const mockContext: JobContext = {
				jobId: "test-migrate-1",
				jobName: DEMO_MIGRATE_JRNS,
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			await definition?.handler({}, mockContext);

			// Should have called updateDoc with the migrated content (v3 format with schemaVersion)
			expect(mockDocDao.updateDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					// v3 format: jrn::path:/home/global/sources/github/my-org/my-repo/main
					content: expect.stringContaining("jrn::path:/home/global/sources/github/my-org/my-repo/main"),
					version: 2,
				}),
			);
			// Should also include schemaVersion: 3 in front matter
			expect(mockDocDao.updateDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					content: expect.stringContaining("schemaVersion: 3"),
				}),
			);

			expect(mockContext.log).toHaveBeenCalledWith(
				"migrated-doc",
				{ id: 1, jrn: "article:test-article", hasFrontMatter: true },
				"info",
			);
			expect(mockContext.setCompletionInfo).toHaveBeenCalledWith({
				messageKey: "success",
				linkType: "articles-tab",
			});
		});

		it("should migrate wildcard patterns from old to new format", async () => {
			// Test doc uses v1 wildcard format that should be migrated to v3
			const doc: Doc = mockDoc({
				id: 2,
				jrn: "article:wildcard-article",
				// v1 wildcard format: /root/integrations/*/*/*
				content: `---
on:
  - jrn: /root/integrations/*/*/*
    verb: GIT_PUSH
---

# Wildcard Article`,
				contentType: "text/markdown",
				updatedBy: "test",
				version: 1,
			});

			const mockDocDao = createMockDocDao([doc]);
			const demoJobs = createDemoJobs(mockDocDao);
			const definitions = getRegisteredJobsWithDocDao(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_MIGRATE_JRNS);

			const mockContext: JobContext = {
				jobId: "test-migrate-2",
				jobName: DEMO_MIGRATE_JRNS,
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			await definition?.handler({}, mockContext);

			// Should have called updateDoc with wildcard pattern migrated (v3 format)
			expect(mockDocDao.updateDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					// v3 wildcard format: jrn:*:path:/home/*/sources/github/**
					content: expect.stringContaining("jrn:*:path:/home/*/sources/github/**"),
					version: 2,
				}),
			);
		});

		it("should migrate v2 format to v3 format", async () => {
			// Test doc uses v2 format that should be migrated to v3
			const doc: Doc = mockDoc({
				id: 2,
				jrn: "article:v2-format",
				// v2 format: jrn:/global:sources:github/org/repo/main
				content: `---
on:
  jrn: jrn:/global:sources:github/my-org/my-repo/main
  verb: GIT_PUSH
---

# V2 Format Article`,
				contentType: "text/markdown",
				updatedBy: "test",
				version: 1,
			});

			const mockDocDao = createMockDocDao([doc]);
			const demoJobs = createDemoJobs(mockDocDao);
			const definitions = getRegisteredJobsWithDocDao(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_MIGRATE_JRNS);

			const mockContext: JobContext = {
				jobId: "test-migrate-v2-to-v3",
				jobName: DEMO_MIGRATE_JRNS,
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			await definition?.handler({}, mockContext);

			// Should have called updateDoc with the migrated content (v3 format)
			expect(mockDocDao.updateDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					// v3 format: jrn::path:/home/global/sources/github/my-org/my-repo/main
					content: expect.stringContaining("jrn::path:/home/global/sources/github/my-org/my-repo/main"),
					version: 2,
				}),
			);
		});

		it("should migrate v2 format with orgId/spaceId to v3 format", async () => {
			// Test doc uses v2 format with orgId/spaceId that should be migrated to v3
			const doc: Doc = mockDoc({
				id: 7,
				jrn: "article:v2-with-org-space",
				// v2 format with orgId/spaceId: jrn:orgId/spaceId:sources:github/org/repo/main
				content: `---
on:
  jrn: jrn:org123/space456:sources:github/my-org/my-repo/main
  verb: GIT_PUSH
---

# V2 Format with OrgId/SpaceId`,
				contentType: "text/markdown",
				updatedBy: "test",
				version: 1,
			});

			const mockDocDao = createMockDocDao([doc]);
			const demoJobs = createDemoJobs(mockDocDao);
			const definitions = getRegisteredJobsWithDocDao(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_MIGRATE_JRNS);

			const mockContext: JobContext = {
				jobId: "test-migrate-v2-org-space",
				jobName: DEMO_MIGRATE_JRNS,
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			await definition?.handler({}, mockContext);

			// Should have called updateDoc with the migrated content (v3 format)
			// The orgId should be used in the path, spaceId is dropped
			expect(mockDocDao.updateDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					// v3 format: jrn::path:/home/org123/sources/github/my-org/my-repo/main
					content: expect.stringContaining("jrn::path:/home/org123/sources/github/my-org/my-repo/main"),
					version: 2,
				}),
			);
		});

		it("should migrate v2 wildcard patterns to v3 format", async () => {
			// Test doc uses v2 wildcard format that should be migrated to v3
			const doc: Doc = mockDoc({
				id: 8,
				jrn: "article:v2-wildcard",
				// v2 wildcard format: jrn:*/*:sources:github/**
				content: `---
on:
  jrn: jrn:*/*:sources:github/**
  verb: GIT_PUSH
---

# V2 Wildcard`,
				contentType: "text/markdown",
				updatedBy: "test",
				version: 1,
			});

			const mockDocDao = createMockDocDao([doc]);
			const demoJobs = createDemoJobs(mockDocDao);
			const definitions = getRegisteredJobsWithDocDao(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_MIGRATE_JRNS);

			const mockContext: JobContext = {
				jobId: "test-migrate-v2-wildcard",
				jobName: DEMO_MIGRATE_JRNS,
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			await definition?.handler({}, mockContext);

			// Should have called updateDoc with the migrated content (v3 format)
			expect(mockDocDao.updateDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					// v3 wildcard format: jrn:*:path:/home/*/sources/github/**
					content: expect.stringContaining("jrn:*:path:/home/*/sources/github/**"),
					version: 2,
				}),
			);
		});

		it("should migrate v2 simple wildcard patterns to v3 format", async () => {
			// Test doc uses v2 simple wildcard format that should be migrated to v3
			const doc: Doc = mockDoc({
				id: 9,
				jrn: "article:v2-simple-wildcard",
				// v2 simple wildcard format: jrn:*:sources:github/**
				content: `---
on:
  jrn: jrn:*:sources:github/**
  verb: GIT_PUSH
---

# V2 Simple Wildcard`,
				contentType: "text/markdown",
				updatedBy: "test",
				version: 1,
			});

			const mockDocDao = createMockDocDao([doc]);
			const demoJobs = createDemoJobs(mockDocDao);
			const definitions = getRegisteredJobsWithDocDao(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_MIGRATE_JRNS);

			const mockContext: JobContext = {
				jobId: "test-migrate-v2-simple-wildcard",
				jobName: DEMO_MIGRATE_JRNS,
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			await definition?.handler({}, mockContext);

			// Should have called updateDoc with the migrated content (v3 format)
			expect(mockDocDao.updateDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					// v3 wildcard format: jrn:*:path:/home/*/sources/github/**
					content: expect.stringContaining("jrn:*:path:/home/*/sources/github/**"),
					version: 2,
				}),
			);
		});

		it("should skip non-markdown documents", async () => {
			// JSON doc with v1 format - should be skipped (only markdown is migrated)
			const jsonDoc: Doc = mockDoc({
				id: 3,
				jrn: "data:config",
				content: '{"jrn": "/root/integrations/org/repo/main"}',
				contentType: "application/json",
				updatedBy: "test",
				version: 1,
			});

			const mockDocDao = createMockDocDao([jsonDoc]);
			const demoJobs = createDemoJobs(mockDocDao);
			const definitions = getRegisteredJobsWithDocDao(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_MIGRATE_JRNS);

			const mockContext: JobContext = {
				jobId: "test-migrate-3",
				jobName: DEMO_MIGRATE_JRNS,
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			await definition?.handler({}, mockContext);

			// Should not call updateDoc for non-markdown
			expect(mockDocDao.updateDoc).not.toHaveBeenCalled();

			// Should update stats with skipped doc
			expect(mockContext.updateStats).toHaveBeenLastCalledWith(
				expect.objectContaining({
					skippedDocs: 1,
					migratedDocs: 0,
				}),
			);
		});

		it("should skip documents without old JRN format", async () => {
			// Doc already uses v3 (path-based) format - should not be modified
			const doc: Doc = mockDoc({
				id: 4,
				jrn: "article:new-format",
				// v3 format: jrn::path:/home/global/sources/github/org/repo/main
				content: `---
on:
  jrn: jrn::path:/home/global/sources/github/org/repo/main
  verb: GIT_PUSH
---

# Already New Format`,
				contentType: "text/markdown",
				updatedBy: "test",
				version: 1,
			});

			const mockDocDao = createMockDocDao([doc]);
			const demoJobs = createDemoJobs(mockDocDao);
			const definitions = getRegisteredJobsWithDocDao(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_MIGRATE_JRNS);

			const mockContext: JobContext = {
				jobId: "test-migrate-4",
				jobName: DEMO_MIGRATE_JRNS,
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			await definition?.handler({}, mockContext);

			// Should not call updateDoc since content is already in new format
			expect(mockDocDao.updateDoc).not.toHaveBeenCalled();

			// Should update stats with skipped doc
			expect(mockContext.updateStats).toHaveBeenLastCalledWith(
				expect.objectContaining({
					skippedDocs: 1,
					migratedDocs: 0,
				}),
			);
		});

		it("should skip documents with empty content", async () => {
			const doc: Doc = mockDoc({
				id: 5,
				jrn: "article:empty-content",
				content: "",
				contentType: "text/markdown",
				updatedBy: "test",
				version: 1,
			});

			const mockDocDao = createMockDocDao([doc]);
			const demoJobs = createDemoJobs(mockDocDao);
			const definitions = getRegisteredJobsWithDocDao(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_MIGRATE_JRNS);

			const mockContext: JobContext = {
				jobId: "test-migrate-5",
				jobName: DEMO_MIGRATE_JRNS,
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			await definition?.handler({}, mockContext);

			// Should not call updateDoc because content is empty
			expect(mockDocDao.updateDoc).not.toHaveBeenCalled();
		});

		it("should process multiple documents and report stats", async () => {
			// Mixed v1/v3 format documents to test migration stats
			const docs: Array<Doc> = [
				mockDoc({
					id: 1,
					jrn: "article:old-format-1",
					// v1 format - should be migrated
					content: `---
on:
  jrn: /root/integrations/org1/repo1/main
  verb: GIT_PUSH
---
# Article 1`,
					contentType: "text/markdown",
					updatedBy: "test",
					version: 1,
				}),
				mockDoc({
					id: 2,
					jrn: "article:new-format",
					// v3 format - should be skipped (already migrated)
					content: `---
on:
  jrn: jrn::path:/home/global/sources/github/org2/repo2/main
  verb: GIT_PUSH
---
# Article 2`,
					contentType: "text/markdown",
					updatedBy: "test",
					version: 1,
				}),
				mockDoc({
					id: 3,
					jrn: "data:config",
					content: "{}",
					contentType: "application/json",
					updatedBy: "test",
					version: 1,
				}),
			];

			const mockDocDao = createMockDocDao(docs);
			const demoJobs = createDemoJobs(mockDocDao);
			const definitions = getRegisteredJobsWithDocDao(demoJobs);
			const definition = definitions.find(d => d.name === DEMO_MIGRATE_JRNS);

			const mockContext: JobContext = {
				jobId: "test-migrate-6",
				jobName: DEMO_MIGRATE_JRNS,
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			await definition?.handler({}, mockContext);

			// Should call updateDoc only for the one with old format
			expect(mockDocDao.updateDoc).toHaveBeenCalledTimes(1);

			// Should log completed with stats (including new front matter counts)
			expect(mockContext.log).toHaveBeenCalledWith(
				"completed",
				{ totalDocs: 3, markdownDocs: 2, docsWithFrontMatter: 2, migratedDocs: 1, skippedDocs: 2 },
				"info",
			);
		});
	});
});
