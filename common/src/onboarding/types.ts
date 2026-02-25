/**
 * Onboarding Types - Shared types for first-login onboarding feature.
 *
 * These types are used by both the backend API and frontend UI to maintain
 * type consistency across the stack.
 */

/**
 * Onboarding status values.
 */
export type OnboardingStatus = "not_started" | "in_progress" | "completed" | "skipped";

/**
 * Job status values for onboarding jobs panel.
 */
export type OnboardingJobStatus = "running" | "queued" | "completed" | "failed";

/**
 * Icon types for onboarding jobs.
 */
export type OnboardingJobIcon = "document" | "sync" | "analysis" | "import";

/**
 * Represents a job displayed in the onboarding jobs panel.
 */
export interface OnboardingJob {
	/** Unique identifier for the job */
	id: string;
	/** Job title displayed in the panel */
	title: string;
	/** Optional subtitle with additional details */
	subtitle?: string | undefined;
	/** Current status of the job */
	status: OnboardingJobStatus;
	/** Progress percentage (0-100) for running jobs */
	progress?: number | undefined;
	/** Icon type for the job */
	icon?: OnboardingJobIcon | undefined;
}

/**
 * Action button that can appear in chat messages.
 */
export interface OnboardingChatAction {
	/** Display label for the button */
	label: string;
	/** Action identifier (e.g., "import_url", "upload_file", "skip") */
	action: string;
}

/**
 * Onboarding step identifiers.
 */
export type OnboardingStep = "welcome" | "connect_github" | "scan_repos" | "import_docs" | "complete";

/**
 * User's onboarding goals selected during welcome step.
 */
export interface OnboardingGoals {
	/** User wants to import existing markdown documentation */
	importDocs?: boolean | undefined;
	/** User wants to generate new documentation */
	generateDocs?: boolean | undefined;
	/** User wants to set up a doc site */
	setupDocsite?: boolean | undefined;
}

/**
 * Completion status for the 3 onboarding jobs.
 * Each job is binary: 0% (not done) or 100% (done).
 */
export interface OnboardingJobsStatus {
	/** Job 1: GitHub connected (has active integration) */
	githubConnected: boolean;
	/** Job 2: All documents imported (all discovered .md files imported) */
	allDocsImported: boolean;
	/** Job 3: Sync tested (at least one webhook-triggered update) */
	syncTested: boolean;
}

/**
 * FSM states for the onboarding flow.
 */
export type OnboardingFsmState =
	// Welcome
	| "WELCOME"

	// Job 1: Connect GitHub
	| "GITHUB_CHECK"
	| "GITHUB_INSTALL_PROMPT"
	| "GITHUB_INSTALLING"
	| "GITHUB_REPO_PROMPT"
	| "GITHUB_REPO_SELECTING"

	// Job 2: Scan & Choose Doc Action
	| "REPO_SCAN_PROMPT"
	| "REPO_SCANNING"
	| "DOC_ACTION_PROMPT"
	| "SPACE_CREATING"

	// Job 2a: Import Path
	| "IMPORTING"

	// Job 2b: Gap Analysis
	| "GAP_ANALYSIS_PROMPT"
	| "GAP_ANALYZING"

	// Job 2c: Generate Path
	| "GENERATE_PROMPT"
	| "GENERATING"

	// Job 3: Test Auto-Sync
	| "SYNC_EXPLAIN"
	| "SYNC_WAITING"
	| "SYNC_CHECKING"
	| "SYNC_CONFIRMED"

	// Completion
	| "COMPLETING"
	| "COMPLETED";

/**
 * User's chosen doc action at DOC_ACTION_PROMPT.
 */
export type OnboardingDocAction = "import" | "generate" | "both";

/**
 * Result from gap analysis.
 */
export interface OnboardingGapAnalysisResult {
	/** Short title for the gap */
	title: string;
	/** Brief explanation of what documentation is missing */
	description: string;
	/** Priority level */
	severity: "high" | "medium" | "low";
}

/**
 * Data associated with specific onboarding steps.
 */
export interface OnboardingStepData {
	// === FSM State ===
	/** Current FSM state */
	fsmState?: OnboardingFsmState | undefined;
	/** User's chosen doc action at DOC_ACTION_PROMPT */
	docAction?: OnboardingDocAction | undefined;

	// === Job 1: Connect GitHub ===
	/** Connected GitHub integration ID */
	connectedIntegration?: number | undefined;
	/** Connected GitHub repository (e.g., "acme/docs") */
	connectedRepo?: string | undefined;
	/** Connected GitHub installation ID */
	connectedInstallationId?: number | undefined;
	/** Available GitHub repositories from installed apps (for chat-based selection) */
	availableRepos?: Array<string> | undefined;

	// === Job 2: Import All Documents ===
	/** List of discovered markdown files from scan */
	discoveredFiles?: Array<string> | undefined;
	/** List of imported article JRNs */
	importedArticles?: Array<string> | undefined;
	/** Number of generated articles */
	generatedCount?: number | undefined;
	/** Space ID for imported articles */
	spaceId?: number | undefined;

	// === Job 2b: Gap Analysis ===
	/** Results from gap analysis */
	gapAnalysisResults?: Array<OnboardingGapAnalysisResult> | undefined;
	/** Draft ID for gap analysis output */
	gapAnalysisDraftId?: number | undefined;

	// === Job 2c: Generated Articles ===
	/** List of generated article JRNs */
	generatedArticles?: Array<string> | undefined;

	// === Job 3: Test Auto-Sync ===
	/** Whether a sync event has been triggered (webhook update) */
	syncTriggered?: boolean | undefined;
	/** JRN of the article that was synced */
	syncedArticleJrn?: string | undefined;
	/** Timestamp of the last sync event */
	lastSyncTime?: string | undefined;
	/** Commit SHA at import time, used for API-based sync detection */
	lastKnownCommitSha?: string | undefined;

