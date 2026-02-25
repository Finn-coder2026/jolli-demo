/**
 * OnboardingFsm - Finite State Machine engine for onboarding.
 *
 * Controls onboarding state transitions deterministically. Tool handlers
 * from the tools/ directory are called directly by the FSM rather than
 * being selected by an LLM. The LLM is reduced to a lightweight intent
 * classifier (see IntentClassifier.ts).
 */

import { getLog } from "../util/Logger";
import type { OnboardingIntent } from "./IntentClassifier";
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
import { checkGitHubStatusTool } from "./tools/CheckGitHubStatusTool";
import { completeOnboardingTool } from "./tools/CompleteOnboardingTool";
import { connectGitHubRepoTool } from "./tools/ConnectGitHubRepoTool";
import { executeGapAnalysis } from "./tools/GapAnalysisTool";
import { executeGenerateFromCode } from "./tools/GenerateFromCodeTool";
import { getOrCreateSpaceTool } from "./tools/GetOrCreateSpaceTool";
import { importAllMarkdownTool } from "./tools/ImportAllMarkdownTool";
import { installGitHubAppTool } from "./tools/InstallGitHubAppTool";
import { scanRepositoryTool } from "./tools/ScanRepositoryTool";
import { skipOnboardingTool } from "./tools/SkipOnboardingTool";
import {
	connectRepoDirectly,
	fetchLatestCommitSha,
	getAccessTokenForIntegration,
	getActiveGithubIntegration,
	matchRepoName,
} from "./tools/ToolUtils";
import type { OnboardingToolContext, OnboardingToolExecutionResult } from "./types";
import type { OnboardingDocAction, OnboardingFsmState, OnboardingSSEEvent, OnboardingStepData } from "jolli-common";

const log = getLog(import.meta);

/**
 * Result of an FSM transition.
 */
export interface FsmTransitionResult {
	/** New FSM state after the transition */
	newState: OnboardingFsmState;
	/** SSE events to emit to the client */
	events: Array<OnboardingSSEEvent>;
}

/**
 * Emit a content event.
 */
function contentEvent(text: string): OnboardingSSEEvent {
	return { type: "content", content: text };
}

/**
 * Emit a tool call event.
 */
function toolCallEvent(name: string, args: Record<string, unknown> = {}): OnboardingSSEEvent {
	return {
		type: "tool_call",
		toolCall: { id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, arguments: args },
	};
}

/**
 * Emit a tool result event.
 */
function toolResultEvent(toolCallId: string, name: string, content: string, success: boolean): OnboardingSSEEvent {
	return { type: "tool_result", toolResult: { toolCallId, name, content, success } };
}

/**
 * Emit a UI action event.
 */
function _uiActionEvent(
	type: OnboardingSSEEvent["uiAction"] extends { type: infer T } | undefined ? T : never,
	message?: string,
): OnboardingSSEEvent {
	return { type: "ui_action", uiAction: { type, message } };
}

/**
 * Execute a tool and emit the corresponding tool_call and tool_result SSE events.
 * If the tool returns a uiAction, a ui_action event is also emitted.
 */
async function executeTool(
	toolName: string,
	execute: () => Promise<OnboardingToolExecutionResult> | OnboardingToolExecutionResult,
	events: Array<OnboardingSSEEvent>,
	args?: Record<string, unknown>,
): Promise<OnboardingToolExecutionResult> {
	const tc = toolCallEvent(toolName, args);
	events.push(tc);

	const result = await execute();
	events.push(toolResultEvent(tc.toolCall?.id ?? "", toolName, result.content, result.success));

	if (result.uiAction) {
		events.push({ type: "ui_action", uiAction: result.uiAction });
	}

	return result;
}

/**
 * Derive the FSM state from existing stepData for backward compatibility
 * with users who started onboarding before the FSM was introduced.
 */
