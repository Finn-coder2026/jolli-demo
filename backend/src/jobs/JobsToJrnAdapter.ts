import {
	type JolliScriptFrontMatter,
	type JrnTriggerMatcher,
	parseSections,
} from "../../../tools/jolliagent/src/jolliscript/parser";
import type { DocDao } from "../dao/DocDao";
import type { SourceDao } from "../dao/SourceDao";
import {
	GITHUB_INSTALLATION_REPOSITORIES_ADDED,
	GITHUB_INSTALLATION_REPOSITORIES_REMOVED,
	GITHUB_PUSH,
} from "../events/GithubEvents";
import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import type { Doc } from "../model/Doc";
import { getTenantContext } from "../tenant/TenantContext";
import type { JobContext } from "../types/JobTypes";
import { getLog } from "../util/Logger";
import { jobDefinitionBuilder } from "./JobDefinitions";
import type { JobScheduler } from "./JobScheduler";
import { type GithubRepoIntegrationMetadata, jrnParserV3, matchesAnyJrnPattern } from "jolli-common";
import { z } from "zod";

const log = getLog(import.meta);

// JRN trigger front matter uses JolliScriptFrontMatter from jolliagent.
// The jrn field in front matter is a pattern that matches against event JRNs.
//
// Event JRN v3 format: jrn::path:/home/{orgId}/sources/github/{org}/{repo}/{branch}
//
// Pattern examples (v3):
//   jrn:*:path:/home/*/sources/github/my-org/my-repo/main  (Exact org/repo/branch, any orgId)
//   jrn:*:path:/home/*/sources/github/*/*/main             (Any org, any repo, main branch only)
//   jrn:*:path:/home/*/sources/github/my-org/**            (Any repo/branch under my-org)
//   jrn:*:path:/home/*/sources/github/**                   (Any github source)
//
// Supported wildcards:
// - * matches any single segment (orgId, org, repo, or branch)
// - ** matches zero or more path segments in the resource path

/**
 * Check if an event JRN matches a pattern from article front matter
 * Uses matchesAnyJrnPattern to support both v2 and v3 JRN formats
 */
function matchesJrnPattern(eventJrn: string, pattern: string): boolean {
	return matchesAnyJrnPattern(eventJrn, pattern);
}

/**
 * Jobs to JRN Adapter
 * Listens to GitHub repository add/remove events and logs JRN paths
 */
export interface JobsToJrnAdapter {
	/**
	 * Register all JRN adapter jobs with the scheduler
	 */
	registerJobs: (jobScheduler: JobScheduler) => void;
}

// Schema for the GitHub installation repositories payload
const InstallationRepositoriesSchema = z.object({
	action: z.string(),
	installation: z
		.object({
			id: z.number(),
			app_id: z.number(),
			account: z.object({
				login: z.string(),
				type: z.enum(["Organization", "User"]),
			}),
		})
		.optional(),
	organization: z
		.object({
			id: z.number(),
			login: z.string(),
			type: z.enum(["Organization", "User"]),
		})
		.optional(),
	sender: z
		.object({
			id: z.number(),
			login: z.string(),
			type: z.enum(["Organization", "User"]),
		})
		.optional(),
	repositories_added: z
		.array(
			z.object({
				full_name: z.string(),
				default_branch: z.string().optional(),
			}),
		)
		.optional(),
	repositories_removed: z
		.array(
			z.object({
				full_name: z.string(),
				default_branch: z.string().optional(),
			}),
		)
		.optional(),
});

type InstallationRepositoriesPayload = z.infer<typeof InstallationRepositoriesSchema>;

// Schema for the GitHub push event payload
const GitPushSchema = z.object({
	ref: z.string(),
	before: z.string().optional(),
	after: z.string().optional(),
	forced: z.boolean().optional(),
	repository: z.object({
		full_name: z.string(),
		owner: z.object({
			login: z.string(),
		}),
		name: z.string(),
	}),
	commits: z
		.array(
			z.object({
				added: z.array(z.string()),
				modified: z.array(z.string()),
				removed: z.array(z.string()),
			}),
		)
		.default([]),
}) as z.ZodType<{
	ref: string;
	before?: string;
	after?: string;
	forced?: boolean;
	repository: { full_name: string; owner: { login: string }; name: string };
	commits: Array<{ added: Array<string>; modified: Array<string>; removed: Array<string> }>;
}>;

type GitPushPayload = z.infer<typeof GitPushSchema>;

/**
 * Information about a git push event, passed through to source doc analysis.
 */
