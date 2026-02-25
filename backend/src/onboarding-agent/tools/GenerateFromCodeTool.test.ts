/**
 * Tests for GenerateFromCodeTool - doc generation with E2B sandbox and placeholder fallback.
 */

import { executeGenerateFromCode } from "./GenerateFromCodeTool";
import { createMockToolContext } from "./ToolTestUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock external dependencies
vi.mock("./ToolUtils", () => ({
	getActiveGithubIntegration: vi.fn(),
	getAccessTokenForIntegration: vi.fn(),
}));

vi.mock("../../config/Config", () => ({
	getConfig: vi.fn(),
}));

vi.mock("../../../../tools/jolliagent/src/direct/agentenv", () => ({
	createAgentEnvironment: vi.fn(),
}));

vi.mock("../../../../tools/jolliagent/src/tools/Tools", () => ({
	runToolCall: vi.fn(),
}));

vi.mock("../../adapters/tools/CreateArticleTool", () => ({
	createCreateArticleToolDefinition: vi.fn().mockReturnValue({ name: "create_article" }),
}));

vi.mock("../../adapters/tools/CreateSectionTool", () => ({
	createCreateSectionToolDefinition: vi.fn().mockReturnValue({ name: "create_section" }),
}));

import { createAgentEnvironment } from "../../../../tools/jolliagent/src/direct/agentenv";
import { getConfig } from "../../config/Config";
import { getAccessTokenForIntegration, getActiveGithubIntegration } from "./ToolUtils";