export function deriveFsmStateFromStepData(stepData: OnboardingStepData): OnboardingFsmState {
	// If fsmState is already set, use it
	if (stepData.fsmState) {
		return stepData.fsmState;
	}

	// Derive from existing step data
	if (stepData.syncTriggered) {
		return "SYNC_CONFIRMED";
	}
	if (stepData.importedArticles && stepData.importedArticles.length > 0) {
		return "SYNC_EXPLAIN";
	}
	if (stepData.discoveredFiles && stepData.discoveredFiles.length > 0) {
		return "DOC_ACTION_PROMPT";
	}
	if (stepData.connectedIntegration) {
		return "REPO_SCAN_PROMPT";
	}

	return "WELCOME";
}

/**
 * Process an FSM transition.
 *
 * Given the current state, user intent, and tool context, determines:
 * 1. What to do (call tools, emit messages)
 * 2. What state to transition to
 *
 * For "auto" states, the transition function calls tool handlers directly
 * and chains to the next state without waiting for user input.
 */
// biome-ignore lint/suspicious/useAwait: delegates to async state handlers via switch
export async function transition(
	currentState: OnboardingFsmState,
	intent: OnboardingIntent,
	context: OnboardingToolContext,
): Promise<FsmTransitionResult> {
	const events: Array<OnboardingSSEEvent> = [];

	// Handle global intents first — except in free-text states where the user
	// types arbitrary input (e.g., a repo name) that the intent classifier
	// may misclassify as off_topic, status, or help.
	const isFreeTextState = currentState === "GITHUB_REPO_PROMPT";
	if (!isFreeTextState) {
		// Treat "goodbye" as "skip" in states that don't handle it specifically
		// (SYNC_CONFIRMED handles it to complete onboarding gracefully)
		if (intent === "goodbye" && currentState !== "SYNC_CONFIRMED") {
			return transition(currentState, "skip", context);
		}
		if (intent === "off_topic") {
			events.push(contentEvent(offTopicRedirect(currentState)));
			return { newState: currentState, events };
		}
		if (intent === "status") {
			events.push(contentEvent(statusMessage(currentState, context.stepData)));
			return { newState: currentState, events };
		}
		if (intent === "help") {
			events.push(contentEvent(helpMessage(currentState)));
			return { newState: currentState, events };
		}
	}

	// State-specific transitions
	switch (currentState) {
		case "WELCOME":
			return handleWelcome(intent, context, events);

		case "GITHUB_CHECK":
			return handleGitHubCheck(context, events);

		case "GITHUB_INSTALL_PROMPT":
			return handleGitHubInstallPrompt(intent, context, events);

		case "GITHUB_INSTALLING":
			return handleGitHubInstalling(intent, context, events);

		case "GITHUB_REPO_PROMPT":
			return handleGitHubRepoPrompt(intent, context, events);

		case "GITHUB_REPO_SELECTING":
			return handleGitHubRepoSelecting(intent, context, events);

		case "REPO_SCAN_PROMPT":
			return handleRepoScanPrompt(intent, context, events);

		case "REPO_SCANNING":
			return handleRepoScanning(context, events);

		case "DOC_ACTION_PROMPT":
			return handleDocActionPrompt(intent, context, events);

		case "SPACE_CREATING":
			return handleSpaceCreating(context, events);

		case "IMPORTING":
			return handleImporting(context, events);

		case "GAP_ANALYSIS_PROMPT":
			return handleGapAnalysisPrompt(intent, context, events);

		case "GAP_ANALYZING":
			return handleGapAnalyzing(context, events);

		case "GENERATE_PROMPT":
			return handleGeneratePrompt(intent, context, events);

		case "GENERATING":
			return handleGenerating(context, events);

		case "SYNC_EXPLAIN":
			return handleSyncExplain(intent, context, events);

		case "SYNC_WAITING":
			return handleSyncWaiting(intent, context, events);

		case "SYNC_CHECKING":
			return handleSyncChecking(context, events);

		case "SYNC_CONFIRMED":
			return handleSyncConfirmed(intent, context, events);

		case "COMPLETING":
			return handleCompleting(context, events);

		case "COMPLETED":
			events.push(contentEvent("Onboarding is already complete! You can explore Jolli on your own."));
			return { newState: "COMPLETED", events };

		default:
			log.warn("Unknown FSM state: %s", currentState);
			events.push(contentEvent(welcomeMessage()));
			return { newState: "WELCOME", events };
	}
}

