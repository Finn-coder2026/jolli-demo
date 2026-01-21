import type { DocDao } from "../dao/DocDao";
import {
	GITHUB_INSTALLATION_REPOSITORIES_ADDED,
	GITHUB_INSTALLATION_REPOSITORIES_REMOVED,
	GITHUB_PUSH,
} from "../events/GithubEvents";
import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import { createMockIntegrationsManager } from "../integrations/IntegrationsManager.mock";
import { mockIntegration } from "../model/Integration.mock";
import type { JobContext, JobDefinition } from "../types/JobTypes";
import type { JobScheduler } from "./JobScheduler";
import { createJobsToJrnAdapter } from "./JobsToJrnAdapter";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("JobsToJrnAdapter", () => {
	let integrationsManager: IntegrationsManager;
	let docDao: DocDao;
	let registeredJobs: Array<JobDefinition> = [];
	let scheduler: JobScheduler;

	beforeEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();

		integrationsManager = createMockIntegrationsManager();
		docDao = {
			listDocs: vi.fn().mockResolvedValue([]),
			createDoc: vi.fn(),
			readDoc: vi.fn(),
			readDocById: vi.fn(),
			updateDoc: vi.fn(),
			updateDocIfVersion: vi.fn(),
			deleteDoc: vi.fn(),
			deleteAllDocs: vi.fn(),
			searchDocsByTitle: vi.fn(),
			getTreeContent: vi.fn(),
			getTrashContent: vi.fn(),
			softDelete: vi.fn(),
			restore: vi.fn(),
			renameDoc: vi.fn(),
			getMaxSortOrder: vi.fn(),
			hasDeletedDocs: vi.fn(),
		};
		registeredJobs = [];
		scheduler = {
			registerJob: (def: JobDefinition) => {
				registeredJobs.push(def);
			},
			queueJob: vi.fn().mockResolvedValue({ jobId: "queued-job-1", name: "knowledge-graph:run-jolliscript" }),
		} as unknown as JobScheduler;
	});

	function getRegisteredJobHandler(jobName: string) {
		const adapter = createJobsToJrnAdapter(integrationsManager, docDao);
		adapter.registerJobs(scheduler);
		expect(registeredJobs.length).toBe(3);
		const job = registeredJobs.find(j => j.name === jobName);
		if (!job) {
			throw new Error(
				`Job ${jobName} not registered. Available jobs: ${registeredJobs.map(j => j.name).join(", ")}`,
			);
		}
		return job;
	}

	function createMockContext(name: string): JobContext {
		return {
			jobId: "job-1",
			jobName: name,
			emitEvent: vi.fn(),
			log: vi.fn(),
			updateStats: vi.fn().mockResolvedValue(undefined),
			setCompletionInfo: vi.fn().mockResolvedValue(undefined),
		} as JobContext;
	}

	describe("registerJobs", () => {
		it("registers repos-added, repos-removed, and git-push jobs", () => {
			const adapter = createJobsToJrnAdapter(integrationsManager, docDao);
			adapter.registerJobs(scheduler);

			expect(registeredJobs.length).toBe(3);
			expect(registeredJobs.map(j => j.name)).toContain("jrn-adapter:repos-added");
			expect(registeredJobs.map(j => j.name)).toContain("jrn-adapter:repos-removed");
			expect(registeredJobs.map(j => j.name)).toContain("jrn-adapter:git-push");
		});

		it("registers jobs with correct trigger events", () => {
			const adapter = createJobsToJrnAdapter(integrationsManager, docDao);
			adapter.registerJobs(scheduler);

			const addedJob = registeredJobs.find(j => j.name === "jrn-adapter:repos-added");
			const removedJob = registeredJobs.find(j => j.name === "jrn-adapter:repos-removed");
			const gitPushJob = registeredJobs.find(j => j.name === "jrn-adapter:git-push");

			expect(addedJob?.triggerEvents).toContain(GITHUB_INSTALLATION_REPOSITORIES_ADDED);
			expect(removedJob?.triggerEvents).toContain(GITHUB_INSTALLATION_REPOSITORIES_REMOVED);
			expect(gitPushJob?.triggerEvents).toContain(GITHUB_PUSH);
		});
	});

	describe("repos-added handler", () => {
		it("logs JRN path when repositories are added", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");

			const integration = mockIntegration({
				id: 1,
				type: "github",
				name: "test-org/test-repo",
				metadata: {
					repo: "test-org/test-repo",
					branch: "develop",
					features: [],
					installationId: 123,
					githubAppId: 1,
				},
			});
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([integration]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 123,
						app_id: 1,
						account: { login: "test-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "test-org/test-repo", default_branch: "main" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("jrn-created", {
				eventJrn: "jrn::path:/home/global/sources/github/test-org/test-repo/develop",
				org: "test-org",
				repo: "test-repo",
				branch: "develop",
			});
		});

		it("uses default branch when no integration match found", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 456,
						app_id: 1,
						account: { login: "my-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "my-org/my-repo", default_branch: "master" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("jrn-created", {
				eventJrn: "jrn::path:/home/global/sources/github/my-org/my-repo/master",
				org: "my-org",
				repo: "my-repo",
				branch: "master",
			});
		});

		it("defaults to main when no branch info available", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 789,
						app_id: 1,
						account: { login: "another-org", type: "User" as const },
					},
					repositories_added: [{ full_name: "another-org/another-repo" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("jrn-created", {
				eventJrn: "jrn::path:/home/global/sources/github/another-org/another-repo/main",
				org: "another-org",
				repo: "another-repo",
				branch: "main",
			});
		});

		it("handles multiple repositories added", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 111,
						app_id: 1,
						account: { login: "multi-org", type: "Organization" as const },
					},
					repositories_added: [
						{ full_name: "multi-org/repo1", default_branch: "main" },
						{ full_name: "multi-org/repo2", default_branch: "develop" },
					],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("jrn-created", expect.objectContaining({ repo: "repo1" }));
			expect(context.log).toHaveBeenCalledWith("jrn-created", expect.objectContaining({ repo: "repo2" }));
		});

		it("logs no-repositories-added when no installation", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					repositories_added: [{ full_name: "org/repo" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("no-repositories-added", { installationId: undefined });
		});

		it("logs no-repositories-added when empty repositories list", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 222,
						app_id: 1,
						account: { login: "org", type: "Organization" as const },
					},
					repositories_added: [],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("no-repositories-added", { installationId: 222 });
		});

		it("handles repo name without slash (edge case)", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 999,
						app_id: 1,
						account: { login: "edge-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "single-name-repo", default_branch: "main" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("jrn-created", {
				eventJrn: "jrn::path:/home/global/sources/github/edge-org/single-name-repo/main",
				org: "edge-org",
				repo: "single-name-repo",
				branch: "main",
			});
		});

		it("handles empty repo full_name (edge case - fallback to full_name)", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 1000,
						app_id: 1,
						account: { login: "empty-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "", default_branch: "main" }],
				},
				context,
			);

			// When full_name is empty, githubSource produces a JRN with just github (no qualifier)
			expect(context.log).toHaveBeenCalledWith("jrn-created", {
				eventJrn: "jrn::path:/home/global/sources/github",
				org: "empty-org",
				repo: "",
				branch: "main",
			});
		});
	});

	describe("repos-removed handler", () => {
		it("logs JRN path when repositories are removed", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-removed");

			const integration = mockIntegration({
				id: 2,
				type: "github",
				name: "remove-org/remove-repo",
				metadata: {
					repo: "remove-org/remove-repo",
					branch: "feature",
					features: [],
					installationId: 333,
					githubAppId: 1,
				},
			});
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([integration]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "removed",
					installation: {
						id: 333,
						app_id: 1,
						account: { login: "remove-org", type: "Organization" as const },
					},
					repositories_removed: [{ full_name: "remove-org/remove-repo", default_branch: "main" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("jrn-removed", {
				eventJrn: "jrn::path:/home/global/sources/github/remove-org/remove-repo/feature",
				org: "remove-org",
				repo: "remove-repo",
				branch: "feature",
			});
		});

		it("uses default branch when no integration match found", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-removed");
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "removed",
					installation: {
						id: 444,
						app_id: 1,
						account: { login: "del-org", type: "Organization" as const },
					},
					repositories_removed: [{ full_name: "del-org/del-repo", default_branch: "release" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("jrn-removed", {
				eventJrn: "jrn::path:/home/global/sources/github/del-org/del-repo/release",
				org: "del-org",
				repo: "del-repo",
				branch: "release",
			});
		});

		it("defaults to main when no branch info available", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-removed");
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "removed",
					installation: {
						id: 555,
						app_id: 1,
						account: { login: "no-branch-org", type: "User" as const },
					},
					repositories_removed: [{ full_name: "no-branch-org/no-branch-repo" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("jrn-removed", {
				eventJrn: "jrn::path:/home/global/sources/github/no-branch-org/no-branch-repo/main",
				org: "no-branch-org",
				repo: "no-branch-repo",
				branch: "main",
			});
		});

		it("logs no-repositories-removed when no installation", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-removed");

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "removed",
					repositories_removed: [{ full_name: "org/repo" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("no-repositories-removed", { installationId: undefined });
		});

		it("logs no-repositories-removed when empty repositories list", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-removed");

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "removed",
					installation: {
						id: 666,
						app_id: 1,
						account: { login: "org", type: "Organization" as const },
					},
					repositories_removed: [],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("no-repositories-removed", { installationId: 666 });
		});

		it("handles repo name without slash (edge case)", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-removed");
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "removed",
					installation: {
						id: 888,
						app_id: 1,
						account: { login: "edge-org", type: "Organization" as const },
					},
					repositories_removed: [{ full_name: "single-name-repo", default_branch: "main" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("jrn-removed", {
				eventJrn: "jrn::path:/home/global/sources/github/edge-org/single-name-repo/main",
				org: "edge-org",
				repo: "single-name-repo",
				branch: "main",
			});
		});

		it("handles empty repo full_name (edge case - fallback to full_name)", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-removed");
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "removed",
					installation: {
						id: 1001,
						app_id: 1,
						account: { login: "empty-org", type: "Organization" as const },
					},
					repositories_removed: [{ full_name: "", default_branch: "main" }],
				},
				context,
			);

			// When full_name is empty, githubSource produces a JRN with just github (no qualifier)
			expect(context.log).toHaveBeenCalledWith("jrn-removed", {
				eventJrn: "jrn::path:/home/global/sources/github",
				org: "empty-org",
				repo: "",
				branch: "main",
			});
		});
	});

	describe("git-push handler", () => {
		it("logs JRN path when a git push event occurs", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:git-push");

			const context = createMockContext(def.name);
			await def.handler(
				{
					ref: "refs/heads/main",
					repository: {
						full_name: "test-org/test-repo",
						owner: { login: "test-org" },
						name: "test-repo",
					},
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("jrn-git-push", {
				eventJrn: "jrn::path:/home/global/sources/github/test-org/test-repo/main",
				org: "test-org",
				repo: "test-repo",
				branch: "main",
			});
		});

		it("extracts branch name from ref correctly", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:git-push");

			const context = createMockContext(def.name);
			await def.handler(
				{
					ref: "refs/heads/feature/my-branch",
					repository: {
						full_name: "my-org/my-repo",
						owner: { login: "my-org" },
						name: "my-repo",
					},
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("jrn-git-push", {
				eventJrn: "jrn::path:/home/global/sources/github/my-org/my-repo/feature/my-branch",
				org: "my-org",
				repo: "my-repo",
				branch: "feature/my-branch",
			});
		});

		it("skips non-branch refs (e.g., tags)", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:git-push");

			const context = createMockContext(def.name);
			await def.handler(
				{
					ref: "refs/tags/v1.0.0",
					repository: {
						full_name: "tag-org/tag-repo",
						owner: { login: "tag-org" },
						name: "tag-repo",
					},
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("skipping-non-branch-push", { ref: "refs/tags/v1.0.0" });
			expect(context.log).not.toHaveBeenCalledWith("jrn-git-push", expect.anything());
		});

		it("finds articles with matching front matter on GIT_PUSH event", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:git-push");

			const matchingDoc = {
				id: 200,
				jrn: "article:git-push-trigger",
				content: `---
on:
  jrn: jrn:*:path:/home/*/sources/github/push-org/push-repo/main
  verb: GIT_PUSH
---

# Git Push Trigger Article
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([matchingDoc]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					ref: "refs/heads/main",
					repository: {
						full_name: "push-org/push-repo",
						owner: { login: "push-org" },
						name: "push-repo",
					},
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("article-triggered", {
				articleId: 200,
				articleJrn: "article:git-push-trigger",
				eventJrn: "jrn::path:/home/global/sources/github/push-org/push-repo/main",
				verb: "GIT_PUSH",
			});
		});

		it("matches articles using wildcard in jrn pattern for GIT_PUSH", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:git-push");

			const wildcardDoc = {
				id: 201,
				jrn: "article:wildcard-push",
				content: `---
on:
  jrn: jrn:*:path:/home/*/sources/github/*/*/main
  verb: GIT_PUSH
---

# Wildcard Push Article
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([wildcardDoc]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					ref: "refs/heads/main",
					repository: {
						full_name: "any-org/any-repo",
						owner: { login: "any-org" },
						name: "any-repo",
					},
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("article-triggered", {
				articleId: 201,
				articleJrn: "article:wildcard-push",
				eventJrn: "jrn::path:/home/global/sources/github/any-org/any-repo/main",
				verb: "GIT_PUSH",
			});
		});

		it("does not match articles with different verb", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:git-push");

			const wrongVerbDoc = {
				id: 202,
				jrn: "article:wrong-verb-push",
				content: `---
on:
  jrn: jrn:*:path:/home/*/sources/github/push-org/push-repo/main
  verb: CREATED
---

# Wrong Verb Article
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([wrongVerbDoc]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					ref: "refs/heads/main",
					repository: {
						full_name: "push-org/push-repo",
						owner: { login: "push-org" },
						name: "push-repo",
					},
				},
				context,
			);

			expect(context.log).not.toHaveBeenCalledWith("article-triggered", expect.anything());
		});
	});

	describe("front matter matching", () => {
		it("finds articles with matching front matter on CREATED event", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");

			const matchingDoc = {
				id: 42,
				jrn: "article:my-trigger-article",
				content: `---
on:
  jrn: jrn:*:path:/home/*/sources/github/test-org/test-repo/main
  verb: CREATED
---

# My Article

Content here.
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([matchingDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 123,
						app_id: 1,
						account: { login: "test-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "test-org/test-repo", default_branch: "main" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("article-triggered", {
				articleId: 42,
				articleJrn: "article:my-trigger-article",
				eventJrn: "jrn::path:/home/global/sources/github/test-org/test-repo/main",
				verb: "CREATED",
			});
		});

		it("finds articles with matching front matter on REMOVED event", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-removed");

			const matchingDoc = {
				id: 99,
				jrn: "article:cleanup-article",
				content: `---
on:
  jrn: jrn:*:path:/home/*/sources/github/rm-org/rm-repo/develop
  verb: REMOVED
---

# Cleanup Article
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([matchingDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "removed",
					installation: {
						id: 456,
						app_id: 1,
						account: { login: "rm-org", type: "Organization" as const },
					},
					repositories_removed: [{ full_name: "rm-org/rm-repo", default_branch: "develop" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("article-triggered", {
				articleId: 99,
				articleJrn: "article:cleanup-article",
				eventJrn: "jrn::path:/home/global/sources/github/rm-org/rm-repo/develop",
				verb: "REMOVED",
			});
		});

		it("does not match articles with different JRN path", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");

			const nonMatchingDoc = {
				id: 50,
				jrn: "article:other-article",
				content: `---
on:
  jrn: jrn:*:path:/home/*/sources/github/other-org/other-repo/main
  verb: CREATED
---

# Other Article
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([nonMatchingDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 789,
						app_id: 1,
						account: { login: "test-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "test-org/test-repo", default_branch: "main" }],
				},
				context,
			);

			expect(context.log).not.toHaveBeenCalledWith("article-triggered", expect.anything());
		});

		it("does not match articles with different verb", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");

			const wrongVerbDoc = {
				id: 60,
				jrn: "article:wrong-verb",
				content: `---
on:
  jrn: jrn:*:path:/home/*/sources/github/test-org/test-repo/main
  verb: REMOVED
---

# Wrong Verb Article
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([wrongVerbDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 111,
						app_id: 1,
						account: { login: "test-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "test-org/test-repo", default_branch: "main" }],
				},
				context,
			);

			expect(context.log).not.toHaveBeenCalledWith("article-triggered", expect.anything());
		});

		it("skips non-markdown documents", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");

			const jsonDoc = {
				id: 70,
				jrn: "data:config",
				content: '{"on": {"jrn": "/root/integrations/test-org/test-repo/main", "verb": "CREATED"}}',
				contentType: "application/json",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([jsonDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 222,
						app_id: 1,
						account: { login: "test-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "test-org/test-repo", default_branch: "main" }],
				},
				context,
			);

			expect(context.log).not.toHaveBeenCalledWith("article-triggered", expect.anything());
		});

		it("handles documents without front matter gracefully", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");

			const noFrontMatterDoc = {
				id: 80,
				jrn: "article:no-frontmatter",
				content: `# Just a Regular Article

No front matter here.
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([noFrontMatterDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 333,
						app_id: 1,
						account: { login: "test-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "test-org/test-repo", default_branch: "main" }],
				},
				context,
			);

			// Should not throw and should not match
			expect(context.log).not.toHaveBeenCalledWith("article-triggered", expect.anything());
		});

		it("handles documents with front matter but without 'on' field gracefully", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");

			const noOnFieldDoc = {
				id: 81,
				jrn: "article:no-on-field",
				content: `---
title: Article With Front Matter But No On Field
description: This article has front matter but no on trigger
---

# Article Content

This article has front matter but no 'on' trigger configuration.
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([noOnFieldDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 334,
						app_id: 1,
						account: { login: "test-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "test-org/test-repo", default_branch: "main" }],
				},
				context,
			);

			// Should not throw and should not match since there's no 'on' trigger
			expect(context.log).not.toHaveBeenCalledWith("article-triggered", expect.anything());
			expect(context.log).not.toHaveBeenCalledWith("matching-article-found", expect.anything());
		});

		it("matches articles using single wildcard (*) in jrn pattern", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");

			const wildcardDoc = {
				id: 100,
				jrn: "article:wildcard-article",
				content: `---
on:
  jrn: jrn:*:path:/home/*/sources/github/*/test-repo/main
  verb: CREATED
---

# Wildcard Article
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([wildcardDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 500,
						app_id: 1,
						account: { login: "any-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "any-org/test-repo", default_branch: "main" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("article-triggered", {
				articleId: 100,
				articleJrn: "article:wildcard-article",
				eventJrn: "jrn::path:/home/global/sources/github/any-org/test-repo/main",
				verb: "CREATED",
			});
		});

		it("matches articles using double wildcard (**) in jrn pattern", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");

			const globstarDoc = {
				id: 101,
				jrn: "article:globstar-article",
				content: `---
on:
  jrn: jrn:*:path:/home/*/sources/github/my-org/**
  verb: CREATED
---

# Globstar Article
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([globstarDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 501,
						app_id: 1,
						account: { login: "my-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "my-org/any-repo", default_branch: "feature-branch" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("article-triggered", {
				articleId: 101,
				articleJrn: "article:globstar-article",
				eventJrn: "jrn::path:/home/global/sources/github/my-org/any-repo/feature-branch",
				verb: "CREATED",
			});
		});

		it("matches articles using multiple wildcards in jrn pattern", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");

			const multiWildcardDoc = {
				id: 102,
				jrn: "article:multi-wildcard",
				content: `---
on:
  jrn: jrn:*:path:/home/*/sources/github/*/*/main
  verb: CREATED
---

# Multi Wildcard Article
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([multiWildcardDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 502,
						app_id: 1,
						account: { login: "some-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "some-org/some-repo", default_branch: "main" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("article-triggered", {
				articleId: 102,
				articleJrn: "article:multi-wildcard",
				eventJrn: "jrn::path:/home/global/sources/github/some-org/some-repo/main",
				verb: "CREATED",
			});
		});

		it("matches articles using brace expansion in jrn pattern", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");

			const braceDoc = {
				id: 103,
				jrn: "article:brace-expansion",
				content: `---
on:
  jrn: jrn:*:path:/home/*/sources/github/my-org/my-repo/develop
  verb: CREATED
---

# Brace Expansion Article
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([braceDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 503,
						app_id: 1,
						account: { login: "my-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "my-org/my-repo", default_branch: "develop" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("article-triggered", {
				articleId: 103,
				articleJrn: "article:brace-expansion",
				eventJrn: "jrn::path:/home/global/sources/github/my-org/my-repo/develop",
				verb: "CREATED",
			});
		});

		it("does not match when wildcard pattern does not match path", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");

			const wildcardDoc = {
				id: 104,
				jrn: "article:non-matching-wildcard",
				content: `---
on:
  jrn: jrn:*:path:/home/*/sources/github/specific-org/*/main
  verb: CREATED
---

# Non-matching Wildcard
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([wildcardDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 504,
						app_id: 1,
						account: { login: "different-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "different-org/some-repo", default_branch: "main" }],
				},
				context,
			);

			// Should not match because org is different
			expect(context.log).not.toHaveBeenCalledWith("article-triggered", expect.anything());
		});

		it("matches articles using array of matchers in 'on' field", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:git-push");

			const arrayMatchersDoc = {
				id: 110,
				jrn: "article:array-matchers",
				content: `---
on:
  - jrn: jrn:*:path:/home/*/sources/github/org-a/repo-a/main
    verb: GIT_PUSH
  - jrn: jrn:*:path:/home/*/sources/github/org-b/repo-b/main
    verb: GIT_PUSH
---

# Array Matchers Article
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([arrayMatchersDoc]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					ref: "refs/heads/main",
					repository: {
						full_name: "org-b/repo-b",
						owner: { login: "org-b" },
						name: "repo-b",
					},
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("article-triggered", {
				articleId: 110,
				articleJrn: "article:array-matchers",
				eventJrn: "jrn::path:/home/global/sources/github/org-b/repo-b/main",
				verb: "GIT_PUSH",
			});
		});

		it("matches first matching matcher in array", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");

			const multiMatcherDoc = {
				id: 111,
				jrn: "article:multi-matcher",
				content: `---
on:
  - jrn: jrn:*:path:/home/*/sources/github/first-org/*/main
    verb: CREATED
  - jrn: jrn:*:path:/home/*/sources/github/second-org/**
    verb: CREATED
---

# Multi Matcher Article
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([multiMatcherDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 600,
						app_id: 1,
						account: { login: "first-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "first-org/any-repo", default_branch: "main" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("matching-article-found", {
				articleJrn: "article:multi-matcher",
				articleId: 111,
				eventJrn: "jrn::path:/home/global/sources/github/first-org/any-repo/main",
				pattern: "jrn:*:path:/home/*/sources/github/first-org/*/main",
				verb: "CREATED",
				articleType: "default",
			});
		});

		it("matches different verbs in array of matchers", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-removed");

			const mixedVerbsDoc = {
				id: 112,
				jrn: "article:mixed-verbs",
				content: `---
on:
  - jrn: jrn:*:path:/home/*/sources/github/mixed-org/mixed-repo/main
    verb: CREATED
  - jrn: jrn:*:path:/home/*/sources/github/mixed-org/mixed-repo/main
    verb: REMOVED
  - jrn: jrn:*:path:/home/*/sources/github/mixed-org/mixed-repo/main
    verb: GIT_PUSH
---

# Mixed Verbs Article
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([mixedVerbsDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "removed",
					installation: {
						id: 601,
						app_id: 1,
						account: { login: "mixed-org", type: "Organization" as const },
					},
					repositories_removed: [{ full_name: "mixed-org/mixed-repo", default_branch: "main" }],
				},
				context,
			);

			expect(context.log).toHaveBeenCalledWith("matching-article-found", {
				articleJrn: "article:mixed-verbs",
				articleId: 112,
				eventJrn: "jrn::path:/home/global/sources/github/mixed-org/mixed-repo/main",
				pattern: "jrn:*:path:/home/*/sources/github/mixed-org/mixed-repo/main",
				verb: "REMOVED",
				articleType: "default",
			});
		});

		it("does not match if no matcher in array matches", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:git-push");

			const noMatchDoc = {
				id: 113,
				jrn: "article:no-match-array",
				content: `---
on:
  - jrn: jrn:*:path:/home/*/sources/github/other-org/other-repo/main
    verb: GIT_PUSH
  - jrn: jrn:*:path:/home/*/sources/github/another-org/another-repo/main
    verb: GIT_PUSH
---

# No Match Array Article
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([noMatchDoc]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					ref: "refs/heads/main",
					repository: {
						full_name: "different-org/different-repo",
						owner: { login: "different-org" },
						name: "different-repo",
					},
				},
				context,
			);

			expect(context.log).not.toHaveBeenCalledWith("article-triggered", expect.anything());
		});

		it("handles empty array of matchers", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:git-push");

			const emptyArrayDoc = {
				id: 114,
				jrn: "article:empty-array",
				content: `---
on: []
---

# Empty Array Article
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([emptyArrayDoc]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					ref: "refs/heads/main",
					repository: {
						full_name: "any-org/any-repo",
						owner: { login: "any-org" },
						name: "any-repo",
					},
				},
				context,
			);

			expect(context.log).not.toHaveBeenCalledWith("article-triggered", expect.anything());
		});

		it("queues jolliscript job when array matcher matches", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:git-push");

			const jolliscriptArrayDoc = {
				id: 115,
				jrn: "/home/space-1/scripts/array-trigger.md",
				content: `---
article_type: jolliscript
on:
  - jrn: jrn:*:path:/home/*/sources/github/script-org/script-repo-a/main
    verb: GIT_PUSH
  - jrn: jrn:*:path:/home/*/sources/github/script-org/script-repo-b/main
    verb: GIT_PUSH
---

# Jolli_Main

\`\`\`joi
console.log("Triggered by array matcher!");
\`\`\`
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([jolliscriptArrayDoc]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					ref: "refs/heads/main",
					repository: {
						full_name: "script-org/script-repo-b",
						owner: { login: "script-org" },
						name: "script-repo-b",
					},
				},
				context,
			);

			expect(scheduler.queueJob).toHaveBeenCalledWith({
				name: "knowledge-graph:run-jolliscript",
				params: { docJrn: "/home/space-1/scripts/array-trigger.md", killSandbox: false },
			});
		});

		it("handles parsing errors gracefully and continues processing", async () => {
			// Import the parser module to spy on it
			const parserModule = await import("../../../tools/jolliagent/src/jolliscript/parser");
			const realParseSections = parserModule.parseSections;

			const brokenDoc = {
				id: 90,
				jrn: "article:broken",
				content: "some valid markdown that will be mocked to throw",
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			const validDoc = {
				id: 91,
				jrn: "article:valid-after-broken",
				content: `---
on:
  jrn: jrn:*:path:/home/*/sources/github/test-org/test-repo/main
  verb: CREATED
---

# Valid Doc
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			// Spy on parseSections to throw on first call, then work normally
			let callCount = 0;
			const spy = vi.spyOn(parserModule, "parseSections").mockImplementation((markdown: string, options) => {
				callCount++;
				if (callCount === 1) {
					throw new Error("Simulated parsing error");
				}
				// Restore and call the real implementation for subsequent calls
				spy.mockRestore();
				return realParseSections(markdown, options);
			});

			docDao.listDocs = vi.fn().mockResolvedValue([brokenDoc, validDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			// Create adapter after setting up docDao mock
			registeredJobs = [];
			const adapter = createJobsToJrnAdapter(integrationsManager, docDao);
			adapter.registerJobs(scheduler);
			const def = registeredJobs.find(j => j.name === "jrn-adapter:repos-added");
			if (!def) {
				throw new Error("Job not found");
			}

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 444,
						app_id: 1,
						account: { login: "test-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "test-org/test-repo", default_branch: "main" }],
				},
				context,
			);

			// Should still find the valid doc after the broken one
			expect(context.log).toHaveBeenCalledWith("article-triggered", {
				articleId: 91,
				articleJrn: "article:valid-after-broken",
				eventJrn: "jrn::path:/home/global/sources/github/test-org/test-repo/main",
				verb: "CREATED",
			});
		});
	});

	describe("jolliscript job triggering", () => {
		it("queues run-jolliscript job for matching jolliscript article on GIT_PUSH", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:git-push");

			const jolliscriptDoc = {
				id: 300,
				jrn: "/home/space-1/scripts/my-script.md",
				content: `---
article_type: jolliscript
on:
  jrn: jrn:*:path:/home/*/sources/github/script-org/script-repo/main
  verb: GIT_PUSH
---

# Jolli_Main

\`\`\`joi
console.log("Hello from JolliScript!");
\`\`\`
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([jolliscriptDoc]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					ref: "refs/heads/main",
					repository: {
						full_name: "script-org/script-repo",
						owner: { login: "script-org" },
						name: "script-repo",
					},
				},
				context,
			);

			// Should log matching article found with articleType
			expect(context.log).toHaveBeenCalledWith("matching-article-found", {
				articleJrn: "/home/space-1/scripts/my-script.md",
				articleId: 300,
				eventJrn: "jrn::path:/home/global/sources/github/script-org/script-repo/main",
				pattern: "jrn:*:path:/home/*/sources/github/script-org/script-repo/main",
				verb: "GIT_PUSH",
				articleType: "jolliscript",
			});

			// Should queue the run-jolliscript job
			expect(scheduler.queueJob).toHaveBeenCalledWith({
				name: "knowledge-graph:run-jolliscript",
				params: { docJrn: "/home/space-1/scripts/my-script.md", killSandbox: false },
			});

			// Should log that job was queued
			expect(context.log).toHaveBeenCalledWith("jolliscript-job-queued", {
				articleJrn: "/home/space-1/scripts/my-script.md",
				articleId: 300,
				jobId: "queued-job-1",
			});
		});

		it("does not queue run-jolliscript job for default article type", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:git-push");

			const defaultDoc = {
				id: 301,
				jrn: "/home/space-1/docs/regular-doc.md",
				content: `---
on:
  jrn: jrn:*:path:/home/*/sources/github/doc-org/doc-repo/main
  verb: GIT_PUSH
---

# Regular Document
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([defaultDoc]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					ref: "refs/heads/main",
					repository: {
						full_name: "doc-org/doc-repo",
						owner: { login: "doc-org" },
						name: "doc-repo",
					},
				},
				context,
			);

			// Should log matching article found with default articleType
			expect(context.log).toHaveBeenCalledWith("matching-article-found", {
				articleJrn: "/home/space-1/docs/regular-doc.md",
				articleId: 301,
				eventJrn: "jrn::path:/home/global/sources/github/doc-org/doc-repo/main",
				pattern: "jrn:*:path:/home/*/sources/github/doc-org/doc-repo/main",
				verb: "GIT_PUSH",
				articleType: "default",
			});

			// Should NOT queue the run-jolliscript job
			expect(scheduler.queueJob).not.toHaveBeenCalled();
		});

		it("queues run-jolliscript job for jolliscript article on CREATED event", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-added");

			const jolliscriptDoc = {
				id: 302,
				jrn: "/home/space-1/scripts/setup-script.md",
				content: `---
article_type: jolliscript
on:
  jrn: jrn:*:path:/home/*/sources/github/setup-org/setup-repo/main
  verb: CREATED
---

# Jolli_Main

\`\`\`joi
console.log("Setting up new repo!");
\`\`\`
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([jolliscriptDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "added",
					installation: {
						id: 600,
						app_id: 1,
						account: { login: "setup-org", type: "Organization" as const },
					},
					repositories_added: [{ full_name: "setup-org/setup-repo", default_branch: "main" }],
				},
				context,
			);

			// Should queue the run-jolliscript job
			expect(scheduler.queueJob).toHaveBeenCalledWith({
				name: "knowledge-graph:run-jolliscript",
				params: { docJrn: "/home/space-1/scripts/setup-script.md", killSandbox: false },
			});
		});

		it("queues run-jolliscript job for jolliscript article on REMOVED event", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:repos-removed");

			const jolliscriptDoc = {
				id: 303,
				jrn: "/home/space-1/scripts/cleanup-script.md",
				content: `---
article_type: jolliscript
on:
  jrn: jrn:*:path:/home/*/sources/github/cleanup-org/cleanup-repo/main
  verb: REMOVED
---

# Jolli_Main

\`\`\`joi
console.log("Cleaning up removed repo!");
\`\`\`
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([jolliscriptDoc]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					action: "removed",
					installation: {
						id: 601,
						app_id: 1,
						account: { login: "cleanup-org", type: "Organization" as const },
					},
					repositories_removed: [{ full_name: "cleanup-org/cleanup-repo", default_branch: "main" }],
				},
				context,
			);

			// Should queue the run-jolliscript job
			expect(scheduler.queueJob).toHaveBeenCalledWith({
				name: "knowledge-graph:run-jolliscript",
				params: { docJrn: "/home/space-1/scripts/cleanup-script.md", killSandbox: false },
			});
		});

		it("handles queueJob failure gracefully", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:git-push");

			const jolliscriptDoc = {
				id: 304,
				jrn: "/home/space-1/scripts/failing-script.md",
				content: `---
article_type: jolliscript
on:
  jrn: jrn:*:path:/home/*/sources/github/fail-org/fail-repo/main
  verb: GIT_PUSH
---

# Jolli_Main

\`\`\`joi
console.log("This will fail to queue");
\`\`\`
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([jolliscriptDoc]);

			// Make queueJob fail
			(scheduler.queueJob as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Queue is full"));

			const context = createMockContext(def.name);
			await def.handler(
				{
					ref: "refs/heads/main",
					repository: {
						full_name: "fail-org/fail-repo",
						owner: { login: "fail-org" },
						name: "fail-repo",
					},
				},
				context,
			);

			// Should log the failure
			expect(context.log).toHaveBeenCalledWith("jolliscript-job-queue-failed", {
				articleJrn: "/home/space-1/scripts/failing-script.md",
				articleId: 304,
				error: "Queue is full",
			});

			// Should still trigger the article (the error is logged but doesn't stop execution)
			expect(context.log).toHaveBeenCalledWith("article-triggered", {
				articleId: 304,
				articleJrn: "/home/space-1/scripts/failing-script.md",
				eventJrn: "jrn::path:/home/global/sources/github/fail-org/fail-repo/main",
				verb: "GIT_PUSH",
			});
		});

		it("handles non-Error queueJob failure gracefully", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:git-push");

			const jolliscriptDoc = {
				id: 305,
				jrn: "/home/space-1/scripts/non-error-fail.md",
				content: `---
article_type: jolliscript
on:
  jrn: jrn:*:path:/home/*/sources/github/non-error-org/non-error-repo/main
  verb: GIT_PUSH
---

# Jolli_Main

\`\`\`joi
console.log("Non-error failure");
\`\`\`
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([jolliscriptDoc]);

			// Make queueJob fail with a non-Error value
			(scheduler.queueJob as ReturnType<typeof vi.fn>).mockRejectedValueOnce("string-error");

			const context = createMockContext(def.name);
			await def.handler(
				{
					ref: "refs/heads/main",
					repository: {
						full_name: "non-error-org/non-error-repo",
						owner: { login: "non-error-org" },
						name: "non-error-repo",
					},
				},
				context,
			);

			// Should log the failure with string error
			expect(context.log).toHaveBeenCalledWith("jolliscript-job-queue-failed", {
				articleJrn: "/home/space-1/scripts/non-error-fail.md",
				articleId: 305,
				error: "string-error",
			});
		});

		it("explicitly sets article_type: default does not trigger jolliscript job", async () => {
			const def = getRegisteredJobHandler("jrn-adapter:git-push");

			const explicitDefaultDoc = {
				id: 306,
				jrn: "/home/space-1/docs/explicit-default.md",
				content: `---
article_type: default
on:
  jrn: jrn:*:path:/home/*/sources/github/explicit-org/explicit-repo/main
  verb: GIT_PUSH
---

# Explicit Default Article
`,
				contentType: "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 1,
			};

			docDao.listDocs = vi.fn().mockResolvedValue([explicitDefaultDoc]);

			const context = createMockContext(def.name);
			await def.handler(
				{
					ref: "refs/heads/main",
					repository: {
						full_name: "explicit-org/explicit-repo",
						owner: { login: "explicit-org" },
						name: "explicit-repo",
					},
				},
				context,
			);

			// Should log with explicit default articleType
			expect(context.log).toHaveBeenCalledWith("matching-article-found", {
				articleJrn: "/home/space-1/docs/explicit-default.md",
				articleId: 306,
				eventJrn: "jrn::path:/home/global/sources/github/explicit-org/explicit-repo/main",
				pattern: "jrn:*:path:/home/*/sources/github/explicit-org/explicit-repo/main",
				verb: "GIT_PUSH",
				articleType: "default",
			});

			// Should NOT queue the run-jolliscript job
			expect(scheduler.queueJob).not.toHaveBeenCalled();
		});
	});
});
