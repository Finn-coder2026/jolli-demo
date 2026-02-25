/**
 * Tests for OnboardingFsm state machine.
 */

import { deriveFsmStateFromStepData, transition } from "./OnboardingFsm";
import { importAllMarkdownTool } from "./tools/ImportAllMarkdownTool";
import {
	fetchLatestCommitSha,
	getAccessTokenForIntegration,
	getActiveGithubIntegration,
	matchRepoName,
} from "./tools/ToolUtils";
import type { OnboardingToolContext } from "./types";
import type { OnboardingStepData } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock tool handlers — use arrow fn returning Promise to avoid vi.fn().mockResolvedValue issue in hoisted mocks
vi.mock("./tools/CheckGitHubStatusTool", () => ({
	checkGitHubStatusTool: {
		handler: vi.fn(() =>
			Promise.resolve({
				success: true,
				content: JSON.stringify({ status: "not_installed" }),
			}),
		),
	},
}));

vi.mock("./tools/InstallGitHubAppTool", () => ({
	installGitHubAppTool: {
		handler: vi.fn(() =>
			Promise.resolve({
				success: true,
				content: "Opening GitHub App installation...",
				uiAction: { type: "open_github_install", message: "Install Jolli GitHub App" },
			}),
		),
	},
}));

vi.mock("./tools/ConnectGitHubRepoTool", () => ({
	connectGitHubRepoTool: {
		handler: vi.fn(() =>
			Promise.resolve({
				success: true,
				content: "Opening GitHub connection...",
				uiAction: { type: "open_github_connect", message: "Connect your GitHub repository" },
			}),
		),
	},
}));

vi.mock("./tools/ScanRepositoryTool", () => ({
	scanRepositoryTool: {
		handler: vi.fn(() =>
			Promise.resolve({
				success: true,
				content: "Found 3 markdown files",
			}),
		),
	},
}));

vi.mock("./tools/GetOrCreateSpaceTool", () => ({
	getOrCreateSpaceTool: {
		handler: vi.fn(() =>
			Promise.resolve({
				success: true,
				content: JSON.stringify({ created: true, name: "my-repo", spaceId: 1 }),
			}),
		),
	},
}));

vi.mock("./tools/ImportAllMarkdownTool", () => ({
	importAllMarkdownTool: {
		handler: vi.fn(() =>
			Promise.resolve({
				success: true,
				content: "Import complete:\n- Imported: 3 files",
				uiAction: { type: "import_completed", message: "Imported 3 articles" },
			}),
		),
	},
}));

vi.mock("./tools/GapAnalysisTool", () => ({
	executeGapAnalysis: vi.fn(() =>
		Promise.resolve({
			success: true,
			content: "Gap analysis found 2 documentation gaps.",
		}),
	),
}));

vi.mock("./tools/GenerateFromCodeTool", () => ({
	executeGenerateFromCode: vi.fn(() =>
		Promise.resolve({
			success: true,
			content: "Successfully generated 2 documentation articles.",
			uiAction: { type: "generation_completed", message: "Generated 2 articles" },
		}),
	),
}));

vi.mock("./tools/CompleteOnboardingTool", () => ({
	completeOnboardingTool: {
		handler: vi.fn(() =>
			Promise.resolve({
				success: true,
				content: "Onboarding completed!",
			}),
		),
	},
}));

vi.mock("./tools/SkipOnboardingTool", () => ({
	skipOnboardingTool: {
		handler: vi.fn(() =>
			Promise.resolve({
				success: true,
				content: "Onboarding skipped.",
			}),
		),
	},
}));

// Partial mock of ToolUtils — mock side-effectful/network functions, keep pure functions as real implementation
vi.mock("./tools/ToolUtils", async importOriginal => {
	const actual = await importOriginal<typeof import("./tools/ToolUtils")>();
	return {
		...actual,
		connectRepoDirectly: vi.fn(() => Promise.resolve({ integrationId: 99, installationId: 42 })),
		getActiveGithubIntegration: vi.fn(() => Promise.resolve(undefined)),
		getAccessTokenForIntegration: vi.fn(() => Promise.resolve(undefined)),
		fetchLatestCommitSha: vi.fn(() => Promise.resolve(undefined)),
	};
});

/**
 * Create a minimal mock OnboardingToolContext.
 */