// === State Handlers ===

// biome-ignore lint/suspicious/useAwait: chains to async handleGitHubCheck/executeSkip
async function handleWelcome(
	intent: OnboardingIntent,
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	if (intent === "skip") {
		return executeSkip(context, events);
	}

	if (intent === "confirm") {
		// Transition to GITHUB_CHECK (auto state)
		return handleGitHubCheck(context, events);
	}

	// Default: show welcome message
	events.push(contentEvent(welcomeMessage()));
	return { newState: "WELCOME", events };
}

async function handleGitHubCheck(
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	// Auto state: call check_github_status (pure read-only query)
	const result = await executeTool("check_github_status", () => checkGitHubStatusTool.handler({}, context), events);

	if (!result.success) {
		events.push(contentEvent("There was an issue checking your GitHub status. Would you like to try connecting?"));
		return { newState: "GITHUB_INSTALL_PROMPT", events };
	}

	// Parse the status and handle each case — all state persistence happens here in the FSM
	try {
		const status = JSON.parse(result.content);

		if (status.status === "connected") {
			// Already connected — persist connection info and advance step
			await context.updateStepData({
				connectedIntegration: status.integrationId,
				connectedRepo: status.repo,
				connectedInstallationId: status.installationId,
			});
			await context.advanceStep("scan_repos");

			events.push(contentEvent(githubAlreadyConnected(status.repo, status.branch ?? "main")));
			return { newState: "REPO_SCAN_PROMPT", events };
		}

		if (status.status === "installed") {
			// App installed but no repo connected — collect and persist available repos
			const availableRepos: Array<string> = [];
			if (Array.isArray(status.installations)) {
				for (const inst of status.installations) {
					if (Array.isArray(inst.repos)) {
						for (const repo of inst.repos) {
							availableRepos.push(repo);
						}
					}
				}
			}
			await context.updateStepData({ availableRepos });
			events.push(contentEvent(githubRepoPrompt(availableRepos)));
			return { newState: "GITHUB_REPO_PROMPT", events };
		}

		// "not_installed" — no GitHub App at all
		events.push(contentEvent(githubInstallPrompt()));
		return { newState: "GITHUB_INSTALL_PROMPT", events };
	} catch {
		events.push(contentEvent(githubInstallPrompt()));
		return { newState: "GITHUB_INSTALL_PROMPT", events };
	}
}

async function handleGitHubInstallPrompt(
	intent: OnboardingIntent,
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	if (intent === "skip") {
		events.push(contentEvent(repoScanPrompt(context.stepData.connectedRepo ?? "your repository")));
		return { newState: "REPO_SCAN_PROMPT", events };
	}

	if (intent === "confirm") {
		// Open GitHub App installation
		await executeTool("install_github_app", () => installGitHubAppTool.handler({}, context), events);

		events.push(contentEvent(githubWaiting("install")));
		return { newState: "GITHUB_INSTALLING", events };
	}

	events.push(contentEvent(githubInstallPrompt()));
	return { newState: "GITHUB_INSTALL_PROMPT", events };
}

// biome-ignore lint/suspicious/useAwait: chains to async handleGitHubCheck
async function handleGitHubInstalling(
	intent: OnboardingIntent,
	_context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	if (intent === "github_done" || intent === "confirm") {
		// Re-check GitHub status
		return handleGitHubCheck(_context, events);
	}

	if (intent === "skip") {
		return { newState: "REPO_SCAN_PROMPT", events };
	}

	events.push(contentEvent(githubWaiting("install")));
	return { newState: "GITHUB_INSTALLING", events };
}

