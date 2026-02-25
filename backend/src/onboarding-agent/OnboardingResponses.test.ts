/**
 * Tests for OnboardingResponses - template response messages.
 */

import {
	changeGithubMessage,
	completionSummary,
	docActionPromptNoFiles,
	gapAnalysisPrompt,
	gapAnalysisResults,
	generateComplete,
	generatePrompt,
	githubAlreadyConnected,
	githubInstallPrompt,
	githubRepoPrompt,
	githubWaiting,
	helpMessage,
	importComplete,
	importError,
	offTopicRedirect,
	reimportMessage,
	repoNotFound,
	repoScanPrompt,
	scanResults,
	spaceCreated,
	statusMessage,
	syncDetected,
	syncExplanation,
	syncNotDetected,
	syncWaiting,
	welcomeMessage,
} from "./OnboardingResponses";
import type { OnboardingStepData } from "jolli-common";
import { describe, expect, it } from "vitest";

describe("OnboardingResponses", () => {
	describe("welcomeMessage", () => {
		it("should include 3 setup steps", () => {
			const msg = welcomeMessage();
			expect(msg).toContain("Connect GitHub");
			expect(msg).toContain("Import & Generate Docs");
			expect(msg).toContain("Auto-Sync");
		});
	});

	describe("githubAlreadyConnected", () => {
		it("should include repo and branch", () => {
			const msg = githubAlreadyConnected("acme/docs", "main");
			expect(msg).toContain("acme/docs");
			expect(msg).toContain("main");
		});
	});

	describe("githubInstallPrompt", () => {
		it("should ask to install GitHub App", () => {
			expect(githubInstallPrompt()).toContain("install the Jolli GitHub App");
		});
	});

	describe("githubRepoPrompt", () => {
		it("should handle single repo", () => {
			const msg = githubRepoPrompt(["acme/docs"]);
			expect(msg).toContain("one repository");
			expect(msg).toContain("acme/docs");
			expect(msg).toContain("yes");
		});

		it("should handle multiple repos", () => {
			const repos = ["acme/docs", "acme/api", "acme/web"];
			const msg = githubRepoPrompt(repos);
			expect(msg).toContain("repositories");
			expect(msg).toContain("acme/docs");
			expect(msg).toContain("acme/api");
		});

		it("should truncate repos when more than 20", () => {
			const repos = Array.from({ length: 25 }, (_, i) => `org/repo-${i}`);
			const msg = githubRepoPrompt(repos);
			expect(msg).toContain("and 5 more");
			expect(msg).not.toContain("repo-24");
		});

		it("should handle no repos", () => {
			const msg = githubRepoPrompt();
			expect(msg).toContain("connect a repository");
		});

		it("should handle empty array", () => {
			const msg = githubRepoPrompt([]);
			expect(msg).toContain("connect a repository");
		});
	});

	describe("repoNotFound", () => {
		it("should show error with available repos", () => {
			const msg = repoNotFound("typo-repo", ["acme/docs", "acme/api"]);
			expect(msg).toContain("typo-repo");
			expect(msg).toContain("acme/docs");
		});

		it("should truncate when more than 20 repos", () => {
			const repos = Array.from({ length: 25 }, (_, i) => `org/repo-${i}`);
			const msg = repoNotFound("unknown", repos);
			expect(msg).toContain("and 5 more");
		});
	});

	describe("githubWaiting", () => {
		it("should handle install action", () => {
			expect(githubWaiting("install")).toContain("installation");
		});

		it("should handle select action", () => {
			expect(githubWaiting("select")).toContain("selection");
		});
	});

	describe("repoScanPrompt", () => {
		it("should include repo name", () => {
			expect(repoScanPrompt("acme/docs")).toContain("acme/docs");
		});
	});

	describe("scanResults", () => {
		it("should handle zero files", () => {
			const msg = scanResults(0, "acme/docs", []);
			expect(msg).toContain("didn't find any markdown files");
			expect(msg).toContain("Generate");
		});

		it("should show files found", () => {
			const files = ["readme.md", "docs/guide.md"];
			const msg = scanResults(2, "acme/docs", files);
			expect(msg).toContain("2");
			expect(msg).toContain("readme.md");
		});

		it("should truncate when more than 15 files", () => {
			const files = Array.from({ length: 20 }, (_, i) => `file-${i}.md`);
			const msg = scanResults(20, "acme/docs", files);
			expect(msg).toContain("and 5 more files");
		});
	});

	describe("docActionPromptNoFiles", () => {
		it("should offer generation", () => {
			expect(docActionPromptNoFiles()).toContain("generate");
		});
	});

	describe("spaceCreated", () => {
		it("should handle created space", () => {
			expect(spaceCreated("My Docs", true)).toContain("Created");
		});

		it("should handle existing space", () => {
			expect(spaceCreated("My Docs", false)).toContain("existing");
		});
	});

	describe("importError", () => {
		it("should include error details", () => {
			expect(importError("token expired")).toContain("token expired");
		});
	});

	describe("importComplete", () => {
		it("should show basic count", () => {
			const msg = importComplete(5, 0, 0);
			expect(msg).toContain("5");
		});

		it("should show skipped count", () => {
			expect(importComplete(3, 2, 0)).toContain("2 files were skipped");
		});

		it("should show failed count", () => {
			expect(importComplete(3, 0, 1)).toContain("1 files failed");
		});
	});

	describe("gapAnalysisPrompt", () => {
		it("should ask about gap analysis", () => {
			expect(gapAnalysisPrompt()).toContain("gap analysis");
		});
	});

	describe("gapAnalysisResults", () => {
		it("should handle empty gaps", () => {
			expect(gapAnalysisResults([])).toContain("comprehensive");
		});

		it("should show high priority gaps", () => {
			const gaps = [{ title: "README", description: "Missing README", severity: "high" as const }];
			const msg = gapAnalysisResults(gaps);
			expect(msg).toContain("High priority");
			expect(msg).toContain("README");
		});

		it("should show medium priority gaps", () => {
			const gaps = [{ title: "API Docs", description: "No API docs", severity: "medium" as const }];
			const msg = gapAnalysisResults(gaps);
			expect(msg).toContain("Medium priority");
		});

		it("should show low priority gaps", () => {
			const gaps = [{ title: "Changelog", description: "No changelog", severity: "low" as const }];
			const msg = gapAnalysisResults(gaps);
			expect(msg).toContain("Low priority");
		});

		it("should show all severity levels", () => {
			const gaps = [
				{ title: "A", description: "Desc A", severity: "high" as const },
				{ title: "B", description: "Desc B", severity: "medium" as const },
				{ title: "C", description: "Desc C", severity: "low" as const },
			];
			const msg = gapAnalysisResults(gaps);
			expect(msg).toContain("3");
			expect(msg).toContain("High priority");
			expect(msg).toContain("Medium priority");
			expect(msg).toContain("Low priority");
		});
	});

	describe("generatePrompt", () => {
		it("should reference gaps when hasGaps is true", () => {
			expect(generatePrompt(true)).toContain("gap analysis");
		});

		it("should offer general generation when hasGaps is false", () => {
			expect(generatePrompt(false)).toContain("generate documentation from your code");
		});
	});

	describe("generateComplete", () => {
		it("should show article count", () => {
			expect(generateComplete(3)).toContain("3");
		});
	});

	describe("syncExplanation", () => {
		it("should explain auto-sync", () => {
			expect(syncExplanation()).toContain("auto-sync");
		});
	});

	describe("syncWaiting", () => {
		it("should instruct to push changes", () => {
			expect(syncWaiting()).toContain("Push");
		});
	});

	describe("syncNotDetected", () => {
		it("should explain possible reasons", () => {
			expect(syncNotDetected()).toContain("No sync detected");
		});
	});

	describe("syncDetected", () => {
		it("should confirm sync is working", () => {
			expect(syncDetected()).toContain("Sync detected");
		});
	});

	describe("completionSummary", () => {
		it("should show GitHub connected", () => {
			const stepData: OnboardingStepData = {
				connectedIntegration: 1,
				connectedRepo: "acme/docs",
			};
			const msg = completionSummary(stepData);
			expect(msg).toContain("Connected");
			expect(msg).toContain("acme/docs");
		});

		it("should show not connected when no integration", () => {
			const msg = completionSummary({});
			expect(msg).toContain("Not connected");
		});

		it("should show imported and generated counts", () => {
			const stepData: OnboardingStepData = {
				importedArticles: ["a", "b"],
				generatedArticles: ["c"],
				syncTriggered: true,
			};
			const msg = completionSummary(stepData);
			expect(msg).toContain("Imported**: 2");
			expect(msg).toContain("Generated**: 1");
			expect(msg).toContain("Auto-Sync**: Verified");
		});
	});

	describe("statusMessage", () => {
		it("should show GitHub connected status", () => {
			const msg = statusMessage("WELCOME", {
				connectedIntegration: 1,
				connectedRepo: "acme/docs",
			});
			expect(msg).toContain("Connected to **acme/docs**");
		});

		it("should show GitHub app installed but no repo", () => {
			const msg = statusMessage("WELCOME", { connectedInstallationId: 42 });
			expect(msg).toContain("App installed");
		});

		it("should show GitHub not connected", () => {
			const msg = statusMessage("WELCOME", {});
			expect(msg).toContain("Not connected");
		});

		it("should show space name", () => {
			const msg = statusMessage("WELCOME", { spaceName: "My Docs" });
			expect(msg).toContain("My Docs");
		});

		it("should show discovered files count", () => {
			const msg = statusMessage("WELCOME", { discoveredFiles: ["a.md", "b.md"] });
			expect(msg).toContain("2 markdown files");
		});

		it("should show doc action", () => {
			const msg = statusMessage("WELCOME", { docAction: "import" });
			expect(msg).toContain("import");
		});

		it("should show imported articles count", () => {
			const msg = statusMessage("WELCOME", { importedArticles: ["a"] });
			expect(msg).toContain("1 articles");
		});

		it("should show generated articles count", () => {
			const msg = statusMessage("WELCOME", { generatedArticles: ["a", "b"] });
			expect(msg).toContain("2 articles");
		});

		it("should show gap analysis count", () => {
			const msg = statusMessage("WELCOME", {
				gapAnalysisResults: [{ title: "A", description: "B", severity: "high" }],
			});
			expect(msg).toContain("1 gaps");
		});

		it("should show sync verified", () => {
			const msg = statusMessage("WELCOME", { syncTriggered: true });
			expect(msg).toContain("Verified");
		});

		it("should show step description for known step", () => {
			const msg = statusMessage("GITHUB_INSTALL_PROMPT", {});
			expect(msg).toContain("installing the GitHub App");
		});

		it("should not show step description for unknown step", () => {
			const msg = statusMessage("UNKNOWN_STEP", {});
			expect(msg).not.toContain("Current step");
		});
	});

	describe("changeGithubMessage", () => {
		it("should acknowledge the change request", () => {
			expect(changeGithubMessage()).toContain("check your GitHub connection");
		});
	});

	describe("reimportMessage", () => {
		it("should acknowledge re-import", () => {
			expect(reimportMessage()).toContain("re-scan");
		});
	});

	describe("offTopicRedirect", () => {
		it("should redirect to current step for known step", () => {
			const msg = offTopicRedirect("GITHUB_INSTALL_PROMPT");
			expect(msg).toContain("installing the GitHub App");
		});

		it("should use fallback for unknown step", () => {
			const msg = offTopicRedirect("UNKNOWN");
			expect(msg).toContain("completing setup");
		});
	});

	describe("helpMessage", () => {
		it("should return help for known steps", () => {
			expect(helpMessage("WELCOME")).toContain("3 steps");
			expect(helpMessage("GITHUB_INSTALL_PROMPT")).toContain("GitHub App");
			expect(helpMessage("DOC_ACTION_PROMPT")).toContain("Import");
		});

		it("should return fallback for unknown step", () => {
			const msg = helpMessage("UNKNOWN");
			expect(msg).toContain("help you complete");
		});
	});
});