function createMockContext(stepData: Partial<OnboardingStepData> = {}): OnboardingToolContext {
	return {
		userId: 1,
		stepData: stepData as OnboardingStepData,
		updateStepData: vi.fn(() => Promise.resolve(undefined)),
		advanceStep: vi.fn(() => Promise.resolve(undefined)),
		completeOnboarding: vi.fn(() => Promise.resolve(undefined)),
		skipOnboarding: vi.fn(() => Promise.resolve(undefined)),
		integrationDao: {} as OnboardingToolContext["integrationDao"],
		docDao: {} as OnboardingToolContext["docDao"],
		githubInstallationDao: {} as OnboardingToolContext["githubInstallationDao"],
		spaceDao: {} as OnboardingToolContext["spaceDao"],
		docDraftDao: {} as OnboardingToolContext["docDraftDao"],
		docDraftSectionChangesDao: {} as OnboardingToolContext["docDraftSectionChangesDao"],
		userPreferenceDao: {
			getPreference: vi.fn(() => Promise.resolve(undefined)),
			getHash: vi.fn(() => Promise.resolve("0000000000000000")),
			upsertPreference: vi.fn(() => Promise.resolve({} as never)),
		} as OnboardingToolContext["userPreferenceDao"],
	};
}

describe("OnboardingFsm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("matchRepoName", () => {
		const repos = ["acme/docs", "acme/api", "myorg/web-app"];

		it("should match exact full name (case-insensitive)", () => {
			expect(matchRepoName("acme/docs", repos)).toBe("acme/docs");
			expect(matchRepoName("ACME/DOCS", repos)).toBe("acme/docs");
		});

		it("should match by repo name only when unambiguous", () => {
			expect(matchRepoName("docs", repos)).toBe("acme/docs");
			expect(matchRepoName("web-app", repos)).toBe("myorg/web-app");
		});

		it("should return undefined for ambiguous repo name", () => {
			// Both "acme/docs" and "acme/api" start with "a" — but they don't share a repo name
			// Need a real ambiguous case: two repos with same name under different orgs
			const ambiguousRepos = ["org1/docs", "org2/docs"];
			expect(matchRepoName("docs", ambiguousRepos)).toBeUndefined();
		});

		it("should match by substring when unambiguous", () => {
			expect(matchRepoName("doc", repos)).toBe("acme/docs");
			expect(matchRepoName("web", repos)).toBe("myorg/web-app");
		});

		it("should return undefined for ambiguous substring", () => {
			// "a" matches both "api" and ... no, let's check: "a" is a substring of "docs" (no) and "api" (yes) and "web-app" (yes)
			// Actually "a" is substring of "api" and "web-app"
			expect(matchRepoName("a", repos)).toBeUndefined();
		});

		it("should return undefined for empty input", () => {
			expect(matchRepoName("", repos)).toBeUndefined();
			expect(matchRepoName("  ", repos)).toBeUndefined();
		});

		it("should return undefined for no match", () => {
			expect(matchRepoName("nonexistent", repos)).toBeUndefined();
		});

		it("should strip markdown bold formatting before matching", () => {
			expect(matchRepoName("**acme/docs**", repos)).toBe("acme/docs");
			expect(matchRepoName("**docs**", repos)).toBe("acme/docs");
		});
	});

	describe("deriveFsmStateFromStepData", () => {
		it("should return existing fsmState if set", () => {
			expect(deriveFsmStateFromStepData({ fsmState: "IMPORTING" })).toBe("IMPORTING");
		});

		it("should return WELCOME for empty step data", () => {
			expect(deriveFsmStateFromStepData({})).toBe("WELCOME");
		});

		it("should return REPO_SCAN_PROMPT if integration connected", () => {
			expect(deriveFsmStateFromStepData({ connectedIntegration: 1 })).toBe("REPO_SCAN_PROMPT");
		});

		it("should return DOC_ACTION_PROMPT if files discovered", () => {
			expect(deriveFsmStateFromStepData({ discoveredFiles: ["readme.md"] })).toBe("DOC_ACTION_PROMPT");
		});

		it("should return SYNC_EXPLAIN if articles imported", () => {
			expect(deriveFsmStateFromStepData({ importedArticles: ["jrn://doc/test"] })).toBe("SYNC_EXPLAIN");
		});

		it("should return SYNC_CONFIRMED if sync triggered", () => {
			expect(deriveFsmStateFromStepData({ syncTriggered: true })).toBe("SYNC_CONFIRMED");
		});
	});

	describe("transition", () => {
		describe("WELCOME state", () => {
			it("should transition to GITHUB_CHECK on confirm", async () => {
				const ctx = createMockContext();
				const result = await transition("WELCOME", "confirm", ctx);
				// GITHUB_CHECK auto-transitions, so we may end up at a prompt state
				expect(result.events.length).toBeGreaterThan(0);
			});

			it("should transition to COMPLETED on skip", async () => {
				const ctx = createMockContext();
				const result = await transition("WELCOME", "skip", ctx);
				expect(result.newState).toBe("COMPLETED");
			});

			it("should stay at WELCOME for off_topic", async () => {
				const ctx = createMockContext();
				const result = await transition("WELCOME", "off_topic", ctx);
				expect(result.newState).toBe("WELCOME");
			});

			it("should stay at WELCOME for help", async () => {
				const ctx = createMockContext();
				const result = await transition("WELCOME", "help", ctx);
				expect(result.newState).toBe("WELCOME");
			});
		});

		describe("GITHUB_INSTALL_PROMPT state", () => {
			it("should open install dialog on confirm", async () => {
				const ctx = createMockContext();
				const result = await transition("GITHUB_INSTALL_PROMPT", "confirm", ctx);
				expect(result.newState).toBe("GITHUB_INSTALLING");
				expect(result.events.some(e => e.type === "ui_action")).toBe(true);
			});

			it("should skip to REPO_SCAN_PROMPT on skip", async () => {
				const ctx = createMockContext();
				const result = await transition("GITHUB_INSTALL_PROMPT", "skip", ctx);
				expect(result.newState).toBe("REPO_SCAN_PROMPT");
			});
		});

		describe("GITHUB_INSTALLING state", () => {
			it("should re-check GitHub on github_done", async () => {
				const ctx = createMockContext();
				const result = await transition("GITHUB_INSTALLING", "github_done", ctx);
				// Will go to GITHUB_CHECK → auto transitions
				expect(result.events.length).toBeGreaterThan(0);
			});
		});

		describe("GITHUB_REPO_PROMPT state", () => {
			it("should auto-select single repo on confirm", async () => {
				const ctx = createMockContext({ availableRepos: ["acme/docs"] });
				const result = await transition("GITHUB_REPO_PROMPT", "confirm", ctx);
				expect(result.newState).toBe("REPO_SCAN_PROMPT");
				expect(ctx.updateStepData).toHaveBeenCalledWith(
					expect.objectContaining({ connectedRepo: "acme/docs", connectedIntegration: 99 }),
				);
			});

			it("should re-prompt on confirm with multiple repos", async () => {
				const ctx = createMockContext({ availableRepos: ["acme/docs", "acme/api"] });
				const result = await transition("GITHUB_REPO_PROMPT", "confirm", ctx);
				expect(result.newState).toBe("GITHUB_REPO_PROMPT");
				expect(result.events.some(e => e.content?.includes("Type the name"))).toBe(true);
			});

			it("should fall back to modal dialog on confirm with no repos", async () => {
				const ctx = createMockContext();
				const result = await transition("GITHUB_REPO_PROMPT", "confirm", ctx);
				expect(result.newState).toBe("GITHUB_REPO_SELECTING");
			});

			it("should match typed repo name even when classified as off_topic", async () => {
				const ctx = createMockContext({ availableRepos: ["acme/docs", "acme/api"] });
				ctx.userMessage = "docs";
				const result = await transition("GITHUB_REPO_PROMPT", "off_topic", ctx);
				expect(result.newState).toBe("REPO_SCAN_PROMPT");
				expect(ctx.updateStepData).toHaveBeenCalledWith(
					expect.objectContaining({ connectedRepo: "acme/docs" }),
				);
			});

			it("should match typed repo name even when classified as status", async () => {
				const ctx = createMockContext({ availableRepos: ["acme/docs", "acme/api"] });
				ctx.userMessage = "acme/docs";
				const result = await transition("GITHUB_REPO_PROMPT", "status", ctx);
				expect(result.newState).toBe("REPO_SCAN_PROMPT");
				expect(ctx.updateStepData).toHaveBeenCalledWith(
					expect.objectContaining({ connectedRepo: "acme/docs" }),
				);
			});

			it("should match repo name on confirm with multiple repos when message contains repo", async () => {
				const ctx = createMockContext({ availableRepos: ["acme/docs", "acme/api"] });
				ctx.userMessage = "acme/docs";
				const result = await transition("GITHUB_REPO_PROMPT", "confirm", ctx);
				expect(result.newState).toBe("REPO_SCAN_PROMPT");
				expect(ctx.updateStepData).toHaveBeenCalledWith(
					expect.objectContaining({ connectedRepo: "acme/docs" }),
				);
			});

			it("should match repo name with markdown bold formatting", async () => {
				const ctx = createMockContext({ availableRepos: ["acme/docs", "acme/api"] });
				ctx.userMessage = "**acme/docs**";
				const result = await transition("GITHUB_REPO_PROMPT", "confirm", ctx);
				expect(result.newState).toBe("REPO_SCAN_PROMPT");
				expect(ctx.updateStepData).toHaveBeenCalledWith(
					expect.objectContaining({ connectedRepo: "acme/docs" }),
				);
			});

			it("should match exact repo name typed by user", async () => {
				const ctx = createMockContext({ availableRepos: ["acme/docs", "acme/api"] });
				ctx.userMessage = "acme/docs";
				// With a non-global intent that doesn't match skip/confirm, we hit the repo matching branch
				const result = await transition("GITHUB_REPO_PROMPT", "github_done", ctx);
				expect(result.newState).toBe("REPO_SCAN_PROMPT");
				expect(ctx.updateStepData).toHaveBeenCalledWith(
					expect.objectContaining({ connectedRepo: "acme/docs" }),
				);
			});

			it("should match partial repo name typed by user", async () => {
				const ctx = createMockContext({ availableRepos: ["acme/docs", "acme/api"] });
				ctx.userMessage = "docs";
				const result = await transition("GITHUB_REPO_PROMPT", "github_done", ctx);
				expect(result.newState).toBe("REPO_SCAN_PROMPT");
				expect(ctx.updateStepData).toHaveBeenCalledWith(
					expect.objectContaining({ connectedRepo: "acme/docs" }),
				);
			});

			it("should show error when typed repo name doesn't match", async () => {
				const ctx = createMockContext({ availableRepos: ["acme/docs", "acme/api"] });
				ctx.userMessage = "nonexistent";
				const result = await transition("GITHUB_REPO_PROMPT", "github_done", ctx);
				expect(result.newState).toBe("GITHUB_REPO_PROMPT");
				expect(result.events.some(e => e.content?.includes("couldn't find"))).toBe(true);
			});

			it("should skip to REPO_SCAN_PROMPT on skip", async () => {
				const ctx = createMockContext();
				const result = await transition("GITHUB_REPO_PROMPT", "skip", ctx);
				expect(result.newState).toBe("REPO_SCAN_PROMPT");
			});
		});

		describe("REPO_SCAN_PROMPT state", () => {
			it("should scan repo on confirm", async () => {
				const ctx = createMockContext({ connectedRepo: "acme/docs" });
				const result = await transition("REPO_SCAN_PROMPT", "confirm", ctx);
				expect(result.newState).toBe("DOC_ACTION_PROMPT");
			});

			it("should skip to SYNC_EXPLAIN on skip", async () => {
				const ctx = createMockContext();
				const result = await transition("REPO_SCAN_PROMPT", "skip", ctx);
				expect(result.newState).toBe("SYNC_EXPLAIN");
			});
		});

		describe("DOC_ACTION_PROMPT state", () => {
			it("should set docAction=import on import intent", async () => {
				const ctx = createMockContext({ connectedRepo: "acme/docs", discoveredFiles: ["readme.md"] });
				const result = await transition("DOC_ACTION_PROMPT", "import", ctx);
				expect(ctx.updateStepData).toHaveBeenCalledWith({ docAction: "import" });
				// Chains through SPACE_CREATING, then returns IMPORTING for the agent auto-loop to handle
				expect(result.events.some(e => e.toolCall?.name === "get_or_create_space")).toBe(true);
				expect(result.newState).toBe("IMPORTING");
			});

			it("should set docAction=generate on generate intent", async () => {
				const ctx = createMockContext({ connectedRepo: "acme/docs" });
				const result = await transition("DOC_ACTION_PROMPT", "generate", ctx);
				expect(ctx.updateStepData).toHaveBeenCalledWith({ docAction: "generate" });
				expect(result.newState).toBe("GENERATE_PROMPT");
			});

			it("should set docAction=both on both intent", async () => {
				const ctx = createMockContext({ connectedRepo: "acme/docs", discoveredFiles: ["readme.md"] });
				const result = await transition("DOC_ACTION_PROMPT", "both", ctx);
				expect(ctx.updateStepData).toHaveBeenCalledWith({ docAction: "both" });
				// Chains through SPACE_CREATING, returns IMPORTING for agent auto-loop
				expect(result.newState).toBe("IMPORTING");
			});

			it("should skip to SYNC_EXPLAIN on skip", async () => {
				const ctx = createMockContext();
				const result = await transition("DOC_ACTION_PROMPT", "skip", ctx);
				expect(result.newState).toBe("SYNC_EXPLAIN");
			});
		});

		describe("IMPORTING state (auto)", () => {
			it("should run import and transition to GAP_ANALYSIS_PROMPT", async () => {
				const ctx = createMockContext({ connectedRepo: "acme/docs", discoveredFiles: ["readme.md"] });
				const result = await transition("IMPORTING", "confirm", ctx);
				expect(result.events.some(e => e.toolCall?.name === "import_all_markdown")).toBe(true);
				expect(result.newState).toBe("GAP_ANALYSIS_PROMPT");
			});

			it("should surface error when import tool fails", async () => {
				// Override the mock to return a failure
				vi.mocked(importAllMarkdownTool.handler).mockResolvedValueOnce({
					success: false,
					content: "Could not get access to the repository. Please reconnect GitHub.",
				});

				const ctx = createMockContext({ connectedRepo: "acme/docs", discoveredFiles: ["readme.md"] });
				const result = await transition("IMPORTING", "confirm", ctx);

				expect(result.newState).toBe("GAP_ANALYSIS_PROMPT");
				// Should contain the actual error, not "0 articles imported"
				const contentEvents = result.events.filter(e => e.type === "content");
				const errorContent = contentEvents.find(e => e.content?.includes("encountered an issue"));
				expect(errorContent).toBeDefined();
				expect(errorContent?.content).toContain("Could not get access");
			});
		});

		describe("GAP_ANALYSIS_PROMPT state", () => {
			it("should run gap analysis on confirm", async () => {
				const ctx = createMockContext({ docAction: "import" });
				const result = await transition("GAP_ANALYSIS_PROMPT", "confirm", ctx);
				// After gap analysis with docAction=import, should go to SYNC_EXPLAIN
				expect(result.newState).toBe("SYNC_EXPLAIN");
			});

			it("should go to GENERATE_PROMPT on skip with docAction=both", async () => {
				const ctx = createMockContext({ docAction: "both" });
				const result = await transition("GAP_ANALYSIS_PROMPT", "skip", ctx);
				expect(result.newState).toBe("GENERATE_PROMPT");
			});

			it("should go to SYNC_EXPLAIN on skip with docAction=import", async () => {
				const ctx = createMockContext({ docAction: "import" });
				const result = await transition("GAP_ANALYSIS_PROMPT", "skip", ctx);
				expect(result.newState).toBe("SYNC_EXPLAIN");
			});
		});

		describe("GENERATE_PROMPT state", () => {
			it("should start generation on confirm", async () => {
				const ctx = createMockContext({ connectedRepo: "acme/docs" });
				const result = await transition("GENERATE_PROMPT", "confirm", ctx);
				expect(result.newState).toBe("SYNC_EXPLAIN");
			});

			it("should skip to SYNC_EXPLAIN on skip", async () => {
				const ctx = createMockContext();
				const result = await transition("GENERATE_PROMPT", "skip", ctx);
				expect(result.newState).toBe("SYNC_EXPLAIN");
			});
		});

		describe("SYNC_EXPLAIN state", () => {
			it("should start waiting on confirm", async () => {
				const ctx = createMockContext();
				const result = await transition("SYNC_EXPLAIN", "confirm", ctx);
				expect(result.newState).toBe("SYNC_WAITING");
			});

			it("should start waiting on check intent", async () => {
				const ctx = createMockContext();
				const result = await transition("SYNC_EXPLAIN", "check", ctx);
				expect(result.newState).toBe("SYNC_WAITING");
			});

			it("should go to SYNC_CONFIRMED if syncTriggered is already true", async () => {
				const ctx = createMockContext({ syncTriggered: true });
				const result = await transition("SYNC_EXPLAIN", "confirm", ctx);
				expect(result.newState).toBe("SYNC_CONFIRMED");
			});

			it("should detect sync via API and go to SYNC_CONFIRMED", async () => {
				const mockIntegration = {
					id: 1,
					metadata: { repo: "acme/docs", branch: "main", installationId: 42 },
				};
				vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce(mockIntegration as never);
				vi.mocked(getAccessTokenForIntegration).mockResolvedValueOnce("fake-token");
				vi.mocked(fetchLatestCommitSha).mockResolvedValueOnce("new-sha-456");

				const ctx = createMockContext({
					connectedRepo: "acme/docs",
					lastKnownCommitSha: "old-sha-123",
				});
				const result = await transition("SYNC_EXPLAIN", "confirm", ctx);
				expect(result.newState).toBe("SYNC_CONFIRMED");
				expect(ctx.updateStepData).toHaveBeenCalledWith(expect.objectContaining({ syncTriggered: true }));
			});

			it("should snapshot commit SHA if not already done", async () => {
				const mockIntegration = {
					id: 1,
					metadata: { repo: "acme/docs", branch: "main", installationId: 42 },
				};
				// First call: snapshotCommitSha
				vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce(mockIntegration as never);
				vi.mocked(getAccessTokenForIntegration).mockResolvedValueOnce("fake-token");
				vi.mocked(fetchLatestCommitSha).mockResolvedValueOnce("snapshot-sha");
				// Second call: checkSyncViaApi (returns undefined = no new integration found)
				vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce(undefined);

				const ctx = createMockContext({ connectedRepo: "acme/docs" });
				const result = await transition("SYNC_EXPLAIN", "confirm", ctx);

				// Should have called updateStepData for the SHA snapshot
				expect(ctx.updateStepData).toHaveBeenCalledWith(
					expect.objectContaining({ lastKnownCommitSha: "snapshot-sha" }),
				);
				expect(result.newState).toBe("SYNC_WAITING");
			});

			it("should complete on skip", async () => {
				const ctx = createMockContext();
				const result = await transition("SYNC_EXPLAIN", "skip", ctx);
				expect(result.newState).toBe("COMPLETED");
			});
		});

		describe("SYNC_WAITING state", () => {
			it("should stay SYNC_WAITING when no sync detected (webhook or API)", async () => {
				const ctx = createMockContext({ syncTriggered: false });
				const result = await transition("SYNC_WAITING", "check", ctx);
				expect(result.newState).toBe("SYNC_WAITING");
			});

			it("should go to SYNC_CONFIRMED if syncTriggered=true on check (webhook path)", async () => {
				const ctx = createMockContext({ syncTriggered: true });
				const result = await transition("SYNC_WAITING", "check", ctx);
				expect(result.newState).toBe("SYNC_CONFIRMED");
			});

			it("should detect sync via GitHub API and go to SYNC_CONFIRMED", async () => {
				const mockIntegration = {
					id: 1,
					metadata: { repo: "acme/docs", branch: "main", installationId: 42 },
				};
				vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce(mockIntegration as never);
				vi.mocked(getAccessTokenForIntegration).mockResolvedValueOnce("fake-token");
				vi.mocked(fetchLatestCommitSha).mockResolvedValueOnce("new-sha-456");

				const ctx = createMockContext({
					syncTriggered: false,
					connectedRepo: "acme/docs",
					lastKnownCommitSha: "old-sha-123",
				});
				const result = await transition("SYNC_WAITING", "check", ctx);
				expect(result.newState).toBe("SYNC_CONFIRMED");
				expect(ctx.updateStepData).toHaveBeenCalledWith(expect.objectContaining({ syncTriggered: true }));
			});

			it("should stay SYNC_WAITING when commit SHA unchanged via API", async () => {
				const mockIntegration = {
					id: 1,
					metadata: { repo: "acme/docs", branch: "main", installationId: 42 },
				};
				vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce(mockIntegration as never);
				vi.mocked(getAccessTokenForIntegration).mockResolvedValueOnce("fake-token");
				vi.mocked(fetchLatestCommitSha).mockResolvedValueOnce("same-sha-123");

				const ctx = createMockContext({
					syncTriggered: false,
					connectedRepo: "acme/docs",
					lastKnownCommitSha: "same-sha-123",
				});
				const result = await transition("SYNC_WAITING", "check", ctx);
				expect(result.newState).toBe("SYNC_WAITING");
			});

			it("should complete on skip", async () => {
				const ctx = createMockContext();
				const result = await transition("SYNC_WAITING", "skip", ctx);
				expect(result.newState).toBe("COMPLETED");
			});
		});

		describe("SYNC_CONFIRMED state", () => {
			it("should complete on goodbye intent", async () => {
				const ctx = createMockContext({ syncTriggered: true, importedArticles: ["jrn://doc/test"] });
				const result = await transition("SYNC_CONFIRMED", "goodbye", ctx);
				expect(result.newState).toBe("COMPLETED");
			});

			it("should complete on skip intent", async () => {
				const ctx = createMockContext({ syncTriggered: true });
				const result = await transition("SYNC_CONFIRMED", "skip", ctx);
				expect(result.newState).toBe("COMPLETED");
			});

			it("should stay in SYNC_CONFIRMED on confirm intent", async () => {
				const ctx = createMockContext({ syncTriggered: true });
				const result = await transition("SYNC_CONFIRMED", "confirm", ctx);
				expect(result.newState).toBe("SYNC_CONFIRMED");
				// Should show help message about what user can do
				expect(result.events.some(e => e.type === "content")).toBe(true);
			});

			it("should stay in SYNC_CONFIRMED on help intent", async () => {
				const ctx = createMockContext({ syncTriggered: true });
				const result = await transition("SYNC_CONFIRMED", "help", ctx);
				expect(result.newState).toBe("SYNC_CONFIRMED");
			});

			it("should stay in SYNC_CONFIRMED on status intent", async () => {
				const ctx = createMockContext({
					syncTriggered: true,
					connectedRepo: "acme/docs",
					connectedIntegration: 42,
				});
				const result = await transition("SYNC_CONFIRMED", "status", ctx);
				expect(result.newState).toBe("SYNC_CONFIRMED");
				expect(result.events.some(e => e.content?.includes("onboarding status"))).toBe(true);
			});

			it("should stay in SYNC_CONFIRMED on off_topic intent", async () => {
				const ctx = createMockContext({ syncTriggered: true });
				const result = await transition("SYNC_CONFIRMED", "off_topic", ctx);
				expect(result.newState).toBe("SYNC_CONFIRMED");
			});

			it("should go back to GITHUB_CHECK on change_github", async () => {
				const ctx = createMockContext({ syncTriggered: true, connectedRepo: "acme/docs" });
				const result = await transition("SYNC_CONFIRMED", "change_github", ctx);
				expect(result.events.some(e => e.content?.includes("check your GitHub connection"))).toBe(true);
			});

			it("should go back to DOC_ACTION_PROMPT on reimport", async () => {
				const ctx = createMockContext({ syncTriggered: true, connectedRepo: "acme/docs" });
				const result = await transition("SYNC_CONFIRMED", "reimport", ctx);
				expect(result.events.some(e => e.content?.includes("re-scan your repository"))).toBe(true);
				expect(result.newState).toBe("DOC_ACTION_PROMPT");
			});
		});

		describe("change_github backward transitions", () => {
			it("should go back to GITHUB_CHECK from REPO_SCAN_PROMPT on change_github", async () => {
				const ctx = createMockContext({ connectedRepo: "acme/docs" });
				const result = await transition("REPO_SCAN_PROMPT", "change_github", ctx);
				// GITHUB_CHECK auto-transitions; verify change_github message is emitted
				expect(result.events.some(e => e.content?.includes("check your GitHub connection"))).toBe(true);
			});

			it("should go back to GITHUB_CHECK from DOC_ACTION_PROMPT on change_github", async () => {
				const ctx = createMockContext({ connectedRepo: "acme/docs" });
				const result = await transition("DOC_ACTION_PROMPT", "change_github", ctx);
				expect(result.events.some(e => e.content?.includes("check your GitHub connection"))).toBe(true);
			});

			it("should go back to GITHUB_CHECK from GAP_ANALYSIS_PROMPT on change_github", async () => {
				const ctx = createMockContext({ connectedRepo: "acme/docs" });
				const result = await transition("GAP_ANALYSIS_PROMPT", "change_github", ctx);
				expect(result.events.some(e => e.content?.includes("check your GitHub connection"))).toBe(true);
			});

			it("should go back to GITHUB_CHECK from GENERATE_PROMPT on change_github", async () => {
				const ctx = createMockContext({ connectedRepo: "acme/docs" });
				const result = await transition("GENERATE_PROMPT", "change_github", ctx);
				expect(result.events.some(e => e.content?.includes("check your GitHub connection"))).toBe(true);
			});

			it("should go back to GITHUB_CHECK from SYNC_EXPLAIN on change_github", async () => {
				const ctx = createMockContext({ connectedRepo: "acme/docs" });
				const result = await transition("SYNC_EXPLAIN", "change_github", ctx);
				expect(result.events.some(e => e.content?.includes("check your GitHub connection"))).toBe(true);
			});

			it("should go back to GITHUB_CHECK from SYNC_WAITING on change_github", async () => {
				const ctx = createMockContext({ connectedRepo: "acme/docs" });
				const result = await transition("SYNC_WAITING", "change_github", ctx);
				expect(result.events.some(e => e.content?.includes("check your GitHub connection"))).toBe(true);
			});
		});

		describe("reimport backward transitions", () => {
			it("should go back to DOC_ACTION_PROMPT from GAP_ANALYSIS_PROMPT on reimport", async () => {
				const ctx = createMockContext({ connectedRepo: "acme/docs" });
				const result = await transition("GAP_ANALYSIS_PROMPT", "reimport", ctx);
				expect(result.events.some(e => e.content?.includes("re-scan your repository"))).toBe(true);
				expect(result.newState).toBe("DOC_ACTION_PROMPT");
			});

			it("should go back to DOC_ACTION_PROMPT from GENERATE_PROMPT on reimport", async () => {
				const ctx = createMockContext({ connectedRepo: "acme/docs" });
				const result = await transition("GENERATE_PROMPT", "reimport", ctx);
				expect(result.events.some(e => e.content?.includes("re-scan your repository"))).toBe(true);
				expect(result.newState).toBe("DOC_ACTION_PROMPT");
			});

			it("should go back to DOC_ACTION_PROMPT from SYNC_EXPLAIN on reimport", async () => {
				const ctx = createMockContext({ connectedRepo: "acme/docs" });
				const result = await transition("SYNC_EXPLAIN", "reimport", ctx);
				expect(result.events.some(e => e.content?.includes("re-scan your repository"))).toBe(true);
				expect(result.newState).toBe("DOC_ACTION_PROMPT");
			});

			it("should go back to DOC_ACTION_PROMPT from SYNC_WAITING on reimport", async () => {
				const ctx = createMockContext({ connectedRepo: "acme/docs" });
				const result = await transition("SYNC_WAITING", "reimport", ctx);
				expect(result.events.some(e => e.content?.includes("re-scan your repository"))).toBe(true);
				expect(result.newState).toBe("DOC_ACTION_PROMPT");
			});
		});

		describe("COMPLETING state", () => {
			it("should complete onboarding", async () => {
				const ctx = createMockContext({ importedArticles: ["jrn://doc/test"] });
				const result = await transition("COMPLETING", "confirm", ctx);
				expect(result.newState).toBe("COMPLETED");
			});
		});

		describe("COMPLETED state", () => {
			it("should stay completed", async () => {
				const ctx = createMockContext();
				const result = await transition("COMPLETED", "confirm", ctx);
				expect(result.newState).toBe("COMPLETED");
			});
		});

		describe("status intent (global)", () => {
			it("should stay in current state and emit status content", async () => {
				const ctx = createMockContext({
					connectedRepo: "acme/docs",
					connectedIntegration: 42,
					importedArticles: ["jrn://doc/a1"],
				});
				const states: Array<string> = [
					"WELCOME",
					"GITHUB_INSTALL_PROMPT",
					"REPO_SCAN_PROMPT",
					"DOC_ACTION_PROMPT",
					"SYNC_EXPLAIN",
					"SYNC_WAITING",
					"SYNC_CONFIRMED",
				];

				for (const state of states) {
					const result = await transition(state as Parameters<typeof transition>[0], "status", ctx);
					expect(result.newState).toBe(state);
					expect(result.events.some(e => e.content?.includes("onboarding status"))).toBe(true);
				}
			});
		});

		describe("off_topic handling", () => {
			it("should not change state on off_topic from any state", async () => {
				const ctx = createMockContext();
				const states: Array<string> = [
					"WELCOME",
					"GITHUB_INSTALL_PROMPT",
					"REPO_SCAN_PROMPT",
					"DOC_ACTION_PROMPT",
					"SYNC_EXPLAIN",
					"SYNC_WAITING",
					"SYNC_CONFIRMED",
				];

				for (const state of states) {
					const result = await transition(state as Parameters<typeof transition>[0], "off_topic", ctx);
					expect(result.newState).toBe(state);
					expect(result.events.some(e => e.type === "content")).toBe(true);
				}
			});
		});

		describe("goodbye intent (global handler)", () => {
			it("should treat goodbye as skip in non-SYNC_CONFIRMED states", async () => {
				// In WELCOME, goodbye should skip (like skip intent)
				const ctx = createMockContext();
				const result = await transition("WELCOME", "goodbye", ctx);
				expect(result.newState).toBe("COMPLETED");
			});

			it("should treat goodbye as skip in SYNC_WAITING", async () => {
				const ctx = createMockContext();
				const result = await transition("SYNC_WAITING", "goodbye", ctx);
				// Skip in SYNC_WAITING goes to COMPLETING → COMPLETED
				expect(result.newState).toBe("COMPLETED");
			});
		});
	});
});