async function handleGitHubRepoPrompt(
	intent: OnboardingIntent,
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	const availableRepos = context.stepData.availableRepos ?? [];

	if (intent === "skip") {
		events.push(contentEvent(repoScanPrompt(context.stepData.connectedRepo ?? "your repository")));
		return { newState: "REPO_SCAN_PROMPT", events };
	}

	// Try repo matching first — the user may have typed a repo name that the
	// intent classifier misread as confirm, status, help, off_topic, etc.
	if (availableRepos.length > 0 && context.userMessage) {
		const matched = matchRepoName(context.userMessage, availableRepos);
		if (matched) {
			return selectRepo(matched, context, events);
		}
	}

	// "yes" with exactly 1 repo → auto-select it
	if (intent === "confirm" && availableRepos.length === 1) {
		return selectRepo(availableRepos[0], context, events);
	}

	// "yes" with multiple repos → re-prompt asking user to type a name
	if (intent === "confirm" && availableRepos.length > 1) {
		events.push(contentEvent(githubRepoPrompt(availableRepos)));
		return { newState: "GITHUB_REPO_PROMPT", events };
	}

	// "yes" with no known repos → fall back to modal dialog
	if (intent === "confirm") {
		await executeTool("connect_github_repo", () => connectGitHubRepoTool.handler({}, context), events);

		events.push(contentEvent(githubWaiting("select")));
		return { newState: "GITHUB_REPO_SELECTING", events };
	}

	// Unrecognized input that didn't match any repo — show error with available repos
	if (availableRepos.length > 0 && context.userMessage) {
		events.push(contentEvent(repoNotFound(context.userMessage, availableRepos)));
		return { newState: "GITHUB_REPO_PROMPT", events };
	}

	events.push(contentEvent(githubRepoPrompt(availableRepos)));
	return { newState: "GITHUB_REPO_PROMPT", events };
}

// biome-ignore lint/suspicious/useAwait: chains to async handleGitHubCheck
async function handleGitHubRepoSelecting(
	intent: OnboardingIntent,
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	if (intent === "github_done" || intent === "confirm") {
		return handleGitHubCheck(context, events);
	}

	if (intent === "skip") {
		return { newState: "REPO_SCAN_PROMPT", events };
	}

	events.push(contentEvent(githubWaiting("select")));
	return { newState: "GITHUB_REPO_SELECTING", events };
}

/**
 * Select a repo via chat: create integration, update stepData, and advance to REPO_SCAN_PROMPT.
 */
async function selectRepo(
	repoFullName: string,
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	const tc = toolCallEvent("connect_repo_direct", { repository: repoFullName });
	events.push(tc);

	const result = await connectRepoDirectly(repoFullName, context);
	if (!result) {
		events.push(
			toolResultEvent(
				tc.toolCall?.id ?? "",
				"connect_repo_direct",
				"Failed to find installation for repo",
				false,
			),
		);
		events.push(
			contentEvent(`I couldn't connect **${repoFullName}** — no matching GitHub installation was found.`),
		);
		return { newState: "GITHUB_REPO_PROMPT", events };
	}

	events.push(
		toolResultEvent(
			tc.toolCall?.id ?? "",
			"connect_repo_direct",
			`Connected to ${repoFullName} (integration=${result.integrationId})`,
			true,
		),
	);

	await context.updateStepData({
		connectedIntegration: result.integrationId,
		connectedRepo: repoFullName,
		connectedInstallationId: result.installationId,
	});
	await context.advanceStep("scan_repos");

	events.push(contentEvent(repoScanPrompt(repoFullName)));
	return { newState: "REPO_SCAN_PROMPT", events };
}

