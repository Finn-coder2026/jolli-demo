import type { DocDao } from "../dao/DocDao";
import type { JobDefinition } from "../types/JobTypes";
import { getLog } from "../util/Logger";
import type { JobScheduler } from "./JobScheduler";
import { z } from "zod";

const log = getLog(import.meta);

export const DEMO_QUICK_STATS = "demo:quick-stats";
export const DEMO_MULTI_STAT_PROGRESS = "demo:multi-stat-progress";
export const DEMO_ARTICLES_LINK = "demo:articles-link";
export const DEMO_SLOW_PROCESSING = "demo:slow-processing";
export const DEMO_RUN_END2END_FLOW = "demo:run-end2end-flow";
export const DEMO_MIGRATE_JRNS = "demo:migrate-jrns";

/**
 * Demo/test jobs for demonstrating dashboard widgets
 */
export interface DemoJobs {
	/**
	 * Get all demo job definitions.
	 * These are always registered; access is controlled by DevToolsRouter.
	 */
	getDefinitions(): Array<JobDefinition>;
	/**
	 * Register all demo jobs with the scheduler
	 */
	registerJobs(jobScheduler: JobScheduler): void;
	/**
	 * Queue initial demo jobs
	 */
	queueJobs(jobScheduler: JobScheduler): Promise<void>;
}

/**
 * Sleep helper for demo jobs
 */
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper to migrate JRN content from v1 or v2 format to v3 format.
 * Autodetects the source format and migrates to v3.
 * Also adds schemaVersion: 3 to front matter if JRNs were migrated.
 *
 * v1 format: /root/integrations/{org}/{repo}/{branch}
 * v2 format: jrn:/{spaceId}:sources:github/{org}/{repo}/{branch}
 * v3 format: jrn::path:/home/{spaceId}/sources/github/{org}/{repo}/{branch}
 */
function migrateJrnContent(content: string): { content: string; modified: boolean } {
	let result = content;
	let modified = false;

	// === V1 to V3 migrations ===

	// v1 specific paths: /root/integrations/{org}/{repo}/{branch} -> jrn::path:/home/global/sources/github/{org}/{repo}/{branch}
	const v1SpecificPathPattern = /\/root\/integrations\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._/-]+)/g;
	if (v1SpecificPathPattern.test(result)) {
		v1SpecificPathPattern.lastIndex = 0; // Reset regex state
		result = result.replace(v1SpecificPathPattern, "jrn::path:/home/global/sources/github/$1/$2/$3");
		modified = true;
	}

	// v1 wildcards: /root/integrations/*/* -> jrn:*:path:/home/*/sources/github/**
	const v1WildcardPattern = /\/root\/integrations\/\*(?:\/\*)+/g;
	if (v1WildcardPattern.test(result)) {
		v1WildcardPattern.lastIndex = 0; // Reset regex state
		result = result.replace(v1WildcardPattern, "jrn:*:path:/home/*/sources/github/**");
		modified = true;
	}

	// === V2 to V3 migrations ===

	// v2: jrn:/{spaceId}:sources:github/{org}/{repo}/{branch} -> jrn::path:/home/{spaceId}/sources/github/{org}/{repo}/{branch}
	const v2GithubSourcePattern =
		/jrn:\/([a-zA-Z0-9_-]+):sources:github\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._/-]+)/g;
	if (v2GithubSourcePattern.test(result)) {
		v2GithubSourcePattern.lastIndex = 0; // Reset regex state
		result = result.replace(v2GithubSourcePattern, "jrn::path:/home/$1/sources/github/$2/$3/$4");
		modified = true;
	}

	// v2: jrn:{orgId}/{spaceId}:sources:github/{org}/{repo}/{branch} -> jrn::path:/home/{orgId}/sources/github/{org}/{repo}/{branch}
	const v2GithubSourceWithOrgPattern =
		/jrn:([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+):sources:github\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._/-]+)/g;
	if (v2GithubSourceWithOrgPattern.test(result)) {
		v2GithubSourceWithOrgPattern.lastIndex = 0; // Reset regex state
		result = result.replace(v2GithubSourceWithOrgPattern, "jrn::path:/home/$1/sources/github/$3/$4/$5");
		modified = true;
	}

	// v2 wildcards: jrn:*/*:sources:github/** -> jrn:*:path:/home/*/sources/github/**
	const v2WildcardPattern = /jrn:\*\/\*:sources:github\/\*\*/g;
	if (v2WildcardPattern.test(result)) {
		v2WildcardPattern.lastIndex = 0; // Reset regex state
		result = result.replace(v2WildcardPattern, "jrn:*:path:/home/*/sources/github/**");
		modified = true;
	}

	// v2 simple wildcards: jrn:*:sources:github/** -> jrn:*:path:/home/*/sources/github/**
	const v2SimpleWildcardPattern = /jrn:\*:sources:github\/\*\*/g;
	if (v2SimpleWildcardPattern.test(result)) {
		v2SimpleWildcardPattern.lastIndex = 0; // Reset regex state
		result = result.replace(v2SimpleWildcardPattern, "jrn:*:path:/home/*/sources/github/**");
		modified = true;
	}

	// Add schemaVersion: 3 to front matter if JRNs were migrated
	if (modified && result.startsWith("---")) {
		// Find the end of front matter
		const endOfFrontMatter = result.indexOf("\n---", 3);
		if (endOfFrontMatter !== -1) {
			// Check if schemaVersion already exists
			const frontMatter = result.substring(0, endOfFrontMatter);
			if (!frontMatter.includes("schemaVersion:")) {
				// Insert schemaVersion: 3 after the opening ---
				result = `---\nschemaVersion: 3${result.substring(3)}`;
			}
		}
	}

	return { content: result, modified };
}

