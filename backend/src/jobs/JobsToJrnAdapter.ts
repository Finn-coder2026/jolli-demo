import {
	type JolliScriptFrontMatter,
	type JrnTriggerMatcher,
	parseSections,
} from "../../../tools/jolliagent/src/jolliscript/parser";
import type { DocDao } from "../dao/DocDao";
import {
	GITHUB_INSTALLATION_REPOSITORIES_ADDED,
	GITHUB_INSTALLATION_REPOSITORIES_REMOVED,
	GITHUB_PUSH,
} from "../events/GithubEvents";
import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import type { Doc } from "../model/Doc";
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

// Schema for the GitHub push event payload (simplified for JRN adapter needs)
const GitPushSchema = z.object({
	ref: z.string(),
	repository: z.object({
		full_name: z.string(),
		owner: z.object({
			login: z.string(),
		}),
		name: z.string(),
	}),
});

type GitPushPayload = z.infer<typeof GitPushSchema>;

/**
 * Creates the Jobs to JRN adapter
 */
export function createJobsToJrnAdapter(integrationsManager: IntegrationsManager, docDao: DocDao): JobsToJrnAdapter {
	// Store reference to jobScheduler for use in handlers
	let schedulerRef: JobScheduler | undefined;

	/**
	 * Queue a run-jolliscript job for a jolliscript article
	 */
	async function queueJolliscriptJob(doc: Doc, context: JobContext): Promise<void> {
		/* v8 ignore start - schedulerRef is always set by registerJobs before this is called */
		if (!schedulerRef) {
			return;
		}
		/* v8 ignore stop */
		try {
			const jobResult = await schedulerRef.queueJob({
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
	 * Process a single document to check if it matches the JRN trigger
	 */
	async function processDocForTrigger(
		doc: Doc,
		eventJrn: string,
		verb: "CREATED" | "REMOVED" | "GIT_PUSH",
		context: JobContext,
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

		// Queue run-jolliscript job for jolliscript articles
		if (articleType === "jolliscript") {
			await queueJolliscriptJob(doc, context);
		}

		return true;
	}

	/**
	 * Find articles with front matter matching the given event JRN and verb,
	 * and queue run-jolliscript jobs for jolliscript articles
	 */
	async function findMatchingArticlesAndTriggerJobs(
		eventJrn: string,
		verb: "CREATED" | "REMOVED" | "GIT_PUSH",
		context: JobContext,
	): Promise<Array<Doc>> {
		// Include /root docs since JRN triggers may be defined there
		const allDocs = await docDao.listDocs({ includeRoot: true });
		const matchingDocs: Array<Doc> = [];

		for (const doc of allDocs) {
			// Only process markdown content
			if (doc.contentType !== "text/markdown" || !doc.content) {
				continue;
			}

			try {
				const matched = await processDocForTrigger(doc, eventJrn, verb, context);
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
	 * Handler for repositories added event
	 */
	async function handleRepositoriesAdded(
		params: InstallationRepositoriesPayload,
		context: JobContext,
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
			const matchingArticles = await findMatchingArticlesAndTriggerJobs(eventJrn, "CREATED", context);
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
			const matchingArticles = await findMatchingArticlesAndTriggerJobs(eventJrn, "REMOVED", context);
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
	async function handleGitPush(params: GitPushPayload, context: JobContext): Promise<void> {
		const { ref, repository } = params;

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
		context.log("jrn-git-push", { eventJrn, org, repo: repoName, branch });

		// Find matching articles and trigger jolliscript jobs
		const matchingArticles = await findMatchingArticlesAndTriggerJobs(eventJrn, "GIT_PUSH", context);
		for (const article of matchingArticles) {
			log.info("Article %d triggered by %s GIT_PUSH", article.id, eventJrn);
			context.log("article-triggered", {
				articleId: article.id,
				articleJrn: article.jrn,
				eventJrn,
				verb: "GIT_PUSH",
			});
		}
	}

	function registerJobs(jobScheduler: JobScheduler): void {
		// Store scheduler reference for use in handlers to queue jolliscript jobs
		schedulerRef = jobScheduler;

		// Register job for repositories added
		const reposAddedJob = jobDefinitionBuilder<InstallationRepositoriesPayload>()
			.category("jrn-adapter")
			.name("repos-added")
			.title("JRN Adapter: Repos Added")
			.description("Logs JRN paths when repositories are added to GitHub App installation")
			.schema(InstallationRepositoriesSchema)
			.handler(handleRepositoriesAdded)
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
			.handler(handleRepositoriesRemoved)
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
			.handler(handleGitPush)
			.triggerEvents([GITHUB_PUSH])
			.build();

		jobScheduler.registerJob(gitPushJob);

		log.debug("Jobs to JRN adapter registered");
	}

	return {
		registerJobs,
	};
}