// biome-ignore lint/suspicious/useAwait: chains to async handleRepoScanning/handleGitHubCheck
async function handleRepoScanPrompt(
	intent: OnboardingIntent,
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	if (intent === "skip") {
		events.push(contentEvent(syncExplanation()));
		return { newState: "SYNC_EXPLAIN", events };
	}

	if (intent === "change_github") {
		events.push(contentEvent(changeGithubMessage()));
		return handleGitHubCheck(context, events);
	}

	if (intent === "confirm") {
		return handleRepoScanning(context, events);
	}

	const repo = context.stepData.connectedRepo ?? "your repository";
	events.push(contentEvent(repoScanPrompt(repo)));
	return { newState: "REPO_SCAN_PROMPT", events };
}

async function handleRepoScanning(
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	const repo = context.stepData.connectedRepo;
	if (!repo) {
		events.push(contentEvent("No repository is connected yet. Let me check your GitHub status."));
		return handleGitHubCheck(context, events);
	}

	// Auto state: call scan_repository
	await executeTool("scan_repository", () => scanRepositoryTool.handler({ repository: repo }, context), events, {
		repository: repo,
	});

	// Refresh step data after scan
	const discoveredFiles = context.stepData.discoveredFiles ?? [];

	if (discoveredFiles.length === 0) {
		events.push(contentEvent(docActionPromptNoFiles()));
	} else {
		events.push(contentEvent(scanResults(discoveredFiles.length, repo, discoveredFiles)));
	}

	return { newState: "DOC_ACTION_PROMPT", events };
}

async function handleDocActionPrompt(
	intent: OnboardingIntent,
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	if (intent === "skip") {
		events.push(contentEvent(syncExplanation()));
		return { newState: "SYNC_EXPLAIN", events };
	}

	if (intent === "change_github") {
		events.push(contentEvent(changeGithubMessage()));
		return handleGitHubCheck(context, events);
	}

	let docAction: OnboardingDocAction | undefined;

	if (intent === "import") {
		docAction = "import";
	} else if (intent === "generate") {
		docAction = "generate";
	} else if (intent === "both") {
		docAction = "both";
	} else if (intent === "confirm") {
		// Default to "both" if files exist, "generate" otherwise
		const hasFiles = (context.stepData.discoveredFiles ?? []).length > 0;
		docAction = hasFiles ? "both" : "generate";
	}

	if (docAction) {
		await context.updateStepData({ docAction });
		// Update local context so subsequent reads see the new value
		context.stepData.docAction = docAction;
		return handleSpaceCreating(context, events);
	}

	// Show prompt again
	const repo = context.stepData.connectedRepo ?? "your repository";
	const files = context.stepData.discoveredFiles ?? [];
	if (files.length === 0) {
		events.push(contentEvent(docActionPromptNoFiles()));
	} else {
		events.push(contentEvent(scanResults(files.length, repo, files)));
	}
	return { newState: "DOC_ACTION_PROMPT", events };
}

async function handleSpaceCreating(
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	const repo = context.stepData.connectedRepo;
	if (!repo) {
		events.push(contentEvent("No repository connected. Let me check your GitHub status."));
		return handleGitHubCheck(context, events);
	}

	// Auto state: call get_or_create_space
	const result = await executeTool(
		"get_or_create_space",
		() => getOrCreateSpaceTool.handler({ repository: repo }, context),
		events,
		{ repository: repo },
	);

	if (result.success) {
		try {
			const spaceResult = JSON.parse(result.content);
			events.push(contentEvent(spaceCreated(spaceResult.name ?? repo, spaceResult.created ?? false)));
			// Notify the frontend to refresh sidebar spaces/favorites
			events.push({
				type: "ui_action",
				uiAction: { type: "space_created", message: spaceResult.name ?? repo },
			});
		} catch {
			events.push(contentEvent(spaceCreated(repo, true)));
			events.push({ type: "ui_action", uiAction: { type: "space_created", message: repo } });
		}
	}

	// Return the next auto-state; the agent-level loop will process it,
	// yielding space-creation events to the client before starting the import.
	const docAction = context.stepData.docAction;
	if (docAction === "import" || docAction === "both") {
		return { newState: "IMPORTING", events };
	}

	// Generate only
	const hasGaps = (context.stepData.gapAnalysisResults ?? []).length > 0;
	events.push(contentEvent(generatePrompt(hasGaps)));
	return { newState: "GENERATE_PROMPT", events };
}

