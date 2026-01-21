import {
	convertV2ToV3,
	convertV3ToV2,
	JrnParser,
	JrnParserV3,
	jrnParser,
	jrnParserV3,
	matches,
	type ParsedDocsJrn,
	type ParsedDocsJrnV3,
} from "./JrnParser.js";
import { describe, expect, it } from "vitest";

describe("JrnParser", () => {
	describe("parse", () => {
		describe("workspace parsing", () => {
			it("parses full workspace with org/space", () => {
				const result = jrnParser.parse("jrn:org_01/spc_01:docs:article/art_01JXYZ");

				expect(result.success).toBe(true);
				if (result.success) {
					expect(result.value.workspace).toBe("org_01/spc_01");
					expect(result.value.orgId).toBe("org_01");
					expect(result.value.spaceId).toBe("spc_01");
				}
			});

			it("parses workspace with space only (/space)", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:docs:article/art_01JXYZ");

				expect(result.success).toBe(true);
				if (result.success) {
					expect(result.value.workspace).toBe("/spc_01JABC");
					expect(result.value.orgId).toBe("");
					expect(result.value.spaceId).toBe("spc_01JABC");
				}
			});

			it("fails when workspace does not have 2 parts", () => {
				const result = jrnParser.parse("jrn:spc_01:docs:article/art_01JXYZ");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("workspace must have format");
				}
			});

			it("fails when spaceId is empty", () => {
				const result = jrnParser.parse("jrn:org_01/:docs:article/art_01JXYZ");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("spaceId is required");
				}
			});

			it("fails when orgId contains invalid characters", () => {
				const result = jrnParser.parse("jrn:org@01/spc_01:docs:article/art_01JXYZ");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("invalid characters");
				}
			});
		});

		describe("docs service", () => {
			it("parses a basic article JRN", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:docs:article/art_01JXYZ");

				expect(result.success).toBe(true);
				if (result.success && jrnParser.isDocs(result.value)) {
					expect(result.value.workspace).toBe("/spc_01JABC");
					expect(result.value.spaceId).toBe("spc_01JABC");
					expect(result.value.service).toBe("docs");
					expect(result.value.resourceType).toBe("article");
					expect(result.value.resourceId).toBe("art_01JXYZ");
					expect((result.value as ParsedDocsJrn).version).toBeUndefined();
				}
			});

			it("parses an article JRN with version", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:docs:article/art_01JXYZ:v/12");

				expect(result.success).toBe(true);
				if (result.success && jrnParser.isDocs(result.value)) {
					expect(result.value.resourceType).toBe("article");
					expect(result.value.resourceId).toBe("art_01JXYZ");
					expect(result.value.version).toBe(12);
				}
			});

			it("parses file resourceType", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:docs:file/file_01JXYZ");

				expect(result.success).toBe(true);
				if (result.success && jrnParser.isDocs(result.value)) {
					expect(result.value.resourceType).toBe("file");
				}
			});

			it("parses folder resourceType", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:docs:folder/my-folder-slug");

				expect(result.success).toBe(true);
				if (result.success && jrnParser.isDocs(result.value)) {
					expect(result.value.resourceType).toBe("folder");
					expect(result.value.resourceId).toBe("my-folder-slug");
				}
			});

			it("parses document resourceType", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:docs:document/my-doc-slug");

				expect(result.success).toBe(true);
				if (result.success && jrnParser.isDocs(result.value)) {
					expect(result.value.resourceType).toBe("document");
					expect(result.value.resourceId).toBe("my-doc-slug");
				}
			});

			it("fails for invalid docs resourceType", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:docs:invalid/art_01JXYZ");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("Invalid docs resourceType");
				}
			});
		});

		describe("sources service", () => {
			describe("github source", () => {
				it("parses a basic github source JRN", () => {
					const result = jrnParser.parse("jrn:/spc_01JABC:sources:github");

					expect(result.success).toBe(true);
					if (result.success && jrnParser.isSources(result.value)) {
						expect(result.value.service).toBe("sources");
						expect(result.value.sourceType).toBe("github");
						if (jrnParser.isGithubSource(result.value)) {
							expect(result.value.org).toBeUndefined();
							expect(result.value.repo).toBeUndefined();
							expect(result.value.branch).toBeUndefined();
						}
					}
				});

				it("parses a github source JRN with org/repo/branch qualifier", () => {
					const result = jrnParser.parse("jrn:/spc_01JABC:sources:github/anthropics/claude-code/main");

					expect(result.success).toBe(true);
					if (result.success && jrnParser.isSources(result.value) && jrnParser.isGithubSource(result.value)) {
						expect(result.value.sourceType).toBe("github");
						expect(result.value.org).toBe("anthropics");
						expect(result.value.repo).toBe("claude-code");
						expect(result.value.branch).toBe("main");
					}
				});

				it("parses a github source JRN with branch containing slashes", () => {
					const result = jrnParser.parse("jrn:/spc_01JABC:sources:github/org/repo/feature/branch-name");

					expect(result.success).toBe(true);
					if (result.success && jrnParser.isSources(result.value) && jrnParser.isGithubSource(result.value)) {
						expect(result.value.org).toBe("org");
						expect(result.value.repo).toBe("repo");
						expect(result.value.branch).toBe("feature/branch-name");
					}
				});

				it("parses a github source JRN with incomplete qualifier (ignores)", () => {
					const result = jrnParser.parse("jrn:/spc_01JABC:sources:github/org/repo");

					expect(result.success).toBe(true);
					if (result.success && jrnParser.isSources(result.value) && jrnParser.isGithubSource(result.value)) {
						expect(result.value.sourceType).toBe("github");
						// Incomplete qualifier (missing branch) is ignored
						expect(result.value.org).toBeUndefined();
						expect(result.value.repo).toBeUndefined();
						expect(result.value.branch).toBeUndefined();
					}
				});
			});

			describe("web source", () => {
				it("parses a basic web source JRN", () => {
					const result = jrnParser.parse("jrn:/spc_01JABC:sources:web");

					expect(result.success).toBe(true);
					if (result.success && jrnParser.isSources(result.value) && jrnParser.isWebSource(result.value)) {
						expect(result.value.service).toBe("sources");
						expect(result.value.sourceType).toBe("web");
						expect(result.value.url).toBeUndefined();
					}
				});

				it("parses a web source JRN with URL qualifier", () => {
					const result = jrnParser.parse("jrn:/spc_01JABC:sources:web/https://example.com/page");

					expect(result.success).toBe(true);
					if (result.success && jrnParser.isSources(result.value) && jrnParser.isWebSource(result.value)) {
						expect(result.value.sourceType).toBe("web");
						expect(result.value.url).toBe("https://example.com/page");
					}
				});

				it("parses a web source JRN with URL containing port", () => {
					const result = jrnParser.parse("jrn:/spc_01JABC:sources:web/https://localhost:3000/api");

					expect(result.success).toBe(true);
					if (result.success && jrnParser.isSources(result.value) && jrnParser.isWebSource(result.value)) {
						expect(result.value.url).toBe("https://localhost:3000/api");
					}
				});
			});

			it("fails for unknown source type", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:sources:unknown");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("Unknown source type");
				}
			});
		});

		describe("jobs service", () => {
			it("parses a job JRN", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:jobs:job/job_01J999");

				expect(result.success).toBe(true);
				if (result.success && jrnParser.isJob(result.value)) {
					expect(result.value.service).toBe("jobs");
					expect(result.value.resourceType).toBe("job");
					expect(result.value.resourceId).toBe("job_01J999");
				}
			});

			it("fails for invalid jobs resourceType", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:jobs:invalid/job_01J999");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("Invalid jobs resourceType");
				}
			});

			it("fails when resource part is missing slash", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:jobs:job-job_01J999");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("format {resourceType}/{resourceId}");
				}
			});

			it("fails when resourceId contains invalid characters", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:jobs:job/job@01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("invalid characters");
				}
			});
		});

		describe("agents service", () => {
			it("parses an agent JRN", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:agents:agent/agt_01J888");

				expect(result.success).toBe(true);
				if (result.success && jrnParser.isAgents(result.value)) {
					expect(result.value.service).toBe("agents");
					expect(result.value.resourceType).toBe("agent");
					expect(result.value.resourceId).toBe("agt_01J888");
				}
			});

			it("fails for invalid agents resourceType", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:agents:invalid/agt_01J888");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("Invalid agents resourceType");
				}
			});

			it("fails when resource part is missing slash", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:agents:agent-agt_01J888");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("format {resourceType}/{resourceId}");
				}
			});

			it("fails when resourceId contains invalid characters", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:agents:agent/agt@01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("invalid characters");
				}
			});
		});

		describe("assets service", () => {
			it("parses an image asset JRN", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:assets:image/img_01JXYZ");

				expect(result.success).toBe(true);
				if (result.success && jrnParser.isAssets(result.value)) {
					expect(result.value.service).toBe("assets");
					expect(result.value.resourceType).toBe("image");
					expect(result.value.resourceId).toBe("img_01JXYZ");
				}
			});

			it("fails for invalid assets resourceType", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:assets:invalid/img_01JXYZ");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("Invalid assets resourceType");
				}
			});

			it("fails when resource part is missing slash", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:assets:image-img_01JXYZ");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("format {resourceType}/{resourceId}");
				}
			});

			it("fails when resourceId contains invalid characters", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:assets:image/img@01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("invalid characters");
				}
			});
		});

		describe("spaces service", () => {
			it("parses a space JRN", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:spaces:space/my-space-slug");

				expect(result.success).toBe(true);
				if (result.success && jrnParser.isSpaces(result.value)) {
					expect(result.value.service).toBe("spaces");
					expect(result.value.resourceType).toBe("space");
					expect(result.value.resourceId).toBe("my-space-slug");
				}
			});

			it("parses a space JRN with default workspace", () => {
				const result = jrnParser.parse("jrn:/global:spaces:space/default");

				expect(result.success).toBe(true);
				if (result.success && jrnParser.isSpaces(result.value)) {
					expect(result.value.service).toBe("spaces");
					expect(result.value.resourceType).toBe("space");
					expect(result.value.resourceId).toBe("default");
					expect(result.value.spaceId).toBe("global");
				}
			});

			it("fails for invalid spaces resourceType", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:spaces:invalid/my-space");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("Invalid spaces resourceType");
				}
			});

			it("fails when resource part is missing slash", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:spaces:space-my-space");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("format {resourceType}/{resourceId}");
				}
			});

			it("fails when resourceId contains invalid characters", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:spaces:space/my@space");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("invalid characters");
				}
			});
		});

		describe("unknown service", () => {
			it("fails for unknown service", () => {
				const result = jrnParser.parse("jrn:/spc_01JABC:unknown:resource/id");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("Unknown service: unknown");
				}
			});
		});

		describe("raw preservation", () => {
			it("preserves raw JRN string", () => {
				const original = "jrn:/spc_01JABC:docs:article/art_01JXYZ";
				const result = jrnParser.parse(original);

				expect(result.success).toBe(true);
				if (result.success) {
					expect(result.value.raw).toBe(original);
				}
			});
		});

		describe("case sensitivity", () => {
			it("parses JRN with uppercase letters in resourceId", () => {
				const result = jrnParser.parse("jrn:/spc_ABC:docs:article/Art_XYZ123");

				expect(result.success).toBe(true);
				if (result.success && jrnParser.isDocs(result.value)) {
					expect(result.value.resourceId).toBe("Art_XYZ123");
				}
			});

			it("parses JRN with uppercase in spaceId (ULID)", () => {
				const result = jrnParser.parse("jrn:/spc_01JXYZ:docs:article/art_01");

				expect(result.success).toBe(true);
				if (result.success) {
					expect(result.value.spaceId).toBe("spc_01JXYZ");
				}
			});
		});

		describe("error cases", () => {
			it("fails on empty string", () => {
				const result = jrnParser.parse("");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("cannot be empty");
				}
			});

			it("fails on whitespace only", () => {
				const result = jrnParser.parse("   ");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("cannot be empty");
				}
			});

			it("fails when prefix is not jrn", () => {
				const result = jrnParser.parse("arn:/spc_01:docs:article/art_01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain('must start with "jrn:"');
				}
			});

			it("fails when missing parts", () => {
				const result = jrnParser.parse("jrn:/spc_01:docs");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("must have format");
				}
			});

			it("fails when service is empty", () => {
				const result = jrnParser.parse("jrn:/spc_01::article/art_01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("service is required");
				}
			});

			it("fails when resource part is missing slash", () => {
				const result = jrnParser.parse("jrn:/spc_01:docs:article-art_01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("format {resourceType}/{resourceId}");
				}
			});

			it("fails when resourceType is empty", () => {
				const result = jrnParser.parse("jrn:/spc_01:docs:/art_01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("resourceType is required");
				}
			});

			it("fails when resourceId is empty", () => {
				const result = jrnParser.parse("jrn:/spc_01:docs:article/");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("resourceId is required");
				}
			});

			it("fails when service has leading whitespace", () => {
				const result = jrnParser.parse("jrn:/spc_01: docs:article/art_01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("whitespace");
				}
			});

			it("fails when service contains invalid characters", () => {
				const result = jrnParser.parse("jrn:/spc_01:DOCS:article/art_01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("invalid characters");
				}
			});

			it("fails when resourceId has trailing whitespace", () => {
				const result = jrnParser.parse("jrn:/spc_01:docs:article/art_01 ");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("whitespace");
				}
			});

			it("fails when resourceId contains invalid characters", () => {
				const result = jrnParser.parse("jrn:/spc_01:docs:article/art@01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("invalid characters");
				}
			});

			it("fails when resource specification is empty", () => {
				const result = jrnParser.parse("jrn:/spc_01:docs:");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("Resource specification is required");
				}
			});

			it("fails when orgId contains invalid characters", () => {
				const result = jrnParser.parse("jrn:ORG@INVALID/spc_01:docs:article/art_01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("orgId");
					expect(result.error).toContain("invalid characters");
				}
			});
		});
	});

	describe("build methods", () => {
		describe("buildDocs", () => {
			it("builds a basic article JRN with workspace string", () => {
				const jrn = jrnParser.buildDocs({
					workspace: "/spc_01JABC",
					resourceType: "article",
					resourceId: "art_01JXYZ",
				});

				expect(jrn).toBe("jrn:/spc_01JABC:docs:article/art_01JXYZ");
			});

			it("builds a basic article JRN with spaceId only", () => {
				const jrn = jrnParser.buildDocs({
					spaceId: "spc_01JABC",
					resourceType: "article",
					resourceId: "art_01JXYZ",
				});

				expect(jrn).toBe("jrn:/spc_01JABC:docs:article/art_01JXYZ");
			});

			it("builds an article JRN with full workspace components", () => {
				const jrn = jrnParser.buildDocs({
					orgId: "org_01",
					spaceId: "spc_01",
					resourceType: "article",
					resourceId: "art_01JXYZ",
				});

				expect(jrn).toBe("jrn:org_01/spc_01:docs:article/art_01JXYZ");
			});

			it("builds an article JRN with version", () => {
				const jrn = jrnParser.buildDocs({
					workspace: "/spc_01JABC",
					resourceType: "article",
					resourceId: "art_01JXYZ",
					version: 12,
				});

				expect(jrn).toBe("jrn:/spc_01JABC:docs:article/art_01JXYZ:v/12");
			});
		});

		describe("buildGithubSource", () => {
			it("builds a basic github source JRN", () => {
				const jrn = jrnParser.buildGithubSource({
					workspace: "/spc_01JABC",
				});

				expect(jrn).toBe("jrn:/spc_01JABC:sources:github");
			});

			it("builds a github source JRN with org/repo/branch", () => {
				const jrn = jrnParser.buildGithubSource({
					workspace: "/spc_01JABC",
					org: "anthropics",
					repo: "claude-code",
					branch: "main",
				});

				expect(jrn).toBe("jrn:/spc_01JABC:sources:github/anthropics/claude-code/main");
			});
		});

		describe("buildWebSource", () => {
			it("builds a basic web source JRN", () => {
				const jrn = jrnParser.buildWebSource({
					workspace: "/spc_01JABC",
				});

				expect(jrn).toBe("jrn:/spc_01JABC:sources:web");
			});

			it("builds a web source JRN with URL", () => {
				const jrn = jrnParser.buildWebSource({
					workspace: "/spc_01JABC",
					url: "https://example.com/page",
				});

				expect(jrn).toBe("jrn:/spc_01JABC:sources:web/https://example.com/page");
			});
		});

		describe("buildJobs", () => {
			it("builds a job JRN", () => {
				const jrn = jrnParser.buildJobs({
					workspace: "/spc_01JABC",
					resourceId: "job_01J999",
				});

				expect(jrn).toBe("jrn:/spc_01JABC:jobs:job/job_01J999");
			});
		});

		describe("buildAgents", () => {
			it("builds an agent JRN", () => {
				const jrn = jrnParser.buildAgents({
					workspace: "/spc_01JABC",
					resourceId: "agt_01J888",
				});

				expect(jrn).toBe("jrn:/spc_01JABC:agents:agent/agt_01J888");
			});
		});

		describe("buildAssets", () => {
			it("builds an image asset JRN", () => {
				const jrn = jrnParser.buildAssets({
					workspace: "/spc_01JABC",
					resourceId: "img_01JXYZ",
				});

				expect(jrn).toBe("jrn:/spc_01JABC:assets:image/img_01JXYZ");
			});
		});
	});

	describe("type guards", () => {
		it("isDocs returns true for docs service", () => {
			const result = jrnParser.parse("jrn:/spc_01:docs:article/art_01");
			expect(result.success).toBe(true);
			if (result.success) {
				expect(jrnParser.isDocs(result.value)).toBe(true);
				expect(jrnParser.isSources(result.value)).toBe(false);
				expect(jrnParser.isJob(result.value)).toBe(false);
				expect(jrnParser.isAgents(result.value)).toBe(false);
				expect(jrnParser.isAssets(result.value)).toBe(false);
			}
		});

		it("isSources returns true for sources service", () => {
			const result = jrnParser.parse("jrn:/spc_01:sources:github");
			expect(result.success).toBe(true);
			if (result.success) {
				expect(jrnParser.isSources(result.value)).toBe(true);
				expect(jrnParser.isDocs(result.value)).toBe(false);
			}
		});

		it("isGithubSource returns true for github source", () => {
			const result = jrnParser.parse("jrn:/spc_01:sources:github");
			expect(result.success).toBe(true);
			if (result.success && jrnParser.isSources(result.value)) {
				expect(jrnParser.isGithubSource(result.value)).toBe(true);
				expect(jrnParser.isWebSource(result.value)).toBe(false);
			}
		});

		it("isWebSource returns true for web source", () => {
			const result = jrnParser.parse("jrn:/spc_01:sources:web");
			expect(result.success).toBe(true);
			if (result.success && jrnParser.isSources(result.value)) {
				expect(jrnParser.isWebSource(result.value)).toBe(true);
				expect(jrnParser.isGithubSource(result.value)).toBe(false);
			}
		});

		it("isJob returns true for jobs service", () => {
			const result = jrnParser.parse("jrn:/spc_01:jobs:job/job_01");
			expect(result.success).toBe(true);
			if (result.success) {
				expect(jrnParser.isJob(result.value)).toBe(true);
			}
		});

		it("isAgents returns true for agents service", () => {
			const result = jrnParser.parse("jrn:/spc_01:agents:agent/agt_01");
			expect(result.success).toBe(true);
			if (result.success) {
				expect(jrnParser.isAgents(result.value)).toBe(true);
			}
		});

		it("isAssets returns true for assets service", () => {
			const result = jrnParser.parse("jrn:/spc_01:assets:image/img_01");
			expect(result.success).toBe(true);
			if (result.success) {
				expect(jrnParser.isAssets(result.value)).toBe(true);
			}
		});

		it("type narrowing works with isDocs", () => {
			const result = jrnParser.parse("jrn:/spc_01:docs:article/art_01:v/5");
			expect(result.success).toBe(true);
			if (result.success && jrnParser.isDocs(result.value)) {
				// TypeScript should know result.value.version exists
				expect(result.value.version).toBe(5);
			}
		});

		it("type narrowing works with isSources and isGithubSource", () => {
			const result = jrnParser.parse("jrn:/spc_01:sources:github/org/repo/main");
			expect(result.success).toBe(true);
			if (result.success && jrnParser.isSources(result.value) && jrnParser.isGithubSource(result.value)) {
				// TypeScript should know result.value.org exists
				expect(result.value.org).toBe("org");
				expect(result.value.repo).toBe("repo");
				expect(result.value.branch).toBe("main");
			}
		});

		it("type narrowing works with isSources and isWebSource", () => {
			const result = jrnParser.parse("jrn:/spc_01:sources:web/https://example.com");
			expect(result.success).toBe(true);
			if (result.success && jrnParser.isSources(result.value) && jrnParser.isWebSource(result.value)) {
				// TypeScript should know result.value.url exists
				expect(result.value.url).toBe("https://example.com");
			}
		});
	});

	describe("convenience factories", () => {
		it("article() builds an article JRN with default workspace", () => {
			const jrn = jrnParser.article("art_01jxyz");

			expect(jrn).toBe("jrn:/global:docs:article/art_01jxyz");
		});

		it("article() builds an article JRN with custom workspace", () => {
			const jrn = jrnParser.article("art_01jxyz", { workspace: "/spc_01JABC" });

			expect(jrn).toBe("jrn:/spc_01JABC:docs:article/art_01jxyz");
		});

		it("article() builds an article JRN with spaceId", () => {
			const jrn = jrnParser.article("art_01jxyz", { spaceId: "spc_01JABC" });

			expect(jrn).toBe("jrn:/spc_01JABC:docs:article/art_01jxyz");
		});

		it("article() builds an article JRN with full workspace components", () => {
			const jrn = jrnParser.article("art_01jxyz", { orgId: "org_01", spaceId: "spc_01" });

			expect(jrn).toBe("jrn:org_01/spc_01:docs:article/art_01jxyz");
		});

		it("article() builds an article JRN with version", () => {
			const jrn = jrnParser.article("art_01jxyz", { workspace: "/spc_01JABC", version: 5 });

			expect(jrn).toBe("jrn:/spc_01JABC:docs:article/art_01jxyz:v/5");
		});

		it("article() normalizes title to lowercase", () => {
			const jrn = jrnParser.article("My Article Title");

			expect(jrn).toBe("jrn:/global:docs:article/my-article-title");
		});

		it("article() replaces spaces with hyphens", () => {
			const jrn = jrnParser.article("hello world");

			expect(jrn).toBe("jrn:/global:docs:article/hello-world");
		});

		it("article() collapses multiple spaces into single hyphen", () => {
			const jrn = jrnParser.article("hello   world");

			expect(jrn).toBe("jrn:/global:docs:article/hello-world");
		});

		it("folder() builds a folder JRN with default workspace", () => {
			const jrn = jrnParser.folder("my-folder-slug");

			expect(jrn).toBe("jrn:/global:docs:folder/my-folder-slug");
		});

		it("folder() builds a folder JRN with custom workspace", () => {
			const jrn = jrnParser.folder("my-folder-slug", { workspace: "/spc_01JABC" });

			expect(jrn).toBe("jrn:/spc_01JABC:docs:folder/my-folder-slug");
		});

		it("folder() builds a folder JRN with spaceId", () => {
			const jrn = jrnParser.folder("my-folder-slug", { spaceId: "spc_01JABC" });

			expect(jrn).toBe("jrn:/spc_01JABC:docs:folder/my-folder-slug");
		});

		it("folder() builds a folder JRN with full workspace components", () => {
			const jrn = jrnParser.folder("my-folder-slug", { orgId: "org_01", spaceId: "spc_01" });

			expect(jrn).toBe("jrn:org_01/spc_01:docs:folder/my-folder-slug");
		});

		it("document() builds a document JRN with default workspace", () => {
			const jrn = jrnParser.document("my-doc-slug");

			expect(jrn).toBe("jrn:/global:docs:document/my-doc-slug");
		});

		it("document() builds a document JRN with custom workspace", () => {
			const jrn = jrnParser.document("my-doc-slug", { workspace: "/spc_01JABC" });

			expect(jrn).toBe("jrn:/spc_01JABC:docs:document/my-doc-slug");
		});

		it("document() builds a document JRN with spaceId", () => {
			const jrn = jrnParser.document("my-doc-slug", { spaceId: "spc_01JABC" });

			expect(jrn).toBe("jrn:/spc_01JABC:docs:document/my-doc-slug");
		});

		it("document() builds a document JRN with full workspace components", () => {
			const jrn = jrnParser.document("my-doc-slug", { orgId: "org_01", spaceId: "spc_01" });

			expect(jrn).toBe("jrn:org_01/spc_01:docs:document/my-doc-slug");
		});

		it("githubSource() builds a github source JRN with default workspace", () => {
			const jrn = jrnParser.githubSource();

			expect(jrn).toBe("jrn:/global:sources:github");
		});

		it("githubSource() builds a github source JRN with custom workspace", () => {
			const jrn = jrnParser.githubSource({ workspace: "/spc_01JABC" });

			expect(jrn).toBe("jrn:/spc_01JABC:sources:github");
		});

		it("githubSource() builds a github source JRN with org/repo/branch", () => {
			const jrn = jrnParser.githubSource({
				workspace: "/spc_01JABC",
				org: "anthropics",
				repo: "claude-code",
				branch: "main",
			});

			expect(jrn).toBe("jrn:/spc_01JABC:sources:github/anthropics/claude-code/main");
		});

		it("githubSource() builds a github source JRN with individual workspace components", () => {
			const jrn = jrnParser.githubSource({
				orgId: "org_01",
				spaceId: "spc_01",
				org: "anthropics",
				repo: "claude-code",
				branch: "main",
			});

			expect(jrn).toBe("jrn:org_01/spc_01:sources:github/anthropics/claude-code/main");
		});

		it("webSource() builds a web source JRN with default workspace", () => {
			const jrn = jrnParser.webSource();

			expect(jrn).toBe("jrn:/global:sources:web");
		});

		it("webSource() builds a web source JRN with custom workspace", () => {
			const jrn = jrnParser.webSource({ workspace: "/spc_01JABC" });

			expect(jrn).toBe("jrn:/spc_01JABC:sources:web");
		});

		it("webSource() builds a web source JRN with URL", () => {
			const jrn = jrnParser.webSource({ workspace: "/spc_01JABC", url: "https://example.com/docs" });

			expect(jrn).toBe("jrn:/spc_01JABC:sources:web/https://example.com/docs");
		});

		it("webSource() builds a web source JRN with individual workspace components", () => {
			const jrn = jrnParser.webSource({
				orgId: "org_01",
				spaceId: "spc_01",
				url: "https://example.com/docs",
			});

			expect(jrn).toBe("jrn:org_01/spc_01:sources:web/https://example.com/docs");
		});

		it("agent() builds an agent JRN with default workspace", () => {
			const jrn = jrnParser.agent("agt_01J888");

			expect(jrn).toBe("jrn:/global:agents:agent/agt_01J888");
		});

		it("agent() builds an agent JRN with custom workspace", () => {
			const jrn = jrnParser.agent("agt_01J888", { workspace: "/spc_01JABC" });

			expect(jrn).toBe("jrn:/spc_01JABC:agents:agent/agt_01J888");
		});

		it("agent() builds an agent JRN with individual workspace components", () => {
			const jrn = jrnParser.agent("agt_01J888", {
				orgId: "org_01",
				spaceId: "spc_01",
			});

			expect(jrn).toBe("jrn:org_01/spc_01:agents:agent/agt_01J888");
		});

		it("job() builds a job JRN with default workspace", () => {
			const jrn = jrnParser.job("job_01J999");

			expect(jrn).toBe("jrn:/global:jobs:job/job_01J999");
		});

		it("job() builds a job JRN with custom workspace", () => {
			const jrn = jrnParser.job("job_01J999", { workspace: "/spc_01JABC" });

			expect(jrn).toBe("jrn:/spc_01JABC:jobs:job/job_01J999");
		});

		it("job() builds a job JRN with individual workspace components", () => {
			const jrn = jrnParser.job("job_01J999", {
				orgId: "org_01",
				spaceId: "spc_01",
			});

			expect(jrn).toBe("jrn:org_01/spc_01:jobs:job/job_01J999");
		});

		it("image() builds an image JRN with default workspace", () => {
			const jrn = jrnParser.image("img_01JXYZ");

			expect(jrn).toBe("jrn:/global:assets:image/img_01JXYZ");
		});

		it("image() builds an image JRN with custom workspace", () => {
			const jrn = jrnParser.image("img_01JXYZ", { workspace: "/spc_01JABC" });

			expect(jrn).toBe("jrn:/spc_01JABC:assets:image/img_01JXYZ");
		});

		it("image() builds an image JRN with individual workspace components", () => {
			const jrn = jrnParser.image("img_01JXYZ", {
				orgId: "org_01",
				spaceId: "spc_01",
			});

			expect(jrn).toBe("jrn:org_01/spc_01:assets:image/img_01JXYZ");
		});

		it("space() builds a space JRN with default workspace", () => {
			const jrn = jrnParser.space("my-space-slug");

			expect(jrn).toBe("jrn:/global:spaces:space/my-space-slug");
		});

		it("space() builds a space JRN with custom workspace", () => {
			const jrn = jrnParser.space("my-space-slug", { workspace: "/spc_01JABC" });

			expect(jrn).toBe("jrn:/spc_01JABC:spaces:space/my-space-slug");
		});

		it("space() builds a space JRN with spaceId", () => {
			const jrn = jrnParser.space("my-space-slug", { spaceId: "spc_01JABC" });

			expect(jrn).toBe("jrn:/spc_01JABC:spaces:space/my-space-slug");
		});

		it("space() builds a space JRN with full workspace components", () => {
			const jrn = jrnParser.space("my-space-slug", { orgId: "org_01", spaceId: "spc_01" });

			expect(jrn).toBe("jrn:org_01/spc_01:spaces:space/my-space-slug");
		});
	});

	describe("roundtrip", () => {
		it("parse then build returns equivalent JRN for docs article", () => {
			const original = "jrn:/spc_01JABC:docs:article/art_01JXYZ";
			const result = jrnParser.parse(original);
			expect(result.success).toBe(true);
			if (result.success && jrnParser.isDocs(result.value)) {
				const rebuilt = jrnParser.buildDocs({
					workspace: result.value.workspace,
					resourceType: result.value.resourceType,
					resourceId: result.value.resourceId,
				});
				expect(rebuilt).toBe(original);
			}
		});

		it("parse then build returns equivalent JRN for full workspace path", () => {
			const original = "jrn:org_01/spc_01:docs:article/art_01JXYZ";
			const result = jrnParser.parse(original);
			expect(result.success).toBe(true);
			if (result.success && jrnParser.isDocs(result.value)) {
				const rebuilt = jrnParser.buildDocs({
					workspace: result.value.workspace,
					resourceType: result.value.resourceType,
					resourceId: result.value.resourceId,
				});
				expect(rebuilt).toBe(original);
			}
		});

		it("parse then build returns equivalent JRN for docs article with version", () => {
			const original = "jrn:/spc_01JABC:docs:article/art_01JXYZ:v/12";
			const result = jrnParser.parse(original);
			expect(result.success).toBe(true);
			if (result.success && jrnParser.isDocs(result.value)) {
				const rebuilt = jrnParser.buildDocs({
					workspace: result.value.workspace,
					resourceType: result.value.resourceType,
					resourceId: result.value.resourceId,
					...(result.value.version !== undefined && { version: result.value.version }),
				});
				expect(rebuilt).toBe(original);
			}
		});

		it("parse then build returns equivalent JRN for github source", () => {
			const original = "jrn:/spc_01JABC:sources:github";
			const result = jrnParser.parse(original);
			expect(result.success).toBe(true);
			if (result.success && jrnParser.isSources(result.value) && jrnParser.isGithubSource(result.value)) {
				const rebuilt = jrnParser.buildGithubSource({
					workspace: result.value.workspace,
				});
				expect(rebuilt).toBe(original);
			}
		});

		it("parse then build returns equivalent JRN for github source with qualifier", () => {
			const original = "jrn:/spc_01JABC:sources:github/anthropics/claude-code/main";
			const result = jrnParser.parse(original);
			expect(result.success).toBe(true);
			if (result.success && jrnParser.isSources(result.value) && jrnParser.isGithubSource(result.value)) {
				const rebuilt = jrnParser.buildGithubSource({
					workspace: result.value.workspace,
					...(result.value.org && { org: result.value.org }),
					...(result.value.repo && { repo: result.value.repo }),
					...(result.value.branch && { branch: result.value.branch }),
				});
				expect(rebuilt).toBe(original);
			}
		});

		it("parse then build returns equivalent JRN for web source", () => {
			const original = "jrn:/spc_01JABC:sources:web";
			const result = jrnParser.parse(original);
			expect(result.success).toBe(true);
			if (result.success && jrnParser.isSources(result.value) && jrnParser.isWebSource(result.value)) {
				const rebuilt = jrnParser.buildWebSource({
					workspace: result.value.workspace,
				});
				expect(rebuilt).toBe(original);
			}
		});

		it("parse then build returns equivalent JRN for web source with URL", () => {
			const original = "jrn:/spc_01JABC:sources:web/https://example.com/page";
			const result = jrnParser.parse(original);
			expect(result.success).toBe(true);
			if (result.success && jrnParser.isSources(result.value) && jrnParser.isWebSource(result.value)) {
				const rebuilt = jrnParser.buildWebSource({
					workspace: result.value.workspace,
					...(result.value.url && { url: result.value.url }),
				});
				expect(rebuilt).toBe(original);
			}
		});

		it("parse then build returns equivalent JRN for jobs", () => {
			const original = "jrn:/spc_01JABC:jobs:job/job_01J999";
			const result = jrnParser.parse(original);
			expect(result.success).toBe(true);
			if (result.success && jrnParser.isJob(result.value)) {
				const rebuilt = jrnParser.buildJobs({
					workspace: result.value.workspace,
					resourceId: result.value.resourceId,
				});
				expect(rebuilt).toBe(original);
			}
		});

		it("parse then build returns equivalent JRN for agents", () => {
			const original = "jrn:/spc_01JABC:agents:agent/agt_01J888";
			const result = jrnParser.parse(original);
			expect(result.success).toBe(true);
			if (result.success && jrnParser.isAgents(result.value)) {
				const rebuilt = jrnParser.buildAgents({
					workspace: result.value.workspace,
					resourceId: result.value.resourceId,
				});
				expect(rebuilt).toBe(original);
			}
		});

		it("parse then build returns equivalent JRN for assets", () => {
			const original = "jrn:/spc_01JABC:assets:image/img_01JXYZ";
			const result = jrnParser.parse(original);
			expect(result.success).toBe(true);
			if (result.success && jrnParser.isAssets(result.value)) {
				const rebuilt = jrnParser.buildAssets({
					workspace: result.value.workspace,
					resourceId: result.value.resourceId,
				});
				expect(rebuilt).toBe(original);
			}
		});
	});

	describe("JrnParser class", () => {
		it("can be instantiated separately", () => {
			const parser = new JrnParser();
			const result = parser.parse("jrn:/spc_01:docs:article/art_01");

			expect(result.success).toBe(true);
		});
	});

	describe("matches (integration with JrnMatcher)", () => {
		it("jrnParser.matches delegates to JrnMatcher", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:*:sources:github/**";

			expect(jrnParser.matches(jrn, pattern)).toBe(true);
		});

		it("exported matches function delegates to JrnMatcher", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:*:sources:github/**";

			expect(matches(jrn, pattern)).toBe(true);
		});
	});
});

// =============================================================================
// JRN V3 Parser Tests
// =============================================================================

describe("JrnParserV3", () => {
	describe("isV3", () => {
		it("returns true for v3 format JRN", () => {
			expect(jrnParserV3.isV3("jrn::path:/home/org_01/docs/article/art_01")).toBe(true);
			expect(jrnParserV3.isV3("jrn:ctrl:path:/home/org_01/docs/article/art_01")).toBe(true);
		});

		it("returns false for v2 format JRN", () => {
			expect(jrnParserV3.isV3("jrn:/spc_01:docs:article/art_01")).toBe(false);
			expect(jrnParserV3.isV3("jrn:org_01/spc_01:docs:article/art_01")).toBe(false);
		});

		it("returns false for invalid JRN", () => {
			expect(jrnParserV3.isV3("")).toBe(false);
			expect(jrnParserV3.isV3("not-a-jrn")).toBe(false);
		});
	});

	describe("parse", () => {
		describe("docs service", () => {
			it("parses a basic v3 article JRN", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/docs/article/art_01JXYZ");

				expect(result.success).toBe(true);
				if (result.success && jrnParserV3.isDocs(result.value)) {
					expect(result.value.version).toBe(3);
					expect(result.value.type).toBe("path");
					expect(result.value.controllingPath).toBe("");
					expect(result.value.path).toBe("/home/org_01/docs/article/art_01JXYZ");
					expect(result.value.orgId).toBe("org_01");
					expect(result.value.service).toBe("docs");
					expect(result.value.resourceType).toBe("article");
					expect(result.value.resourceId).toBe("art_01JXYZ");
					expect((result.value as ParsedDocsJrnV3).docVersion).toBeUndefined();
				}
			});

			it("parses a v3 article JRN with version qualifier", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/docs/article/art_01JXYZ:v/12");

				expect(result.success).toBe(true);
				if (result.success && jrnParserV3.isDocs(result.value)) {
					expect(result.value.resourceId).toBe("art_01JXYZ");
					expect(result.value.docVersion).toBe(12);
				}
			});

			it("parses a v3 article JRN with controlling path", () => {
				const result = jrnParserV3.parse("jrn:myctrl:path:/home/org_01/docs/article/art_01JXYZ");

				expect(result.success).toBe(true);
				if (result.success) {
					expect(result.value.controllingPath).toBe("myctrl");
				}
			});

			it("parses file resourceType", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/docs/file/file_01JXYZ");

				expect(result.success).toBe(true);
				if (result.success && jrnParserV3.isDocs(result.value)) {
					expect(result.value.resourceType).toBe("file");
				}
			});

			it("parses folder resourceType", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/docs/folder/my-folder-slug");

				expect(result.success).toBe(true);
				if (result.success && jrnParserV3.isDocs(result.value)) {
					expect(result.value.resourceType).toBe("folder");
					expect(result.value.resourceId).toBe("my-folder-slug");
				}
			});

			it("parses document resourceType", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/docs/document/my-doc-slug");

				expect(result.success).toBe(true);
				if (result.success && jrnParserV3.isDocs(result.value)) {
					expect(result.value.resourceType).toBe("document");
					expect(result.value.resourceId).toBe("my-doc-slug");
				}
			});

			it("fails for invalid docs resourceType", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/docs/invalid/art_01JXYZ");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("Invalid docs resourceType");
				}
			});

			it("fails when docs path has insufficient segments", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/docs/article");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("V3 docs path must have resourceType and resourceId");
				}
			});
		});

		describe("sources service", () => {
			describe("github source", () => {
				it("parses a basic v3 github source JRN", () => {
					const result = jrnParserV3.parse("jrn::path:/home/org_01/sources/github");

					expect(result.success).toBe(true);
					if (result.success && jrnParserV3.isSources(result.value)) {
						expect(result.value.service).toBe("sources");
						if (jrnParserV3.isGithubSource(result.value)) {
							expect(result.value.sourceType).toBe("github");
							expect(result.value.org).toBeUndefined();
							expect(result.value.repo).toBeUndefined();
							expect(result.value.branch).toBeUndefined();
						}
					}
				});

				it("parses a v3 github source JRN with org/repo/branch", () => {
					const result = jrnParserV3.parse(
						"jrn::path:/home/org_01/sources/github/anthropics/claude-code/main",
					);

					expect(result.success).toBe(true);
					if (
						result.success &&
						jrnParserV3.isSources(result.value) &&
						jrnParserV3.isGithubSource(result.value)
					) {
						expect(result.value.org).toBe("anthropics");
						expect(result.value.repo).toBe("claude-code");
						expect(result.value.branch).toBe("main");
					}
				});

				it("parses a v3 github source JRN with branch containing slashes", () => {
					const result = jrnParserV3.parse(
						"jrn::path:/home/org_01/sources/github/org/repo/feature/branch-name",
					);

					expect(result.success).toBe(true);
					if (
						result.success &&
						jrnParserV3.isSources(result.value) &&
						jrnParserV3.isGithubSource(result.value)
					) {
						expect(result.value.org).toBe("org");
						expect(result.value.repo).toBe("repo");
						expect(result.value.branch).toBe("feature/branch-name");
					}
				});
			});

			describe("web source", () => {
				it("parses a basic v3 web source JRN", () => {
					const result = jrnParserV3.parse("jrn::path:/home/org_01/sources/web");

					expect(result.success).toBe(true);
					if (
						result.success &&
						jrnParserV3.isSources(result.value) &&
						jrnParserV3.isWebSource(result.value)
					) {
						expect(result.value.sourceType).toBe("web");
						expect(result.value.url).toBeUndefined();
					}
				});

				it("parses a v3 web source JRN with URL", () => {
					const result = jrnParserV3.parse("jrn::path:/home/org_01/sources/web/https://example.com/page");

					expect(result.success).toBe(true);
					if (
						result.success &&
						jrnParserV3.isSources(result.value) &&
						jrnParserV3.isWebSource(result.value)
					) {
						expect(result.value.url).toBe("https://example.com/page");
					}
				});
			});

			it("fails for unknown source type", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/sources/unknown");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("Unknown source type");
				}
			});

			it("fails when sources path has no sourceType", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/sources");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("V3 sources path must have sourceType");
				}
			});
		});

		describe("jobs service", () => {
			it("parses a v3 job JRN", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/jobs/job/job_01J999");

				expect(result.success).toBe(true);
				if (result.success && jrnParserV3.isJob(result.value)) {
					expect(result.value.service).toBe("jobs");
					expect(result.value.resourceType).toBe("job");
					expect(result.value.resourceId).toBe("job_01J999");
				}
			});

			it("fails for invalid jobs resourceType", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/jobs/invalid/job_01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("Invalid jobs resourceType");
				}
			});

			it("fails when jobs path has insufficient segments", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/jobs/job");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("V3 jobs path must have resourceType and resourceId");
				}
			});
		});

		describe("agents service", () => {
			it("parses a v3 agent JRN", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/agents/agent/agt_01J888");

				expect(result.success).toBe(true);
				if (result.success && jrnParserV3.isAgents(result.value)) {
					expect(result.value.service).toBe("agents");
					expect(result.value.resourceType).toBe("agent");
					expect(result.value.resourceId).toBe("agt_01J888");
				}
			});

			it("fails for invalid agents resourceType", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/agents/invalid/agt_01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("Invalid agents resourceType");
				}
			});

			it("fails when agents path has insufficient segments", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/agents/agent");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("V3 agents path must have resourceType and resourceId");
				}
			});
		});

		describe("assets service", () => {
			it("parses a v3 image asset JRN", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/assets/image/img_01JXYZ");

				expect(result.success).toBe(true);
				if (result.success && jrnParserV3.isAssets(result.value)) {
					expect(result.value.service).toBe("assets");
					expect(result.value.resourceType).toBe("image");
					expect(result.value.resourceId).toBe("img_01JXYZ");
				}
			});

			it("fails for invalid assets resourceType", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/assets/invalid/img_01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("Invalid assets resourceType");
				}
			});

			it("fails when assets path has insufficient segments", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/assets/image");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("V3 assets path must have resourceType and resourceId");
				}
			});
		});

		describe("spaces service", () => {
			it("parses a v3 space JRN", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/spaces/space/my-space-slug");

				expect(result.success).toBe(true);
				if (result.success && jrnParserV3.isSpaces(result.value)) {
					expect(result.value.service).toBe("spaces");
					expect(result.value.resourceType).toBe("space");
					expect(result.value.resourceId).toBe("my-space-slug");
					expect(result.value.orgId).toBe("org_01");
				}
			});

			it("parses a v3 space JRN with controlling path", () => {
				const result = jrnParserV3.parse("jrn:ctrl:path:/home/org_01/spaces/space/default");

				expect(result.success).toBe(true);
				if (result.success && jrnParserV3.isSpaces(result.value)) {
					expect(result.value.service).toBe("spaces");
					expect(result.value.resourceType).toBe("space");
					expect(result.value.resourceId).toBe("default");
					expect(result.value.controllingPath).toBe("ctrl");
				}
			});

			it("fails for invalid spaces resourceType", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/spaces/invalid/my-space");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("Invalid spaces resourceType");
				}
			});

			it("fails when spaces path has insufficient segments", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/spaces/space");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("V3 spaces path must have resourceType and resourceId");
				}
			});
		});

		describe("error cases", () => {
			it("fails on empty string", () => {
				const result = jrnParserV3.parse("");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("cannot be empty");
				}
			});

			it("fails when prefix is not jrn", () => {
				const result = jrnParserV3.parse("arn::path:/home/org_01/docs/article/art_01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain('must start with "jrn:"');
				}
			});

			it("fails when type marker is invalid", () => {
				const result = jrnParserV3.parse("jrn::notpath:/home/org_01/docs/article/art_01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("must have a valid type as second segment");
				}
			});

			it("fails when JRN has insufficient parts", () => {
				const result = jrnParserV3.parse("jrn:ctrl");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("V3 JRN must have format");
				}
			});

			it("fails when path does not start with /home/", () => {
				const result = jrnParserV3.parse("jrn::path:/other/org_01/docs/article/art_01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain('must start with "/home/"');
				}
			});

			it("fails for unknown service", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01/unknown/resource/id");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("Unknown service");
				}
			});

			it("fails when path has insufficient segments", () => {
				const result = jrnParserV3.parse("jrn::path:/home/org_01");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error).toContain("V3 path must have at least");
				}
			});
		});
	});

	describe("build methods", () => {
		describe("buildDocs", () => {
			it("builds a basic v3 article JRN", () => {
				const jrn = jrnParserV3.buildDocs({
					orgId: "org_01",
					resourceType: "article",
					resourceId: "art_01JXYZ",
				});

				expect(jrn).toBe("jrn::path:/home/org_01/docs/article/art_01JXYZ");
			});

			it("builds a v3 article JRN with controlling path", () => {
				const jrn = jrnParserV3.buildDocs({
					controllingPath: "myctrl",
					orgId: "org_01",
					resourceType: "article",
					resourceId: "art_01JXYZ",
				});

				expect(jrn).toBe("jrn:myctrl:path:/home/org_01/docs/article/art_01JXYZ");
			});

			it("builds a v3 article JRN with version", () => {
				const jrn = jrnParserV3.buildDocs({
					orgId: "org_01",
					resourceType: "article",
					resourceId: "art_01JXYZ",
					docVersion: 12,
				});

				expect(jrn).toBe("jrn::path:/home/org_01/docs/article/art_01JXYZ:v/12");
			});
		});

		describe("buildGithubSource", () => {
			it("builds a basic v3 github source JRN", () => {
				const jrn = jrnParserV3.buildGithubSource({
					orgId: "org_01",
				});

				expect(jrn).toBe("jrn::path:/home/org_01/sources/github");
			});

			it("builds a v3 github source JRN with org/repo/branch", () => {
				const jrn = jrnParserV3.buildGithubSource({
					orgId: "org_01",
					org: "anthropics",
					repo: "claude-code",
					branch: "main",
				});

				expect(jrn).toBe("jrn::path:/home/org_01/sources/github/anthropics/claude-code/main");
			});
		});

		describe("buildWebSource", () => {
			it("builds a basic v3 web source JRN", () => {
				const jrn = jrnParserV3.buildWebSource({
					orgId: "org_01",
				});

				expect(jrn).toBe("jrn::path:/home/org_01/sources/web");
			});

			it("builds a v3 web source JRN with URL", () => {
				const jrn = jrnParserV3.buildWebSource({
					orgId: "org_01",
					url: "https://example.com/page",
				});

				expect(jrn).toBe("jrn::path:/home/org_01/sources/web/https://example.com/page");
			});
		});

		describe("buildJobs", () => {
			it("builds a v3 job JRN", () => {
				const jrn = jrnParserV3.buildJobs({
					orgId: "org_01",
					resourceId: "job_01J999",
				});

				expect(jrn).toBe("jrn::path:/home/org_01/jobs/job/job_01J999");
			});
		});

		describe("buildAgents", () => {
			it("builds a v3 agent JRN", () => {
				const jrn = jrnParserV3.buildAgents({
					orgId: "org_01",
					resourceId: "agt_01J888",
				});

				expect(jrn).toBe("jrn::path:/home/org_01/agents/agent/agt_01J888");
			});
		});

		describe("buildAssets", () => {
			it("builds a v3 image asset JRN", () => {
				const jrn = jrnParserV3.buildAssets({
					orgId: "org_01",
					resourceId: "img_01JXYZ",
				});

				expect(jrn).toBe("jrn::path:/home/org_01/assets/image/img_01JXYZ");
			});
		});
	});

	describe("convenience factories", () => {
		it("article() builds a v3 article JRN", () => {
			const jrn = jrnParserV3.article("art_01jxyz", { orgId: "org_01" });

			expect(jrn).toBe("jrn::path:/home/org_01/docs/article/art_01jxyz");
		});

		it("article() builds a v3 article JRN with controlling path and docVersion", () => {
			const jrn = jrnParserV3.article("art_01jxyz", {
				orgId: "org_01",
				controllingPath: "ctrl",
				docVersion: 5,
			});

			expect(jrn).toBe("jrn:ctrl:path:/home/org_01/docs/article/art_01jxyz:v/5");
		});

		it("article() normalizes title to lowercase", () => {
			const jrn = jrnParserV3.article("My Article Title", { orgId: "org_01" });

			expect(jrn).toBe("jrn::path:/home/org_01/docs/article/my-article-title");
		});

		it("folder() builds a v3 folder JRN", () => {
			const jrn = jrnParserV3.folder("my-folder-slug", { orgId: "org_01" });

			expect(jrn).toBe("jrn::path:/home/org_01/docs/folder/my-folder-slug");
		});

		it("folder() builds a v3 folder JRN with controlling path", () => {
			const jrn = jrnParserV3.folder("my-folder-slug", { orgId: "org_01", controllingPath: "ctrl" });

			expect(jrn).toBe("jrn:ctrl:path:/home/org_01/docs/folder/my-folder-slug");
		});

		it("document() builds a v3 document JRN", () => {
			const jrn = jrnParserV3.document("my-doc-slug", { orgId: "org_01" });

			expect(jrn).toBe("jrn::path:/home/org_01/docs/document/my-doc-slug");
		});

		it("document() builds a v3 document JRN with controlling path", () => {
			const jrn = jrnParserV3.document("my-doc-slug", { orgId: "org_01", controllingPath: "ctrl" });

			expect(jrn).toBe("jrn:ctrl:path:/home/org_01/docs/document/my-doc-slug");
		});

		it("githubSource() builds a v3 github source JRN", () => {
			const jrn = jrnParserV3.githubSource({
				orgId: "org_01",
				org: "anthropics",
				repo: "claude-code",
				branch: "main",
			});

			expect(jrn).toBe("jrn::path:/home/org_01/sources/github/anthropics/claude-code/main");
		});

		it("webSource() builds a v3 web source JRN", () => {
			const jrn = jrnParserV3.webSource({ orgId: "org_01", url: "https://example.com/docs" });

			expect(jrn).toBe("jrn::path:/home/org_01/sources/web/https://example.com/docs");
		});

		it("agent() builds a v3 agent JRN", () => {
			const jrn = jrnParserV3.agent("agt_01J888", { orgId: "org_01" });

			expect(jrn).toBe("jrn::path:/home/org_01/agents/agent/agt_01J888");
		});

		it("agent() builds a v3 agent JRN with controlling path", () => {
			const jrn = jrnParserV3.agent("agt_01J888", { orgId: "org_01", controllingPath: "ctrl" });

			expect(jrn).toBe("jrn:ctrl:path:/home/org_01/agents/agent/agt_01J888");
		});

		it("job() builds a v3 job JRN", () => {
			const jrn = jrnParserV3.job("job_01J999", { orgId: "org_01" });

			expect(jrn).toBe("jrn::path:/home/org_01/jobs/job/job_01J999");
		});

		it("job() builds a v3 job JRN with controlling path", () => {
			const jrn = jrnParserV3.job("job_01J999", { orgId: "org_01", controllingPath: "ctrl" });

			expect(jrn).toBe("jrn:ctrl:path:/home/org_01/jobs/job/job_01J999");
		});

		it("image() builds a v3 image JRN", () => {
			const jrn = jrnParserV3.image("img_01JXYZ", { orgId: "org_01" });

			expect(jrn).toBe("jrn::path:/home/org_01/assets/image/img_01JXYZ");
		});

		it("image() builds a v3 image JRN with controlling path", () => {
			const jrn = jrnParserV3.image("img_01JXYZ", { orgId: "org_01", controllingPath: "ctrl" });

			expect(jrn).toBe("jrn:ctrl:path:/home/org_01/assets/image/img_01JXYZ");
		});

		it("space() builds a v3 space JRN", () => {
			const jrn = jrnParserV3.space("my-space-slug", { orgId: "org_01" });

			expect(jrn).toBe("jrn::path:/home/org_01/spaces/space/my-space-slug");
		});

		it("space() builds a v3 space JRN with controlling path", () => {
			const jrn = jrnParserV3.space("default", { orgId: "org_01", controllingPath: "ctrl" });

			expect(jrn).toBe("jrn:ctrl:path:/home/org_01/spaces/space/default");
		});
	});

	describe("type guards", () => {
		it("isDocs returns true for docs service", () => {
			const result = jrnParserV3.parse("jrn::path:/home/org_01/docs/article/art_01");
			expect(result.success).toBe(true);
			if (result.success) {
				expect(jrnParserV3.isDocs(result.value)).toBe(true);
				expect(jrnParserV3.isSources(result.value)).toBe(false);
				expect(jrnParserV3.isJob(result.value)).toBe(false);
				expect(jrnParserV3.isAgents(result.value)).toBe(false);
				expect(jrnParserV3.isAssets(result.value)).toBe(false);
				expect(jrnParserV3.isSpaces(result.value)).toBe(false);
			}
		});

		it("isSpaces returns true for spaces service", () => {
			const result = jrnParserV3.parse("jrn::path:/home/org_01/spaces/space/my-space");
			expect(result.success).toBe(true);
			if (result.success) {
				expect(jrnParserV3.isSpaces(result.value)).toBe(true);
				expect(jrnParserV3.isDocs(result.value)).toBe(false);
				expect(jrnParserV3.isSources(result.value)).toBe(false);
				expect(jrnParserV3.isJob(result.value)).toBe(false);
				expect(jrnParserV3.isAgents(result.value)).toBe(false);
				expect(jrnParserV3.isAssets(result.value)).toBe(false);
			}
		});

		it("isSources returns true for sources service", () => {
			const result = jrnParserV3.parse("jrn::path:/home/org_01/sources/github");
			expect(result.success).toBe(true);
			if (result.success) {
				expect(jrnParserV3.isSources(result.value)).toBe(true);
				expect(jrnParserV3.isDocs(result.value)).toBe(false);
			}
		});

		it("isGithubSource returns true for github source", () => {
			const result = jrnParserV3.parse("jrn::path:/home/org_01/sources/github");
			expect(result.success).toBe(true);
			if (result.success && jrnParserV3.isSources(result.value)) {
				expect(jrnParserV3.isGithubSource(result.value)).toBe(true);
				expect(jrnParserV3.isWebSource(result.value)).toBe(false);
			}
		});

		it("isWebSource returns true for web source", () => {
			const result = jrnParserV3.parse("jrn::path:/home/org_01/sources/web");
			expect(result.success).toBe(true);
			if (result.success && jrnParserV3.isSources(result.value)) {
				expect(jrnParserV3.isWebSource(result.value)).toBe(true);
				expect(jrnParserV3.isGithubSource(result.value)).toBe(false);
			}
		});
	});

	describe("roundtrip", () => {
		it("parse then build returns equivalent JRN for docs article", () => {
			const original = "jrn::path:/home/org_01/docs/article/art_01JXYZ";
			const result = jrnParserV3.parse(original);
			expect(result.success).toBe(true);
			if (result.success && jrnParserV3.isDocs(result.value)) {
				const rebuilt = jrnParserV3.buildDocs({
					orgId: result.value.orgId,
					resourceType: result.value.resourceType,
					resourceId: result.value.resourceId,
				});
				expect(rebuilt).toBe(original);
			}
		});

		it("parse then build returns equivalent JRN for docs with version", () => {
			const original = "jrn::path:/home/org_01/docs/article/art_01JXYZ:v/12";
			const result = jrnParserV3.parse(original);
			expect(result.success).toBe(true);
			if (result.success && jrnParserV3.isDocs(result.value)) {
				const rebuilt = jrnParserV3.buildDocs({
					orgId: result.value.orgId,
					resourceType: result.value.resourceType,
					resourceId: result.value.resourceId,
					...(result.value.docVersion !== undefined && { docVersion: result.value.docVersion }),
				});
				expect(rebuilt).toBe(original);
			}
		});

		it("parse then build returns equivalent JRN for github source", () => {
			const original = "jrn::path:/home/org_01/sources/github/anthropics/claude-code/main";
			const result = jrnParserV3.parse(original);
			expect(result.success).toBe(true);
			if (result.success && jrnParserV3.isSources(result.value) && jrnParserV3.isGithubSource(result.value)) {
				const rebuilt = jrnParserV3.buildGithubSource({
					orgId: result.value.orgId,
					...(result.value.org !== undefined && { org: result.value.org }),
					...(result.value.repo !== undefined && { repo: result.value.repo }),
					...(result.value.branch !== undefined && { branch: result.value.branch }),
				});
				expect(rebuilt).toBe(original);
			}
		});
	});

	describe("JrnParserV3 class", () => {
		it("can be instantiated separately", () => {
			const parser = new JrnParserV3();
			const result = parser.parse("jrn::path:/home/org_01/docs/article/art_01");

			expect(result.success).toBe(true);
		});
	});
});

// =============================================================================
// V2 to V3 Conversion Tests
// =============================================================================

describe("JRN Conversion", () => {
	describe("convertV2ToV3", () => {
		it("converts v2 docs article to v3", () => {
			const v2 = "jrn:/spc_01:docs:article/art_01JXYZ";
			const v3 = convertV2ToV3(v2);

			expect(v3).toBe("jrn::path:/home/spc_01/docs/article/art_01JXYZ");
		});

		it("converts v2 docs article with version to v3", () => {
			const v2 = "jrn:/spc_01:docs:article/art_01JXYZ:v/12";
			const v3 = convertV2ToV3(v2);

			expect(v3).toBe("jrn::path:/home/spc_01/docs/article/art_01JXYZ:v/12");
		});

		it("converts v2 with orgId to v3 using orgId", () => {
			const v2 = "jrn:org_01/spc_01:docs:article/art_01JXYZ";
			const v3 = convertV2ToV3(v2);

			expect(v3).toBe("jrn::path:/home/org_01/docs/article/art_01JXYZ");
		});

		it("converts v2 github source to v3", () => {
			const v2 = "jrn:/spc_01:sources:github/anthropics/claude-code/main";
			const v3 = convertV2ToV3(v2);

			expect(v3).toBe("jrn::path:/home/spc_01/sources/github/anthropics/claude-code/main");
		});

		it("converts v2 web source to v3", () => {
			const v2 = "jrn:/spc_01:sources:web/https://example.com";
			const v3 = convertV2ToV3(v2);

			expect(v3).toBe("jrn::path:/home/spc_01/sources/web/https://example.com");
		});

		it("converts v2 jobs to v3", () => {
			const v2 = "jrn:/spc_01:jobs:job/job_01J999";
			const v3 = convertV2ToV3(v2);

			expect(v3).toBe("jrn::path:/home/spc_01/jobs/job/job_01J999");
		});

		it("converts v2 agents to v3", () => {
			const v2 = "jrn:/spc_01:agents:agent/agt_01J888";
			const v3 = convertV2ToV3(v2);

			expect(v3).toBe("jrn::path:/home/spc_01/agents/agent/agt_01J888");
		});

		it("converts v2 assets to v3", () => {
			const v2 = "jrn:/spc_01:assets:image/img_01JXYZ";
			const v3 = convertV2ToV3(v2);

			expect(v3).toBe("jrn::path:/home/spc_01/assets/image/img_01JXYZ");
		});

		it("converts v2 spaces to v3", () => {
			const v2 = "jrn:/spc_01:spaces:space/default";
			const v3 = convertV2ToV3(v2);

			expect(v3).toBe("jrn::path:/home/spc_01/spaces/space/default");
		});

		it("throws for invalid v2 JRN", () => {
			expect(() => convertV2ToV3("invalid")).toThrow("Failed to parse v2 JRN");
		});
	});

	describe("convertV3ToV2", () => {
		it("converts v3 docs article to v2", () => {
			const v3 = "jrn::path:/home/org_01/docs/article/art_01JXYZ";
			const v2 = convertV3ToV2(v3);

			expect(v2).toBe("jrn:/org_01:docs:article/art_01JXYZ");
		});

		it("converts v3 docs article with version to v2", () => {
			const v3 = "jrn::path:/home/org_01/docs/article/art_01JXYZ:v/12";
			const v2 = convertV3ToV2(v3);

			expect(v2).toBe("jrn:/org_01:docs:article/art_01JXYZ:v/12");
		});

		it("converts v3 github source to v2", () => {
			const v3 = "jrn::path:/home/org_01/sources/github/anthropics/claude-code/main";
			const v2 = convertV3ToV2(v3);

			expect(v2).toBe("jrn:/org_01:sources:github/anthropics/claude-code/main");
		});

		it("converts v3 web source to v2", () => {
			const v3 = "jrn::path:/home/org_01/sources/web/https://example.com";
			const v2 = convertV3ToV2(v3);

			expect(v2).toBe("jrn:/org_01:sources:web/https://example.com");
		});

		it("converts v3 jobs to v2", () => {
			const v3 = "jrn::path:/home/org_01/jobs/job/job_01J999";
			const v2 = convertV3ToV2(v3);

			expect(v2).toBe("jrn:/org_01:jobs:job/job_01J999");
		});

		it("converts v3 agents to v2", () => {
			const v3 = "jrn::path:/home/org_01/agents/agent/agt_01J888";
			const v2 = convertV3ToV2(v3);

			expect(v2).toBe("jrn:/org_01:agents:agent/agt_01J888");
		});

		it("converts v3 assets to v2", () => {
			const v3 = "jrn::path:/home/org_01/assets/image/img_01JXYZ";
			const v2 = convertV3ToV2(v3);

			expect(v2).toBe("jrn:/org_01:assets:image/img_01JXYZ");
		});

		it("converts v3 spaces to v2", () => {
			const v3 = "jrn::path:/home/org_01/spaces/space/my-space";
			const v2 = convertV3ToV2(v3);

			expect(v2).toBe("jrn:/org_01:spaces:space/my-space");
		});

		it("throws for invalid v3 JRN", () => {
			expect(() => convertV3ToV2("invalid")).toThrow("Failed to parse v3 JRN");
		});
	});

	describe("roundtrip conversion", () => {
		it("v2 -> v3 -> v2 preserves semantics for docs", () => {
			const original = "jrn:/org_01:docs:article/art_01JXYZ:v/5";
			const v3 = convertV2ToV3(original);
			const backToV2 = convertV3ToV2(v3);

			// Note: orgId becomes spaceId in the roundtrip
			expect(backToV2).toBe("jrn:/org_01:docs:article/art_01JXYZ:v/5");
		});

		it("v3 -> v2 -> v3 preserves the JRN", () => {
			const original = "jrn::path:/home/org_01/sources/github/anthropics/claude-code/main";
			const v2 = convertV3ToV2(original);
			const backToV3 = convertV2ToV3(v2);

			expect(backToV3).toBe(original);
		});
	});
});