	// === Space Management ===
	/** Name of the space being used for imports */
	spaceName?: string | undefined;
}

/**
 * Complete onboarding state as stored in the database and returned by API.
 */
export interface OnboardingState {
	/** Unique identifier */
	id: number;
	/** User ID (from active_users table) */
	userId: number;
	/** Current onboarding step */
	currentStep: OnboardingStep;
	/** Overall onboarding status */
	status: OnboardingStatus;
	/** User's selected goals */
	goals: OnboardingGoals;
	/** Step-specific data */
	stepData: OnboardingStepData;
	/** Array of completed step names */
	completedSteps: Array<OnboardingStep>;
	/** When onboarding was skipped (if skipped) */
	skippedAt?: Date | undefined;
	/** When onboarding was completed (if completed) */
	completedAt?: Date | undefined;
	/** When the record was created */
	createdAt: Date;
	/** When the record was last updated */
	updatedAt: Date;
}

/**
 * Input for creating a new onboarding record.
 */
export type NewOnboardingState = Omit<OnboardingState, "id" | "createdAt" | "updatedAt">;

/**
 * Chat message in the onboarding conversation.
 */
export interface OnboardingChatMessage {
	/** Message role - user or assistant */
	role: "user" | "assistant";
	/** Message content */
	content: string;
	/** Tool calls made by the assistant (if any) */
	toolCalls?: Array<OnboardingToolCall> | undefined;
	/** Tool results (if this is a tool response) */
	toolResults?: Array<OnboardingToolResult> | undefined;
}

/**
 * Tool call made by the onboarding agent.
 */
export interface OnboardingToolCall {
	/** Unique ID for this tool call */
	id: string;
	/** Tool name */
	name: string;
	/** Tool arguments as JSON object */
	arguments: Record<string, unknown>;
}

/**
 * Result of a tool call.
 */
export interface OnboardingToolResult {
	/** ID of the tool call this is a response to */
	toolCallId: string;
	/** Tool name */
	name: string;
	/** Result content */
	content: string;
	/** Whether the tool call succeeded */
	success: boolean;
	/** Optional UI action to trigger */
	uiAction?: OnboardingUIAction | undefined;
}

/**
 * Request body for chat endpoint.
 */
export interface OnboardingChatRequest {
	/** User's message */
	message: string;
	/** Previous messages in the conversation (for context) */
	history?: Array<OnboardingChatMessage> | undefined;
}

/**
 * SSE event types for onboarding chat stream.
 */
export type OnboardingSSEEventType =
	| "content"
	| "tool_call"
	| "tool_result"
	| "ui_action"
	| "fsm_transition"
	| "done"
	| "error";

/**
 * UI action types that can be triggered from the chat.
 */
export type OnboardingUIActionType =
	| "open_github_install" // Open GitHub App installation page (no existing installations)
	| "open_github_repo_select" // Open repo selection UI (app installed, need to select repo)
	| "open_github_connect" // Auto-detect what to show (queries GitHub API)
	| "navigate"
	| "import_started"
	| "import_completed"
	| "import_failed"
	| "review_import_changes" // Navigate to draft with pending changes for review
	| "open_gap_analysis" // Gap analysis results are available
	| "generation_completed" // Doc generation from code completed
	| "space_created"; // A documentation space was created (sidebar should refresh)

/**
 * UI action to be triggered in the frontend.
 */
export interface OnboardingUIAction {
	/** Type of UI action to perform */
	type: OnboardingUIActionType;
	/** Optional URL for navigation actions */
	url?: string | undefined;
	/** Optional message to display alongside the action */
	message?: string | undefined;
	/** Optional job ID for tracking */
	jobId?: string | undefined;
	/** Optional file path being imported */
	filePath?: string | undefined;
	/** Optional title of the imported article */
	title?: string | undefined;
	/** Optional draft ID for review_import_changes action */
	draftId?: number | undefined;
	/** Optional article JRN for review_import_changes action */
	articleJrn?: string | undefined;
}

/**
 * SSE event data for onboarding chat stream.
 */
export interface OnboardingSSEEvent {
	/** Event type */
	type: OnboardingSSEEventType;
	/** Content chunk (for content events) */
	content?: string | undefined;
	/** Tool call data (for tool_call events) */
	toolCall?: OnboardingToolCall | undefined;
	/** Tool result data (for tool_result events) */
	toolResult?: OnboardingToolResult | undefined;
	/** UI action to trigger (for ui_action events) */
	uiAction?: OnboardingUIAction | undefined;
	/** Updated onboarding state (for done events) */
	state?: OnboardingState | undefined;
	/** Error message (for error events) */
	error?: string | undefined;
	/** FSM transition data (for fsm_transition events) */
	fsmTransition?: OnboardingFsmTransition | undefined;
}

/**
 * FSM transition data emitted for debugging/logging.
 */
export interface OnboardingFsmTransition {
	/** State before the transition */
	from: OnboardingFsmState;
	/** State after the transition */
	to: OnboardingFsmState;
	/** Classified user intent that triggered the transition */
	intent: string;
	/** ISO timestamp of the transition */
	timestamp: string;
}

/**
 * Response for GET /api/onboarding endpoint.
 */
export interface GetOnboardingResponse {
	/** Current onboarding state, or undefined if not started */
	state: OnboardingState | undefined;
	/** Whether user needs to complete onboarding */
	needsOnboarding: boolean;
}

/**
 * Response for skip/complete endpoints.
 */
export interface OnboardingActionResponse {
	/** Whether the action succeeded */
	success: boolean;
	/** Updated onboarding state */
	state: OnboardingState;
}