async function handleImporting(
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	log.info(
		"handleImporting: files=%d spaceId=%s repo=%s",
		(context.stepData.discoveredFiles ?? []).length,
		context.stepData.spaceId ?? "none",
		context.stepData.connectedRepo ?? "none",
	);

	// Auto state: call import_all_markdown
	const result = await executeTool("import_all_markdown", () => importAllMarkdownTool.handler({}, context), events);

	// If the tool returned an error, surface it instead of showing "0 imported"
	if (!result.success) {
		log.warn("Import tool failed: %s", result.content);
		events.push(contentEvent(importError(result.content)));
		return { newState: "GAP_ANALYSIS_PROMPT", events };
	}

	// Count results from content
	const importedMatch = result.content.match(/Imported:\s*(\d+)/);
	const skippedMatch = result.content.match(/Skipped.*?:\s*(\d+)/g);
	const failedMatch = result.content.match(/Failed:\s*(\d+)/);
	const importedCount = importedMatch ? Number.parseInt(importedMatch[1], 10) : 0;
	const skippedCount = skippedMatch ? skippedMatch.length : 0;
	const failedCount = failedMatch ? Number.parseInt(failedMatch[1], 10) : 0;

	events.push(contentEvent(importComplete(importedCount, skippedCount, failedCount)));

	// Snapshot the current HEAD commit SHA for later sync detection via API
	await snapshotCommitSha(context);

	// Move to gap analysis prompt
	return { newState: "GAP_ANALYSIS_PROMPT", events };
}

// biome-ignore lint/suspicious/useAwait: chains to async handleGapAnalyzing/handleGitHubCheck/handleRepoScanning
async function handleGapAnalysisPrompt(
	intent: OnboardingIntent,
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	if (intent === "skip") {
		// Branch based on docAction
		if (context.stepData.docAction === "both") {
			const hasGaps = (context.stepData.gapAnalysisResults ?? []).length > 0;
			events.push(contentEvent(generatePrompt(hasGaps)));
			return { newState: "GENERATE_PROMPT", events };
		}
		events.push(contentEvent(syncExplanation()));
		return { newState: "SYNC_EXPLAIN", events };
	}

	if (intent === "change_github") {
		events.push(contentEvent(changeGithubMessage()));
		return handleGitHubCheck(context, events);
	}

	if (intent === "reimport") {
		events.push(contentEvent(reimportMessage()));
		return handleRepoScanning(context, events);
	}

	if (intent === "confirm") {
		return handleGapAnalyzing(context, events);
	}

	events.push(contentEvent(gapAnalysisPrompt()));
	return { newState: "GAP_ANALYSIS_PROMPT", events };
}

async function handleGapAnalyzing(
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	// Auto state: run gap analysis
	await executeTool("gap_analysis", () => executeGapAnalysis(context), events);

	// Show results
	const gaps = context.stepData.gapAnalysisResults ?? [];
	events.push(contentEvent(gapAnalysisResults(gaps)));

	// Branch based on docAction
	if (context.stepData.docAction === "both") {
		events.push(contentEvent(generatePrompt(gaps.length > 0)));
		return { newState: "GENERATE_PROMPT", events };
	}

	events.push(contentEvent(syncExplanation()));
	return { newState: "SYNC_EXPLAIN", events };
}

// biome-ignore lint/suspicious/useAwait: chains to async handleGenerating/handleGitHubCheck/handleRepoScanning
async function handleGeneratePrompt(
	intent: OnboardingIntent,
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	if (intent === "skip") {
		events.push(contentEvent(syncExplanation()));
		return { newState: "SYNC_EXPLAIN", events };
	}

	if (intent === "change_github") {
		events.push(contentEvent(changeGithubMessage()));
		return handleGitHubCheck(context, events);
	}

	if (intent === "reimport") {
		events.push(contentEvent(reimportMessage()));
		return handleRepoScanning(context, events);
	}

	if (intent === "confirm") {
		return handleGenerating(context, events);
	}

	const hasGaps = (context.stepData.gapAnalysisResults ?? []).length > 0;
	events.push(contentEvent(generatePrompt(hasGaps)));
	return { newState: "GENERATE_PROMPT", events };
}

