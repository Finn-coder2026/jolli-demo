/**
 * Tests for GapAnalysisTool - gap analysis with E2B sandbox and heuristic fallback.
 */

import { executeGapAnalysis } from "./GapAnalysisTool";
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

import { createAgentEnvironment } from "../../../../tools/jolliagent/src/direct/agentenv";
import { getConfig } from "../../config/Config";
import { getAccessTokenForIntegration, getActiveGithubIntegration } from "./ToolUtils";

describe("GapAnalysisTool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getConfig).mockReturnValue({} as never);
	});

	describe("executeGapAnalysis", () => {
		describe("heuristic fallback (no E2B config)", () => {
			it("should detect missing common docs when no files exist", async () => {
				const ctx = createMockToolContext({
					discoveredFiles: [],
					importedArticles: [],
				});

				const result = await executeGapAnalysis(ctx);

				expect(result.success).toBe(true);
				expect(result.content).toContain("documentation gaps");
				expect(result.uiAction?.type).toBe("open_gap_analysis");
				expect(ctx.updateStepData).toHaveBeenCalledWith(
					expect.objectContaining({
						gapAnalysisResults: expect.arrayContaining([
							expect.objectContaining({ title: "README", severity: "high" }),
						]),
					}),
				);
			});

			it("should not report gaps for files that exist", async () => {
				const ctx = createMockToolContext({
					discoveredFiles: ["README.md", "docs/getting-started.md", "INSTALL.md"],
					importedArticles: ["jrn:1", "jrn:2", "jrn:3"],
				});

				const result = await executeGapAnalysis(ctx);

				expect(result.success).toBe(true);
				const gapData = vi.mocked(ctx.updateStepData).mock.calls[0][0] as {
					gapAnalysisResults: Array<{ title: string }>;
				};
				const gapTitles = gapData.gapAnalysisResults.map(g => g.title);
				// These files exist, so no gaps for them
				expect(gapTitles).not.toContain("README");
				expect(gapTitles).not.toContain("Getting Started Guide");
				expect(gapTitles).not.toContain("Installation Guide");
			});

			it("should add general documentation gap when very few docs exist", async () => {
				const ctx = createMockToolContext({
					discoveredFiles: ["readme.md"],
					importedArticles: ["jrn:1"],
				});

				const result = await executeGapAnalysis(ctx);

				expect(result.success).toBe(true);
				const gapData = vi.mocked(ctx.updateStepData).mock.calls[0][0] as {
					gapAnalysisResults: Array<{ title: string }>;
				};
				const gapTitles = gapData.gapAnalysisResults.map(g => g.title);
				expect(gapTitles).toContain("General Documentation");
			});

			it("should not add general gap when enough docs exist", async () => {
				const ctx = createMockToolContext({
					discoveredFiles: ["readme.md", "guide.md", "setup.md"],
					importedArticles: ["jrn:1", "jrn:2", "jrn:3"],
				});

				const result = await executeGapAnalysis(ctx);

				expect(result.success).toBe(true);
				const gapData = vi.mocked(ctx.updateStepData).mock.calls[0][0] as {
					gapAnalysisResults: Array<{ title: string }>;
				};
				const gapTitles = gapData.gapAnalysisResults.map(g => g.title);
				expect(gapTitles).not.toContain("General Documentation");
			});

			it("should report no gaps when all common docs exist", async () => {
				const ctx = createMockToolContext({
					discoveredFiles: [
						"README.md",
						"docs/getting-started.md",
						"INSTALL.md",
						"docs/api-reference.md",
						"CONTRIBUTING.md",
						"docs/architecture.md",
						"CHANGELOG.md",
						"docs/deploy.md",
					],
					importedArticles: ["a", "b", "c"],
				});

				const result = await executeGapAnalysis(ctx);

				expect(result.success).toBe(true);
				expect(result.content).toContain("comprehensive");
			});

			it("should include severity counts in summary", async () => {
				const ctx = createMockToolContext({
					discoveredFiles: [],
					importedArticles: [],
				});

				const result = await executeGapAnalysis(ctx);

				expect(result.success).toBe(true);
				// Should have high, medium, and low counts in the message
				expect(result.content).toMatch(/\d+ high/);
				expect(result.content).toMatch(/\d+ medium/);
				expect(result.content).toMatch(/\d+ low/);
			});
		});

		describe("E2B fallback paths", () => {
			it("should fall back to heuristic when E2B is configured but no integration", async () => {
				vi.mocked(getConfig).mockReturnValue({
					E2B_API_KEY: "test-key",
					E2B_TEMPLATE_ID: "test-template",
				} as never);
				vi.mocked(getActiveGithubIntegration).mockResolvedValue(undefined);

				const ctx = createMockToolContext({
					discoveredFiles: [],
					importedArticles: [],
				});

				const result = await executeGapAnalysis(ctx);

				expect(result.success).toBe(true);
				// Falls back to heuristic, so should still find gaps
				expect(result.uiAction?.type).toBe("open_gap_analysis");
			});

			it("should fall back to heuristic when no access token available", async () => {
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
					discoveredFiles: [],
					importedArticles: [],
				});

				const result = await executeGapAnalysis(ctx);

				expect(result.success).toBe(true);
			});

			it("should fall back to heuristic when E2B agent throws", async () => {
				vi.mocked(getConfig).mockReturnValue({
					E2B_API_KEY: "test-key",
					E2B_TEMPLATE_ID: "test-template",
				} as never);
				vi.mocked(getActiveGithubIntegration).mockResolvedValue({
					id: 1,
					metadata: { repo: "acme/docs", branch: "main", installationId: 42 },
				} as never);
				vi.mocked(getAccessTokenForIntegration).mockResolvedValue("token");
				vi.mocked(createAgentEnvironment).mockRejectedValue(new Error("E2B connection failed"));

				const ctx = createMockToolContext({
					discoveredFiles: [],
					importedArticles: [],
				});

				const result = await executeGapAnalysis(ctx);

				// Should gracefully fall back to heuristic
				expect(result.success).toBe(true);
			});

			it("should dispose E2B environment after successful run", async () => {
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
						chatTurn: vi.fn().mockResolvedValue({
							assistantText: '[{"title":"API Guide","description":"Missing API docs","severity":"high"}]',
						}),
					},
					dispose: mockDispose,
				} as never);

				const ctx = createMockToolContext({
					importedArticles: ["jrn:existing"],
				});

				const result = await executeGapAnalysis(ctx);

				expect(result.success).toBe(true);
				expect(mockDispose).toHaveBeenCalled();
			});

			it("should parse E2B agent response for gap results", async () => {
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
						chatTurn: vi.fn().mockResolvedValue({
							assistantText:
								'Here are the gaps: [{"title":"Auth Docs","description":"No auth docs","severity":"high"},{"title":"Deploy Guide","description":"Missing deploy guide","severity":"medium"}]',
						}),
					},
					dispose: vi.fn().mockResolvedValue(undefined),
				} as never);

				const ctx = createMockToolContext();

				const result = await executeGapAnalysis(ctx);

				expect(result.success).toBe(true);
				expect(result.content).toContain("2 documentation gaps");
				expect(result.content).toContain("1 high");
				expect(result.content).toContain("1 medium");
			});

			it("should handle malformed JSON response from E2B agent", async () => {
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
						chatTurn: vi.fn().mockResolvedValue({
							assistantText: "I analyzed the repo but cannot provide JSON results.",
						}),
					},
					dispose: vi.fn().mockResolvedValue(undefined),
				} as never);

				const ctx = createMockToolContext();

				const result = await executeGapAnalysis(ctx);

				// No JSON found, so returns empty gaps
				expect(result.success).toBe(true);
				expect(result.content).toContain("comprehensive");
			});

			it("should filter out gap items without title or description", async () => {
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
						chatTurn: vi.fn().mockResolvedValue({
							assistantText:
								'[{"title":"Valid","description":"Has both"},{"title":"","description":"No title"},{"description":"No title field"},{"title":"Only title"}]',
						}),
					},
					dispose: vi.fn().mockResolvedValue(undefined),
				} as never);

				const ctx = createMockToolContext();

				const result = await executeGapAnalysis(ctx);

				expect(result.success).toBe(true);
				// Only 1 valid gap (has both title and description; empty title is falsy)
				expect(result.content).toContain("1 documentation gap");
			});

			it("should default severity to medium for invalid severity values", async () => {
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
						chatTurn: vi.fn().mockResolvedValue({
							assistantText: '[{"title":"Gap","description":"Desc","severity":"critical"}]',
						}),
					},
					dispose: vi.fn().mockResolvedValue(undefined),
				} as never);

				const ctx = createMockToolContext();

				const result = await executeGapAnalysis(ctx);

				expect(result.success).toBe(true);
				// "critical" is not valid, defaults to "medium"
				expect(result.content).toContain("1 medium");
			});

			it("should invoke runTool callback when chatTurn calls tools", async () => {
				vi.mocked(getConfig).mockReturnValue({
					E2B_API_KEY: "test-key",
					E2B_TEMPLATE_ID: "test-template",
				} as never);
				vi.mocked(getActiveGithubIntegration).mockResolvedValue({
					id: 1,
					metadata: { repo: "acme/docs", branch: "main", installationId: 42 },
				} as never);
				vi.mocked(getAccessTokenForIntegration).mockResolvedValue("token");

				// chatTurn mock that calls runTool callback
				const chatTurnMock = vi.fn().mockImplementation(
					// biome-ignore lint/suspicious/useAwait: Mock async function for testing
					async (opts: { runTool: (call: unknown) => unknown }) => {
						// Simulate the agent calling a tool during execution
						opts.runTool({ name: "bash", arguments: { command: "ls" } });
						return { assistantText: '[{"title":"Test","description":"Desc","severity":"high"}]' };
					},
				);
				vi.mocked(createAgentEnvironment).mockResolvedValue({
					agent: { chatTurn: chatTurnMock },
					dispose: vi.fn().mockResolvedValue(undefined),
				} as never);

				const ctx = createMockToolContext();
				const result = await executeGapAnalysis(ctx);

				expect(result.success).toBe(true);
				// The runToolCall mock should have been invoked
				const { runToolCall } = await import("../../../../tools/jolliagent/src/tools/Tools");
				expect(runToolCall).toHaveBeenCalled();
			});

			it("should include existing articles context when available", async () => {
				vi.mocked(getConfig).mockReturnValue({
					E2B_API_KEY: "test-key",
					E2B_TEMPLATE_ID: "test-template",
				} as never);
				vi.mocked(getActiveGithubIntegration).mockResolvedValue({
					id: 1,
					metadata: { repo: "acme/docs", branch: "main", installationId: 42 },
				} as never);
				vi.mocked(getAccessTokenForIntegration).mockResolvedValue("token");

				const chatTurnMock = vi.fn().mockResolvedValue({
					assistantText: "[]",
				});
				vi.mocked(createAgentEnvironment).mockResolvedValue({
					agent: { chatTurn: chatTurnMock },
					dispose: vi.fn().mockResolvedValue(undefined),
				} as never);

				const ctx = createMockToolContext({
					importedArticles: ["jrn:article1", "jrn:article2"],
				});

				await executeGapAnalysis(ctx);

				// The agent environment should be created with system prompt containing article info
				expect(createAgentEnvironment).toHaveBeenCalledWith(
					expect.objectContaining({
						systemPrompt: expect.stringContaining("2 total"),
					}),
				);
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
						chatTurn: vi.fn().mockResolvedValue({ assistantText: "[]" }),
					},
					dispose: vi.fn().mockRejectedValue(new Error("Dispose failed")),
				} as never);

				const ctx = createMockToolContext();

				// Should not throw even if dispose fails
				const result = await executeGapAnalysis(ctx);
				expect(result.success).toBe(true);
			});
		});

		describe("error handling", () => {
			it("should handle top-level errors gracefully", async () => {
				const ctx = createMockToolContext();
				ctx.updateStepData = vi.fn().mockRejectedValue(new Error("DB write failed"));

				// The gap analysis itself succeeds, but updateStepData throws
				// Since updateStepData is called after gap analysis, the outer try/catch catches it
				vi.mocked(getConfig).mockReturnValue({} as never);

				const result = await executeGapAnalysis(ctx);

				expect(result.success).toBe(false);
				expect(result.content).toContain("Gap analysis failed");
				expect(result.content).toContain("DB write failed");
			});

			it("should handle non-Error objects in catch block", async () => {
				const ctx = createMockToolContext();
				ctx.updateStepData = vi.fn().mockRejectedValue("string error");

				vi.mocked(getConfig).mockReturnValue({} as never);

				const result = await executeGapAnalysis(ctx);

				expect(result.success).toBe(false);
				expect(result.content).toContain("Unknown error");
			});
		});
	});
});