export interface PushInfo {
	before?: string;
	after?: string;
	owner: string;
	repo: string;
	branch: string;
}

/**
 * Creates the Jobs to JRN adapter
 * @param integrationsManager - The integrations manager (already multi-tenant aware)
 * @param defaultDocDao - Default DocDao to use when no tenant context is available.
 *                        In multi-tenant mode, handlers will use getTenantContext() to get
 *                        the tenant-specific database.
 * @param defaultSourceDao - Default SourceDao to use when no tenant context is available.
 *                           In multi-tenant mode, handlers will use getTenantContext() to get
 *                           the tenant-specific database.
 */
export function createJobsToJrnAdapter(
	integrationsManager: IntegrationsManager,
	defaultDocDao: DocDao,
	defaultSourceDao: SourceDao,
): JobsToJrnAdapter {
	/**
	 * Get the DocDao to use - prefers tenant context, falls back to default.
	 * This enables multi-tenant support while maintaining backward compatibility.
	 */
	function getDocDao(): DocDao {
		const tenantContext = getTenantContext();
		if (tenantContext?.database?.docDao) {
			return tenantContext.database.docDao;
		}
		return defaultDocDao;
	}

	/**
	 * Queue a source doc analysis job for a non-jolliscript article with source metadata.
	 * This analyzes whether the article needs updating based on the git push diff.
	 */
	async function queueSourceDocAnalysisJob(
		doc: Doc,
		pushInfo: PushInfo,
		context: JobContext,
		jobScheduler: JobScheduler,
	): Promise<void> {
		try {
			const jobResult = await jobScheduler.queueJob({
				name: "knowledge-graph:analyze-source-doc",
				params: {
					docJrn: doc.jrn,
					before: pushInfo.before,
					after: pushInfo.after,
					owner: pushInfo.owner,
					repo: pushInfo.repo,
					branch: pushInfo.branch,
				},
			});
			log.info("Queued analyze-source-doc job for article %s: jobId=%s", doc.jrn, jobResult.jobId);
			context.log("source-doc-analysis-job-queued", {
				articleJrn: doc.jrn,
				articleId: doc.id,
				jobId: jobResult.jobId,
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			log.error("Failed to queue analyze-source-doc job for article %s: %s", doc.jrn, errorMessage);
			context.log("source-doc-analysis-job-queue-failed", {
				articleJrn: doc.jrn,
				articleId: doc.id,
				error: errorMessage,
			});
		}
	}

	/**
	 * Get the SourceDao to use - prefers tenant context, falls back to default.
	 */
	function getSourceDao(): SourceDao {
		const tenantContext = getTenantContext();
		if (tenantContext?.database?.sourceDao) {
			return tenantContext.database.sourceDao;
		}
		return defaultSourceDao;
	}

	/**
	 * Queue a cli-impact job for a matching space source.
	 * Passes cursor and SHA info for incremental diffing.
	 */
	async function queueCliImpactJob(
		spaceId: number,
		sourceId: number,
		integrationId: number,
		eventJrn: string,
		context: JobContext,
		jobScheduler: JobScheduler,
		afterSha?: string,
		cursorSha?: string,
	): Promise<void> {
		try {
			const jobResult = await jobScheduler.queueJob({
				name: "knowledge-graph:cli-impact",
				params: {
					spaceId,
					sourceId,
					integrationId,
					eventJrn,
					killSandbox: false,
					afterSha,
					cursorSha,
				},
			});
			context.log("cli-impact-job-queued", {
				spaceId,
				sourceId,
				integrationId,
				eventJrn,
				jobId: jobResult.jobId,
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			context.log("cli-impact-job-queue-failed", {
				spaceId,
				sourceId,
				integrationId,
				eventJrn,
				error: errorMessage,
			});
		}
	}

	/**
	 * Queue a run-jolliscript job for a jolliscript article
	 */
	async function queueJolliscriptJob(doc: Doc, context: JobContext, jobScheduler: JobScheduler): Promise<void> {
		try {
			const jobResult = await jobScheduler.queueJob({
				name: "knowledge-graph:run-jolliscript",
				params: { docJrn: doc.jrn, killSandbox: false },
			});
			log.info("Queued run-jolliscript job for article %s: jobId=%s", doc.jrn, jobResult.jobId);
			context.log("jolliscript-job-queued", {
				articleJrn: doc.jrn,
				articleId: doc.id,
				jobId: jobResult.jobId,
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			log.error("Failed to queue run-jolliscript job for article %s: %s", doc.jrn, errorMessage);
			context.log("jolliscript-job-queue-failed", {
				articleJrn: doc.jrn,
				articleId: doc.id,
				error: errorMessage,
			});
		}
	}

	/**
	 * Normalize the 'on' field to always be an array of matchers
	 */
	function normalizeOnMatchers(
		on: JrnTriggerMatcher | Array<JrnTriggerMatcher> | undefined,
	): Array<JrnTriggerMatcher> {
		if (!on) {
			return [];
		}
		return Array.isArray(on) ? on : [on];
	}

	/**
	 * Find the first matching trigger matcher from the list
	 */
	function findMatchingTrigger(
		matchers: Array<JrnTriggerMatcher>,
		eventJrn: string,
		verb: "CREATED" | "REMOVED" | "GIT_PUSH",
	): JrnTriggerMatcher | undefined {
		return matchers.find(
			matcher => matcher.jrn && matcher.verb === verb && matchesJrnPattern(eventJrn, matcher.jrn),
		);
	}

	/**
	 * Process a single document to check if it matches the JRN trigger.
	 * @param pushInfo - Optional push info for GIT_PUSH events, used to queue source doc analysis jobs
	 */
	async function processDocForTrigger(
		doc: Doc,
		eventJrn: string,
		verb: "CREATED" | "REMOVED" | "GIT_PUSH",
		context: JobContext,
		jobScheduler: JobScheduler,
		pushInfo?: PushInfo,
	): Promise<boolean> {
		const sections = parseSections(doc.content as string);
		const frontMatterSection = sections.find(s => s.isFrontMatter);

		if (!frontMatterSection?.frontMatter) {
			return false;
		}

		const fm = frontMatterSection.frontMatter as JolliScriptFrontMatter;
		const matchers = normalizeOnMatchers(fm.on);

		// Find the first matching trigger
		const matchingTrigger = findMatchingTrigger(matchers, eventJrn, verb);
		if (!matchingTrigger) {
			return false;
		}

		const articleType = fm.article_type || "default";
		log.info(
			"Found matching article: %s (id: %d) for %s %s (pattern: %s, type: %s)",
			doc.jrn,
			doc.id,
			eventJrn,
			verb,
			matchingTrigger.jrn,
			articleType,
		);
		context.log("matching-article-found", {
			articleJrn: doc.jrn,
			articleId: doc.id,
			eventJrn,
			pattern: matchingTrigger.jrn,
			verb,
			articleType,
		});

		// Queue appropriate job based on article type
		if (articleType === "jolliscript") {
			await queueJolliscriptJob(doc, context, jobScheduler);
		} else if (pushInfo && doc.sourceMetadata) {
			// Non-jolliscript article with source metadata — queue analysis job
			await queueSourceDocAnalysisJob(doc, pushInfo, context, jobScheduler);
		}

		return true;
	}

	/**
	 * Find articles with front matter matching the given event JRN and verb,
	 * and queue appropriate jobs (jolliscript or source doc analysis).
	 * @param pushInfo - Optional push info for GIT_PUSH events, used to queue source doc analysis jobs
	 */
	async function findMatchingArticlesAndTriggerJobs(
		eventJrn: string,
		verb: "CREATED" | "REMOVED" | "GIT_PUSH",
		context: JobContext,
		jobScheduler: JobScheduler,
		pushInfo?: PushInfo,
	): Promise<Array<Doc>> {
		// Include /root docs since JRN triggers may be defined there
		const docDao = getDocDao();
		const allDocs = await docDao.listDocs({ includeRoot: true });
		log.info("Scanning %d docs for %s %s triggers", allDocs.length, verb, eventJrn);
		const matchingDocs: Array<Doc> = [];

		for (const doc of allDocs) {
			// Only process markdown content
			if (doc.contentType !== "text/markdown" || !doc.content) {
				continue;
			}

			try {
				const matched = await processDocForTrigger(doc, eventJrn, verb, context, jobScheduler, pushInfo);
				if (matched) {
					matchingDocs.push(doc);
				}
			} catch (error) {
				// Log parsing errors but continue processing other docs
				log.debug("Failed to parse front matter for doc %s: %s", doc.jrn, error);
			}
		}

		return matchingDocs;
	}

	/**
	 * Find sources matching the event JRN via SourceDao and queue cli-impact jobs.
	 * When webhook SHAs are provided, passes cursor info for incremental diffing.
	 * On force push, the cursor is cleared so the sandbox falls back to auto-detect.
	 */
	async function findMatchingSpacesAndTriggerJobs(
		eventJrn: string,
		verb: "CREATED" | "REMOVED" | "GIT_PUSH",
		context: JobContext,
		jobScheduler: JobScheduler,
		webhookShas?: { afterSha?: string; forced?: boolean },
	): Promise<void> {
		const sourceDao = getSourceDao();
		const matches = await sourceDao.findSourcesMatchingJrn(eventJrn);
		if (matches.length === 0) {
			return;
		}

		const afterSha = webhookShas?.afterSha;
		const isForced = webhookShas?.forced ?? false;

		for (const { source, binding } of matches) {
			const integrationId = source.integrationId;
			if (!integrationId) {
				continue;
			}

			// Use the source cursor as diff base, unless this is a force push
			// (force push may have rewritten history, making the old cursor unreachable)
			const cursorSha = isForced ? undefined : source.cursor?.value;

			context.log("space-source-matched", {
				spaceId: binding.spaceId,
				sourceId: source.id,
				integrationId,
				eventJrn,
				verb,
				afterSha,
				cursorSha,
				forced: isForced,
			});

			await queueCliImpactJob(
				binding.spaceId,
				source.id,
				integrationId,
				eventJrn,
				context,
				jobScheduler,
				afterSha,
				cursorSha,
			);
		}
	}

	/**
	 * Handler for repositories added event
	 */
	async function handleRepositoriesAdded(
		params: InstallationRepositoriesPayload,
		context: JobContext,
		jobScheduler: JobScheduler,
	): Promise<void> {
		const { installation, repositories_added: repositoriesAdded } = params;

		if (!installation || !repositoriesAdded || repositoriesAdded.length === 0) {
			context.log("no-repositories-added", { installationId: installation?.id });
			return;
		}

		const { account } = installation;
		const org = account.login;

		// Look up integrations to find matching repos with branch info
		const integrations = await integrationsManager.listIntegrations();

		for (const repo of repositoriesAdded) {
			const repoFullName = repo.full_name;
			const repoName = repoFullName.split("/").pop() || repoFullName;

			// Find matching integration for this repo to get branch info
			const matchingIntegration = integrations.find(i => {
				const metadata = i.metadata as GithubRepoIntegrationMetadata | undefined;
				return i.type === "github" && metadata?.repo === repoFullName;
			});

			const matchingMetadata = matchingIntegration?.metadata as GithubRepoIntegrationMetadata | undefined;
			const branch = matchingMetadata?.branch || repo.default_branch || "main";

			// Build event JRN using the v3 format
			const eventJrn = jrnParserV3.githubSource({ orgId: "global", org, repo: repoName, branch });
			log.info("%s CREATED", eventJrn);
			context.log("jrn-created", { eventJrn, org, repo: repoName, branch });

			// Find matching articles and trigger jolliscript jobs
			const matchingArticles = await findMatchingArticlesAndTriggerJobs(
				eventJrn,
				"CREATED",
				context,
				jobScheduler,
			);
			for (const article of matchingArticles) {
				log.info("Article %d triggered by %s CREATED", article.id, eventJrn);
				context.log("article-triggered", {
					articleId: article.id,
					articleJrn: article.jrn,
					eventJrn,
					verb: "CREATED",
				});
			}
		}
	}

	/**
	 * Handler for repositories removed event
	 */
	async function handleRepositoriesRemoved(
		params: InstallationRepositoriesPayload,
		context: JobContext,
		jobScheduler: JobScheduler,
	): Promise<void> {
		const { installation, repositories_removed: repositoriesRemoved } = params;

		if (!installation || !repositoriesRemoved || repositoriesRemoved.length === 0) {
			context.log("no-repositories-removed", { installationId: installation?.id });
			return;
		}

		const { account } = installation;
		const org = account.login;

		// Look up integrations to find matching repos with branch info
		const integrations = await integrationsManager.listIntegrations();

		for (const repo of repositoriesRemoved) {
			const repoFullName = repo.full_name;
			const repoName = repoFullName.split("/").pop() || repoFullName;

			// Find matching integration for this repo to get branch info
			const matchingIntegration = integrations.find(i => {
				const metadata = i.metadata as GithubRepoIntegrationMetadata | undefined;
				return i.type === "github" && metadata?.repo === repoFullName;
			});

			const matchingMetadata = matchingIntegration?.metadata as GithubRepoIntegrationMetadata | undefined;
			const branch = matchingMetadata?.branch || repo.default_branch || "main";

			// Build event JRN using the v3 format
			const eventJrn = jrnParserV3.githubSource({ orgId: "global", org, repo: repoName, branch });
			log.info("%s REMOVED", eventJrn);
			context.log("jrn-removed", { eventJrn, org, repo: repoName, branch });

			// Find matching articles and trigger jolliscript jobs
			const matchingArticles = await findMatchingArticlesAndTriggerJobs(
				eventJrn,
				"REMOVED",
				context,
				jobScheduler,
			);
			for (const article of matchingArticles) {
				log.info("Article %d triggered by %s REMOVED", article.id, eventJrn);
				context.log("article-triggered", {
					articleId: article.id,
					articleJrn: article.jrn,
					eventJrn,
					verb: "REMOVED",
				});
			}
		}
	}

	/**
	 * Handler for git push event
	 */
	async function handleGitPush(
		params: GitPushPayload,
		context: JobContext,
		jobScheduler: JobScheduler,
	): Promise<void> {
		const { ref, before, after, repository, forced } = params;

		// Only handle branch pushes (not tags)
		if (!ref.startsWith("refs/heads/")) {
			context.log("skipping-non-branch-push", { ref });
			return;
		}

		const branch = ref.replace("refs/heads/", "");
		const org = repository.owner.login;
		const repoName = repository.name;

		// Build event JRN using the v3 format
		const eventJrn = jrnParserV3.githubSource({ orgId: "global", org, repo: repoName, branch });
		log.info("%s GIT_PUSH", eventJrn);
		context.log("jrn-git-push", { eventJrn, org, repo: repoName, branch, after, forced });

		// Build push info for source doc analysis
		const pushInfo: PushInfo = {
			owner: org,
			repo: repoName,
			branch,
			...(before != null ? { before } : {}),
			...(after != null ? { after } : {}),
		};

		// Find matching articles and trigger appropriate jobs
		const matchingArticles = await findMatchingArticlesAndTriggerJobs(
			eventJrn,
			"GIT_PUSH",
			context,
			jobScheduler,
			pushInfo,
		);
		for (const article of matchingArticles) {
			log.info("Article %d triggered by %s GIT_PUSH", article.id, eventJrn);
			context.log("article-triggered", {
				articleId: article.id,
				articleJrn: article.jrn,
				eventJrn,
				verb: "GIT_PUSH",
			});
		}

		// Match spaces by sources and queue CLI impact jobs with SHA info for incremental diffs.
		await findMatchingSpacesAndTriggerJobs(eventJrn, "GIT_PUSH", context, jobScheduler, {
			...(after ? { afterSha: after } : {}),
			forced: forced ?? false,
		});
	}

	function registerJobs(jobScheduler: JobScheduler): void {
		// Register job for repositories added
		const reposAddedJob = jobDefinitionBuilder<InstallationRepositoriesPayload>()
			.category("jrn-adapter")
			.name("repos-added")
			.title("JRN Adapter: Repos Added")
			.description("Logs JRN paths when repositories are added to GitHub App installation")
			.schema(InstallationRepositoriesSchema)
			.handler((params, context) => handleRepositoriesAdded(params, context, jobScheduler))
			.triggerEvents([GITHUB_INSTALLATION_REPOSITORIES_ADDED])
			.build();

		jobScheduler.registerJob(reposAddedJob);

		// Register job for repositories removed
		const reposRemovedJob = jobDefinitionBuilder<InstallationRepositoriesPayload>()
			.category("jrn-adapter")
			.name("repos-removed")
			.title("JRN Adapter: Repos Removed")
			.description("Logs JRN paths when repositories are removed from GitHub App installation")
			.schema(InstallationRepositoriesSchema)
			.handler((params, context) => handleRepositoriesRemoved(params, context, jobScheduler))
			.triggerEvents([GITHUB_INSTALLATION_REPOSITORIES_REMOVED])
			.build();

		jobScheduler.registerJob(reposRemovedJob);

		// Register job for git push events
		const gitPushJob = jobDefinitionBuilder<GitPushPayload>()
			.category("jrn-adapter")
			.name("git-push")
			.title("JRN Adapter: Git Push")
			.description("Triggers articles when a git push event occurs on a matching repository/branch")
			.schema(GitPushSchema)
			.handler((params, context) => handleGitPush(params, context, jobScheduler))
			.triggerEvents([GITHUB_PUSH])
			.build();

		jobScheduler.registerJob(gitPushJob);

		log.info("Jobs to JRN adapter registered (3 jobs: repos-added, repos-removed, git-push)");
	}

	return {
		registerJobs,
	};
}