async function handleGenerating(
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	// Auto state: run doc generation
	await executeTool("generate_from_code", () => executeGenerateFromCode(context), events);

	const generatedCount = context.stepData.generatedArticles?.length ?? 0;
	events.push(contentEvent(generateComplete(generatedCount)));

	events.push(contentEvent(syncExplanation()));
	return { newState: "SYNC_EXPLAIN", events };
}

/**
 * Check for sync via webhook flag and GitHub API.
 * Returns a SYNC_CONFIRMED transition if sync is detected, or null otherwise.
 */
async function detectSync(
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult | null> {
	if (context.stepData.syncTriggered) {
		events.push(contentEvent(syncDetected()));
		return { newState: "SYNC_CONFIRMED", events };
	}

	const detected = await checkSyncViaApi(context);
	if (detected) {
		await context.updateStepData({ syncTriggered: true, lastSyncTime: new Date().toISOString() });
		events.push(contentEvent(syncDetected()));
		return { newState: "SYNC_CONFIRMED", events };
	}

	return null;
}

async function handleSyncExplain(
	intent: OnboardingIntent,
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	if (intent === "skip") {
		return handleCompleting(context, events);
	}

	if (intent === "change_github") {
		events.push(contentEvent(changeGithubMessage()));
		return handleGitHubCheck(context, events);
	}

	if (intent === "reimport") {
		events.push(contentEvent(reimportMessage()));
		return handleRepoScanning(context, events);
	}

	if (intent === "confirm" || intent === "check") {
		// Snapshot commit SHA if not already done (e.g., user skipped import)
		if (!context.stepData.lastKnownCommitSha) {
			await snapshotCommitSha(context);
		}

		const syncResult = await detectSync(context, events);
		if (syncResult) {
			return syncResult;
		}

		events.push(contentEvent(syncWaiting()));
		return { newState: "SYNC_WAITING", events };
	}

	events.push(contentEvent(syncExplanation()));
	return { newState: "SYNC_EXPLAIN", events };
}

// biome-ignore lint/suspicious/useAwait: chains to async handleCompleting/handleSyncChecking/handleGitHubCheck/handleRepoScanning
async function handleSyncWaiting(
	intent: OnboardingIntent,
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	if (intent === "skip") {
		return handleCompleting(context, events);
	}

	if (intent === "change_github") {
		events.push(contentEvent(changeGithubMessage()));
		return handleGitHubCheck(context, events);
	}

	if (intent === "reimport") {
		events.push(contentEvent(reimportMessage()));
		return handleRepoScanning(context, events);
	}

	if (intent === "check" || intent === "confirm") {
		return handleSyncChecking(context, events);
	}

	events.push(contentEvent(syncWaiting()));
	return { newState: "SYNC_WAITING", events };
}

async function handleSyncChecking(
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	const syncResult = await detectSync(context, events);
	if (syncResult) {
		return syncResult;
	}

	events.push(contentEvent(syncNotDetected()));
	return { newState: "SYNC_WAITING", events };
}

/**
 * Handle SYNC_CONFIRMED state — sync is verified, but the conversation stays open.
 * The user can ask questions, get help, or explore Jolli features. Only transitions
 * to COMPLETING when the user says "goodbye", "skip", or explicitly ends the chat.
 */
// biome-ignore lint/suspicious/useAwait: chains to async handleCompleting/handleGitHubCheck/handleRepoScanning
async function handleSyncConfirmed(
	intent: OnboardingIntent,
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	if (intent === "goodbye" || intent === "skip") {
		return handleCompleting(context, events);
	}

	if (intent === "change_github") {
		events.push(contentEvent(changeGithubMessage()));
		return handleGitHubCheck(context, events);
	}

	if (intent === "reimport") {
		events.push(contentEvent(reimportMessage()));
		return handleRepoScanning(context, events);
	}

	// For any other intent (help, status, off_topic, confirm, etc.), stay in this state
	// and let the global handlers provide contextual responses
	events.push(contentEvent(helpMessage("SYNC_CONFIRMED")));
	return { newState: "SYNC_CONFIRMED", events };
}

/**
 * Snapshot the current HEAD commit SHA after import for later comparison.
 * Failures are non-fatal (sync detection falls back to webhook-only).
 */
async function snapshotCommitSha(context: OnboardingToolContext): Promise<void> {
	try {
		const integration = await getActiveGithubIntegration(context);
		if (!integration) {
			return;
		}
		const { repo, branch } = integration.metadata;
		const accessToken = await getAccessTokenForIntegration(integration.metadata);
		if (!accessToken || !repo) {
			return;
		}
		const [owner, repoName] = repo.split("/");
		if (!owner || !repoName) {
			return;
		}
		const sha = await fetchLatestCommitSha(accessToken, owner, repoName, branch ?? "main");
		if (sha) {
			await context.updateStepData({ lastKnownCommitSha: sha });
			log.info("Snapshotted commit SHA %s for sync detection (repo=%s)", sha.substring(0, 8), repo);
		}
	} catch (error) {
		log.warn(error, "Failed to snapshot commit SHA for sync detection");
	}
}

/**
 * Check for new commits via the GitHub API by comparing HEAD with the stored SHA.
 * Returns true if new commits are detected, false otherwise.
 */
async function checkSyncViaApi(context: OnboardingToolContext): Promise<boolean> {
	const { lastKnownCommitSha, connectedRepo } = context.stepData;
	if (!lastKnownCommitSha || !connectedRepo) {
		log.debug("No commit SHA or repo for API-based sync check");
		return false;
	}

	try {
		const integration = await getActiveGithubIntegration(context);
		if (!integration) {
			return false;
		}
		const accessToken = await getAccessTokenForIntegration(integration.metadata);
		if (!accessToken) {
			return false;
		}
		const [owner, repoName] = connectedRepo.split("/");
		if (!owner || !repoName) {
			return false;
		}
		const branch = integration.metadata.branch ?? "main";
		const currentSha = await fetchLatestCommitSha(accessToken, owner, repoName, branch);
		if (!currentSha) {
			return false;
		}

		if (currentSha !== lastKnownCommitSha) {
			log.info(
				"Sync detected via API: HEAD changed %s → %s (repo=%s)",
				lastKnownCommitSha.substring(0, 8),
				currentSha.substring(0, 8),
				connectedRepo,
			);
			return true;
		}

		log.debug("No new commits detected via API for repo %s", connectedRepo);
		return false;
	} catch (error) {
		log.warn(error, "Failed to check sync via GitHub API");
		return false;
	}
}

async function handleCompleting(
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	// Auto state: call complete_onboarding
	const result = await executeTool("complete_onboarding", () => completeOnboardingTool.handler({}, context), events);

	if (!result.success) {
		// If completion fails (e.g., no articles), skip instead
		log.info("Onboarding completion validation failed, using skip: %s", result.content);
		await context.skipOnboarding();
	}

	events.push(contentEvent(completionSummary(context.stepData)));
	return { newState: "COMPLETED", events };
}

/**
 * Execute skip onboarding flow.
 */
async function executeSkip(
	context: OnboardingToolContext,
	events: Array<OnboardingSSEEvent>,
): Promise<FsmTransitionResult> {
	const result = await executeTool("skip_onboarding", () => skipOnboardingTool.handler({}, context), events);

	events.push(contentEvent(result.content));
	return { newState: "COMPLETED", events };
}