describe("GenerateFromCodeTool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getConfig).mockReturnValue({} as never);
	});

	describe("executeGenerateFromCode", () => {
		describe("placeholder fallback (no E2B config)", () => {
			it("should generate placeholder articles for gaps", async () => {
				const ctx = createMockToolContext({
					gapAnalysisResults: [
						{ title: "API Guide", description: "Missing API docs", severity: "high" as const },
						{ title: "Deploy Guide", description: "No deploy docs", severity: "medium" as const },
					],
					spaceId: 1,
					connectedRepo: "acme/docs",
				});

				const result = await executeGenerateFromCode(ctx);

				expect(result.success).toBe(true);
				expect(result.content).toContain("2 documentation articles");
				expect(result.uiAction?.type).toBe("generation_completed");
				expect(ctx.docDao.createDoc).toHaveBeenCalledTimes(2);
			});

			it("should generate default articles when no gaps exist", async () => {
				const ctx = createMockToolContext({
					spaceId: 1,
					connectedRepo: "acme/docs",
				});

				const result = await executeGenerateFromCode(ctx);

				expect(result.success).toBe(true);
				expect(result.content).toContain("2 documentation articles");
				// Default gaps: Getting Started + Architecture Overview
				expect(ctx.docDao.createDoc).toHaveBeenCalledTimes(2);
			});

			it("should limit placeholder generation to 5 gaps", async () => {
				const manyGaps = Array.from({ length: 8 }, (_, i) => ({
					title: `Gap ${i}`,
					description: `Description ${i}`,
					severity: "medium" as const,
				}));
				const ctx = createMockToolContext({
					gapAnalysisResults: manyGaps,
					spaceId: 1,
					connectedRepo: "acme/docs",
				});

				const result = await executeGenerateFromCode(ctx);

				expect(result.success).toBe(true);
				expect(ctx.docDao.createDoc).toHaveBeenCalledTimes(5);
			});

			it("should create default space when no spaceId in stepData", async () => {
				const ctx = createMockToolContext({
					connectedRepo: "acme/docs",
				});

				const result = await executeGenerateFromCode(ctx);

				expect(result.success).toBe(true);
				expect(ctx.spaceDao.getDefaultSpace).toHaveBeenCalled();
			});

			it("should create default space when getDefaultSpace returns null", async () => {
				const ctx = createMockToolContext({
					connectedRepo: "acme/docs",
				});
				vi.mocked(ctx.spaceDao.getDefaultSpace).mockResolvedValueOnce(null as never);

				const result = await executeGenerateFromCode(ctx);

				expect(result.success).toBe(true);
				expect(ctx.spaceDao.createDefaultSpaceIfNeeded).toHaveBeenCalled();
			});

			it("should track generated article JRNs in step data", async () => {
				const ctx = createMockToolContext({
					gapAnalysisResults: [{ title: "Guide", description: "A guide", severity: "high" as const }],
					spaceId: 1,
					connectedRepo: "acme/docs",
				});

				await executeGenerateFromCode(ctx);

				expect(ctx.updateStepData).toHaveBeenCalledWith(
					expect.objectContaining({
						generatedArticles: expect.arrayContaining(["jrn:test:doc/test"]),
					}),
				);
			});

			it("should append to existing generated articles", async () => {
				const ctx = createMockToolContext({
					gapAnalysisResults: [{ title: "New Guide", description: "A new guide", severity: "high" as const }],
					spaceId: 1,
					connectedRepo: "acme/docs",
					generatedArticles: ["jrn:existing"],
				});

				await executeGenerateFromCode(ctx);

				expect(ctx.updateStepData).toHaveBeenCalledWith(
					expect.objectContaining({
						generatedArticles: expect.arrayContaining(["jrn:existing", "jrn:test:doc/test"]),
					}),
				);
			});

			it("should handle individual article creation failure gracefully", async () => {
				const ctx = createMockToolContext({
					gapAnalysisResults: [
						{ title: "Fail", description: "Will fail", severity: "high" as const },
						{ title: "Pass", description: "Will pass", severity: "medium" as const },
					],
					spaceId: 1,
					connectedRepo: "acme/docs",
				});
				vi.mocked(ctx.docDao.createDoc)
					.mockRejectedValueOnce(new Error("DB error"))
					.mockResolvedValueOnce({ id: 2, jrn: "jrn:test:doc/pass" } as never);

				const result = await executeGenerateFromCode(ctx);

				// One article failed, one succeeded
				expect(result.success).toBe(true);
				expect(result.content).toContain("1 documentation article");
			});

			it("should return failure when no articles are generated", async () => {
				const ctx = createMockToolContext({
					gapAnalysisResults: [{ title: "Fail", description: "Will fail", severity: "high" as const }],
					spaceId: 1,
					connectedRepo: "acme/docs",
				});
				vi.mocked(ctx.docDao.createDoc).mockRejectedValue(new Error("DB error"));

				const result = await executeGenerateFromCode(ctx);

				expect(result.success).toBe(false);
				expect(result.content).toContain("No articles were generated");
			});

			it("should handle doc without jrn gracefully", async () => {
				const ctx = createMockToolContext({
					gapAnalysisResults: [{ title: "Guide", description: "A guide", severity: "high" as const }],
					spaceId: 1,
					connectedRepo: "acme/docs",
				});
				vi.mocked(ctx.docDao.createDoc).mockResolvedValue({ id: 1 } as never);

				const result = await executeGenerateFromCode(ctx);

				// Doc created but no jrn, so no JRN tracked → 0 articles generated
				expect(result.success).toBe(false);
			});
		});

		describe("E2B fallback paths", () => {
			it("should fall back to placeholder when E2B is configured but no integration", async () => {
				vi.mocked(getConfig).mockReturnValue({
					E2B_API_KEY: "test-key",
					E2B_TEMPLATE_ID: "test-template",
				} as never);
				vi.mocked(getActiveGithubIntegration).mockResolvedValue(undefined);

				const ctx = createMockToolContext({
					spaceId: 1,
					connectedRepo: "acme/docs",
				});

				const result = await executeGenerateFromCode(ctx);

				expect(result.success).toBe(true);
				expect(ctx.docDao.createDoc).toHaveBeenCalled();
			});

			it("should fall back to placeholder when no access token", async () => {
				vi.mocked(getConfig).mockReturnValue({
					E2B_API_KEY: "test-key",
					E2B_TEMPLATE_ID: "test-template",
				} as never);
				vi.mocked(getActiveGithubIntegration).mockResolvedValue({
					id: 1,
					metadata: { repo: "acme/docs", branch: "main", installationId: 42 },
				} as never);
				vi.mocked(getAccessTokenForIntegration).mockResolvedValue(undefined);

				const ctx = createMockToolContext({
					spaceId: 1,
					connectedRepo: "acme/docs",
				});

				const result = await executeGenerateFromCode(ctx);

				expect(result.success).toBe(true);
			});

			it("should fall back to placeholder when no spaceId available in E2B path", async () => {
				vi.mocked(getConfig).mockReturnValue({
					E2B_API_KEY: "test-key",
					E2B_TEMPLATE_ID: "test-template",
				} as never);
				vi.mocked(getActiveGithubIntegration).mockResolvedValue({
					id: 1,
					metadata: { repo: "acme/docs", branch: "main", installationId: 42 },
				} as never);
				vi.mocked(getAccessTokenForIntegration).mockResolvedValue("token");

				// No spaceId in stepData — triggers placeholder fallback
				const ctx = createMockToolContext({
					connectedRepo: "acme/docs",
				});

				const result = await executeGenerateFromCode(ctx);

				expect(result.success).toBe(true);
				// Placeholder generation should create its own space
				expect(ctx.spaceDao.getDefaultSpace).toHaveBeenCalled();
			});

			it("should fall back to placeholder when E2B agent throws", async () => {
				vi.mocked(getConfig).mockReturnValue({
					E2B_API_KEY: "test-key",
					E2B_TEMPLATE_ID: "test-template",
				} as never);
				vi.mocked(getActiveGithubIntegration).mockResolvedValue({
					id: 1,
					metadata: { repo: "acme/docs", branch: "main", installationId: 42 },
				} as never);
				vi.mocked(getAccessTokenForIntegration).mockResolvedValue("token");
				vi.mocked(createAgentEnvironment).mockRejectedValue(new Error("E2B failed"));

				const ctx = createMockToolContext({
					spaceId: 1,
					connectedRepo: "acme/docs",
				});

				const result = await executeGenerateFromCode(ctx);

				expect(result.success).toBe(true);
			});

			it("should track articles from E2B create_article tool calls", async () => {
				vi.mocked(getConfig).mockReturnValue({
					E2B_API_KEY: "test-key",
					E2B_TEMPLATE_ID: "test-template",
				} as never);
				vi.mocked(getActiveGithubIntegration).mockResolvedValue({
					id: 1,
					metadata: { repo: "acme/docs", branch: "main", installationId: 42 },
				} as never);
				vi.mocked(getAccessTokenForIntegration).mockResolvedValue("token");

				// Mock runToolCall to return article creation result
				const { runToolCall } = await import("../../../../tools/jolliagent/src/tools/Tools");
				vi.mocked(runToolCall).mockResolvedValue(
					JSON.stringify({ success: true, jrn: "jrn:generated:doc/api-guide" }),
				);

				let capturedRunTool: ((call: { name: string }) => Promise<string>) | undefined;
				vi.mocked(createAgentEnvironment).mockResolvedValue({
					agent: {
						chatTurn: vi.fn().mockImplementation(async ({ runTool }) => {
							capturedRunTool = runTool;
							// Simulate calling create_article tool
							await runTool({ name: "create_article" });
							return { assistantText: "Created an article" };
						}),
					},
					dispose: vi.fn().mockResolvedValue(undefined),
				} as never);

				const ctx = createMockToolContext({
					spaceId: 1,
					gapAnalysisResults: [{ title: "API Guide", description: "Missing", severity: "high" as const }],
				});

				const result = await executeGenerateFromCode(ctx);

				expect(result.success).toBe(true);
				expect(result.content).toContain("1 documentation article");
				expect(capturedRunTool).toBeDefined();
			});

			it("should handle non-JSON create_article tool output gracefully", async () => {
				vi.mocked(getConfig).mockReturnValue({
					E2B_API_KEY: "test-key",
					E2B_TEMPLATE_ID: "test-template",
				} as never);
				vi.mocked(getActiveGithubIntegration).mockResolvedValue({
					id: 1,
					metadata: { repo: "acme/docs", branch: "main", installationId: 42 },
				} as never);
				vi.mocked(getAccessTokenForIntegration).mockResolvedValue("token");

				const { runToolCall } = await import("../../../../tools/jolliagent/src/tools/Tools");
				vi.mocked(runToolCall).mockResolvedValue("not valid json");

				vi.mocked(createAgentEnvironment).mockResolvedValue({
					agent: {
						chatTurn: vi.fn().mockImplementation(async ({ runTool }) => {
							await runTool({ name: "create_article" });
							return { assistantText: "Done" };
						}),
					},
					dispose: vi.fn().mockResolvedValue(undefined),
				} as never);

				const ctx = createMockToolContext({
					spaceId: 1,
					gapAnalysisResults: [{ title: "Guide", description: "Missing", severity: "high" as const }],
				});

				const result = await executeGenerateFromCode(ctx);

				// No articles tracked (JSON parse failed), so result is failure
				expect(result.success).toBe(false);
			});

			it("should dispose E2B environment after run", async () => {
				const mockDispose = vi.fn().mockResolvedValue(undefined);
				vi.mocked(getConfig).mockReturnValue({
					E2B_API_KEY: "test-key",
					E2B_TEMPLATE_ID: "test-template",
				} as never);
				vi.mocked(getActiveGithubIntegration).mockResolvedValue({
					id: 1,
					metadata: { repo: "acme/docs", branch: "main", installationId: 42 },
				} as never);
				vi.mocked(getAccessTokenForIntegration).mockResolvedValue("token");
				vi.mocked(createAgentEnvironment).mockResolvedValue({
					agent: {
						chatTurn: vi.fn().mockResolvedValue({ assistantText: "Done" }),
					},
					dispose: mockDispose,
				} as never);

				const ctx = createMockToolContext({ spaceId: 1 });

				await executeGenerateFromCode(ctx);

				expect(mockDispose).toHaveBeenCalled();
			});

			it("should handle E2B dispose failure gracefully", async () => {
				vi.mocked(getConfig).mockReturnValue({
					E2B_API_KEY: "test-key",
					E2B_TEMPLATE_ID: "test-template",
				} as never);
				vi.mocked(getActiveGithubIntegration).mockResolvedValue({
					id: 1,
					metadata: { repo: "acme/docs", branch: "main", installationId: 42 },
				} as never);
				vi.mocked(getAccessTokenForIntegration).mockResolvedValue("token");
				vi.mocked(createAgentEnvironment).mockResolvedValue({
					agent: {
						chatTurn: vi.fn().mockResolvedValue({ assistantText: "Done" }),
					},
					dispose: vi.fn().mockRejectedValue(new Error("Dispose failed")),
				} as never);

				const ctx = createMockToolContext({ spaceId: 1 });

				// Should not throw even if dispose fails
				const result = await executeGenerateFromCode(ctx);
				expect(result.success).toBe(false);
			});

			it("should use gaps context in E2B system prompt", async () => {
				vi.mocked(getConfig).mockReturnValue({
					E2B_API_KEY: "test-key",
					E2B_TEMPLATE_ID: "test-template",
				} as never);
				vi.mocked(getActiveGithubIntegration).mockResolvedValue({
					id: 1,
					metadata: { repo: "acme/docs", branch: "main", installationId: 42 },
				} as never);
				vi.mocked(getAccessTokenForIntegration).mockResolvedValue("token");
				vi.mocked(createAgentEnvironment).mockResolvedValue({
					agent: {
						chatTurn: vi.fn().mockResolvedValue({ assistantText: "Done" }),
					},
					dispose: vi.fn().mockResolvedValue(undefined),
				} as never);

				const ctx = createMockToolContext({
					spaceId: 1,
					gapAnalysisResults: [
						{ title: "API Docs", description: "Missing API docs", severity: "high" as const },
					],
				});

				await executeGenerateFromCode(ctx);

				expect(createAgentEnvironment).toHaveBeenCalledWith(
					expect.objectContaining({
						systemPrompt: expect.stringContaining("API Docs"),
					}),
				);
			});
		});

		describe("error handling", () => {
			it("should handle top-level errors gracefully", async () => {
				const ctx = createMockToolContext();
				ctx.updateStepData = vi.fn().mockRejectedValue(new Error("DB write failed"));

				const result = await executeGenerateFromCode(ctx);

				expect(result.success).toBe(false);
				expect(result.content).toContain("Doc generation failed");
				expect(result.content).toContain("DB write failed");
			});

			it("should handle non-Error objects in catch block", async () => {
				const ctx = createMockToolContext();
				ctx.updateStepData = vi.fn().mockRejectedValue("string error");

				const result = await executeGenerateFromCode(ctx);

				expect(result.success).toBe(false);
				expect(result.content).toContain("Unknown error");
			});
		});
	});
});