/**
 * Create demo/test jobs for dashboard widget testing.
 * Job definitions are always registered; access is controlled by DevToolsRouter.
 * @param docDao Optional DocDao for jobs that need to access documents
 */
export function createDemoJobs(docDao?: DocDao): DemoJobs {
	/**
	 * Get all demo job definitions.
	 * These are always registered; access is controlled by DevToolsRouter's
	 * USE_DEVELOPER_TOOLS check.
	 */
	function getDefinitions(): Array<JobDefinition> {
		/**
		 * Quick stats demo - shows simple incrementing counter (5-10 seconds)
		 */
		const quickStatsSchema = z.object({
			processed: z.number(),
		});

		const quickStatsDefinition: JobDefinition<Record<string, never>, z.infer<typeof quickStatsSchema>> = {
			name: DEMO_QUICK_STATS,
			description: "Quick demo job showing simple stat updates (5-10 seconds)",
			category: "demo",
			schema: z.object({}),
			statsSchema: quickStatsSchema,
			handler: async (_params, context) => {
				context.log("starting", {}, "info");

				const steps = [0, 25, 50, 75, 100];
				for (let i = 0; i < steps.length; i++) {
					await context.updateStats({ processed: steps[i] });
					context.log("processed-progress", { processed: steps[i] }, "info");
					if (i < steps.length - 1) {
						await sleep(2000); // 2 seconds between updates
					}
				}

				await context.setCompletionInfo({
					messageKey: "success",
				});
				context.log("completed", {}, "info");
			},
			showInDashboard: true,
			keepCardAfterCompletion: false,
		};

		/**
		 * Multi-stat progress demo - shows multiple stats updating (15-20 seconds)
		 */
		const multiStatSchema = z.object({
			filesProcessed: z.number(),
			errors: z.number(),
			warnings: z.number(),
		});

		const multiStatProgressDefinition: JobDefinition<Record<string, never>, z.infer<typeof multiStatSchema>> = {
			name: DEMO_MULTI_STAT_PROGRESS,
			description: "Demo job showing multiple stats updating (15-20 seconds)",
			category: "demo",
			schema: z.object({}),
			statsSchema: multiStatSchema,
			handler: async (_params, context) => {
				context.log("starting", {}, "info");

				const updates = [
					{ filesProcessed: 10, errors: 0, warnings: 2 },
					{ filesProcessed: 25, errors: 1, warnings: 5 },
					{ filesProcessed: 50, errors: 1, warnings: 8 },
					{ filesProcessed: 75, errors: 2, warnings: 12 },
					{ filesProcessed: 100, errors: 2, warnings: 15 },
				];

				for (let i = 0; i < updates.length; i++) {
					await context.updateStats(updates[i]);
					context.log("progress", updates[i], "info");
					if (i < updates.length - 1) {
						await sleep(3000); // 3 seconds between updates
					}
				}

				await context.setCompletionInfo({
					messageKey: "success",
				});
				context.log("completed", {}, "info");
			},
			showInDashboard: true,
			keepCardAfterCompletion: false,
		};

		/**
		 * Articles link demo - demonstrates completion info with link (10-15 seconds)
		 */
		const articlesLinkSchema = z.object({
			processed: z.number(),
			total: z.number(),
		});

		const articlesLinkDefinition: JobDefinition<Record<string, never>, z.infer<typeof articlesLinkSchema>> = {
			name: DEMO_ARTICLES_LINK,
			description: "Demo job with completion link to Articles page (10-15 seconds)",
			category: "demo",
			schema: z.object({}),
			statsSchema: articlesLinkSchema,
			handler: async (_params, context) => {
				context.log("starting", {}, "info");

				const totalArticles = 42;
				const updates = [
					{ processed: 10, total: totalArticles },
					{ processed: 21, total: totalArticles },
					{ processed: 32, total: totalArticles },
					{ processed: 42, total: totalArticles },
				];

				for (let i = 0; i < updates.length; i++) {
					await context.updateStats(updates[i]);
					context.log("processed-articles", updates[i], "info");
					if (i < updates.length - 1) {
						await sleep(3000); // 3 seconds between updates
					}
				}

				await context.setCompletionInfo({
					messageKey: "success",
					linkType: "articles-tab",
				});
				context.log("completed", {}, "info");
			},
			showInDashboard: true,
			keepCardAfterCompletion: true,
		};

		/**
		 * Slow processing demo - longer-running job with periodic updates (30-40 seconds)
		 */
		const slowProcessingSchema = z.object({
			phase: z.string(),
			progress: z.number(),
			itemsProcessed: z.number(),
		});

		const slowProcessingDefinition: JobDefinition<Record<string, never>, z.infer<typeof slowProcessingSchema>> = {
			name: DEMO_SLOW_PROCESSING,
			description: "Long-running demo job with multiple phases (30-40 seconds)",
			category: "demo",
			schema: z.object({}),
			statsSchema: slowProcessingSchema,
			handler: async (_params, context) => {
				context.log("starting", {}, "info");

				const phases = [
					{ phase: "initializing", progress: 0, itemsProcessed: 0 },
					{ phase: "loading-data", progress: 10, itemsProcessed: 0 },
					{ phase: "processing-batch-1", progress: 25, itemsProcessed: 250 },
					{ phase: "processing-batch-2", progress: 50, itemsProcessed: 500 },
					{ phase: "processing-batch-3", progress: 75, itemsProcessed: 750 },
					{ phase: "finalizing", progress: 90, itemsProcessed: 1000 },
					{ phase: "complete", progress: 100, itemsProcessed: 1000 },
				];

				for (let i = 0; i < phases.length; i++) {
					await context.updateStats(phases[i]);
					context.log("phase-progress", phases[i], "info");
					if (i < phases.length - 1) {
						await sleep(5000); // 5 seconds between updates
					}
				}

				await context.setCompletionInfo({
					messageKey: "success",
					linkType: "articles-tab",
				});
				context.log("completed", {}, "info");
			},
			showInDashboard: true,
			keepCardAfterCompletion: true,
		};

		/**
		 * Run end2end flow - simple sample that prints "hello world"
		 */
		const RunEnd2EndSchema = z.object({
			integrationId: z.number().optional(),
		});

		const runEnd2EndFlowDefinition: JobDefinition<z.infer<typeof RunEnd2EndSchema>> = {
			name: DEMO_RUN_END2END_FLOW,
			description: "Sample job that prints hello world",
			category: "demo",
			schema: RunEnd2EndSchema,
			handler: (params, context) => {
				if (params?.integrationId !== undefined) {
					context.log("selected-integration", { integrationId: params.integrationId }, "info");
				}
				context.log("hello-world", {}, "info");
				return Promise.resolve();
			},
			showInDashboard: true,
			keepCardAfterCompletion: true,
		};

		/**
		 * Migrate JRNs - migrates old path-based JRN format to new structured JRN format
		 * Old format: /root/integrations/{org}/{repo}/{branch}
		 * New format: jrn:/global:sources:github/{org}/{repo}/{branch}
		 * Also converts wildcard patterns like /root/integrations/star/star/star to jrn:star/star:sources:github/starstar
		 */
		const migrateJrnsStatsSchema = z.object({
			totalDocs: z.number(),
			processedDocs: z.number(),
			migratedDocs: z.number(),
			skippedDocs: z.number(),
		});

		const migrateJrnsDefinition: JobDefinition<Record<string, never>, z.infer<typeof migrateJrnsStatsSchema>> = {
			name: DEMO_MIGRATE_JRNS,
			description: "Migrate old path-based JRN format to new structured JRN format in article content",
			category: "demo",
			schema: z.object({}),
			statsSchema: migrateJrnsStatsSchema,
			handler: async (_params, context) => {
				if (!docDao) {
					context.log("error", { message: "DocDao not available" }, "error");
					return;
				}

				context.log("starting", {}, "info");

				// Get all docs including root
				const allDocs = await docDao.listDocs({ includeRoot: true });
				const totalDocs = allDocs.length;
				let processedDocs = 0;
				let migratedDocs = 0;
				let skippedDocs = 0;

				// Count articles with front matter
				let markdownDocs = 0;
				let docsWithFrontMatter = 0;
				for (const doc of allDocs) {
					if (doc.contentType === "text/markdown" && doc.content) {
						markdownDocs++;
						const content = doc.content as string;
						if (content.startsWith("---")) {
							docsWithFrontMatter++;
						}
					}
				}

				context.log("scan-complete", { totalDocs, markdownDocs, docsWithFrontMatter }, "info");
				log.info(
					"JRN migration scan complete: %d total docs, %d markdown docs, %d with front matter",
					totalDocs,
					markdownDocs,
					docsWithFrontMatter,
				);

				await context.updateStats({ totalDocs, processedDocs, migratedDocs, skippedDocs });

				for (const doc of allDocs) {
					processedDocs++;

					// Only process markdown content
					if (doc.contentType !== "text/markdown" || !doc.content) {
						skippedDocs++;
						await context.updateStats({ totalDocs, processedDocs, migratedDocs, skippedDocs });
						continue;
					}

					const content = doc.content as string;
					const hasFrontMatter = content.startsWith("---");
					const migrationResult = migrateJrnContent(content);

					if (migrationResult.modified) {
						// Update the doc with new content
						const updatedDoc = {
							...doc,
							content: migrationResult.content,
							version: doc.version + 1,
							updatedAt: new Date(),
						};
						await docDao.updateDoc(updatedDoc);
						migratedDocs++;
						context.log("migrated-doc", { id: doc.id, jrn: doc.jrn, hasFrontMatter }, "info");
						log.info("Migrated doc id=%d jrn=%s (hasFrontMatter=%s)", doc.id, doc.jrn, hasFrontMatter);
					} else {
						skippedDocs++;
					}

					await context.updateStats({ totalDocs, processedDocs, migratedDocs, skippedDocs });
				}

				await context.setCompletionInfo({
					messageKey: "success",
					linkType: "articles-tab",
				});
				context.log(
					"completed",
					{ totalDocs, markdownDocs, docsWithFrontMatter, migratedDocs, skippedDocs },
					"info",
				);
				log.info(
					"JRN migration completed: %d total, %d markdown, %d with front matter, %d migrated, %d skipped",
					totalDocs,
					markdownDocs,
					docsWithFrontMatter,
					migratedDocs,
					skippedDocs,
				);
			},
			showInDashboard: true,
			keepCardAfterCompletion: true,
		};

		// Cast to Array<JobDefinition> to satisfy the interface
		// The generic types are erased at runtime, this is safe
		const definitions = [
			quickStatsDefinition,
			multiStatProgressDefinition,
			articlesLinkDefinition,
			slowProcessingDefinition,
			runEnd2EndFlowDefinition,
			// Only add migrate JRNs job if docDao is available
			...(docDao ? [migrateJrnsDefinition] : []),
		] as Array<JobDefinition>;

		return definitions;
	}

	function registerJobs(jobScheduler: JobScheduler): void {
		const definitions = getDefinitions();
		if (definitions.length === 0) {
			return;
		}

		for (const definition of definitions) {
			jobScheduler.registerJob(definition);
		}

		log.info("Demo jobs registered for developer tools");
	}

	async function queueJobs(_jobScheduler: JobScheduler): Promise<void> {
		// no demo jobs need to be queued on startup. Leaving this here to show how queue jobs on startup is done.
	}

	return {
		getDefinitions,
		registerJobs,
		queueJobs,
	};
}
