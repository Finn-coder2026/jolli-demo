/**
 * OnboardingDialog - Floating dialog for first-login onboarding flow.
 *
 * Displays a two-panel layout with Jolli Agent chat on the left
 * and a jobs panel on the right showing running/queued jobs.
 * Users can skip at any time to access the main application.
 *
 * The dialog is:
 * - Always on top of other UI elements (z-index 9999)
 * - Draggable to any position
 * - Non-blocking (users can interact with UI behind it)
 * - Only closes when explicitly clicking skip or close button
 * - Can be minimized to a small bar
 */

import { Button } from "../../components/ui/Button";
import { useClient } from "../../contexts/ClientContext";
import { useMercureSubscription } from "../../hooks/useMercureSubscription";
import { getLog } from "../../util/Logger";
import { GitHubIntegrationFlow } from "../integrations/github/GitHubIntegrationFlow";
import { OnboardingChat, type OnboardingChatHandle } from "./OnboardingChat";
import { OnboardingFsmLog } from "./OnboardingFsmLog";
import { OnboardingJobsPanel } from "./OnboardingJobsPanel";
import type {
	OnboardingFsmTransition,
	OnboardingJob,
	OnboardingState,
	OnboardingStepData,
	OnboardingToolCall,
	OnboardingToolResult,
	OnboardingUIAction,
} from "jolli-common";
import { GripHorizontal, Minus, Plus, X } from "lucide-react";
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

/**
 * Props for OnboardingPage (rendered as a dialog).
 */
export interface OnboardingPageProps {
	/** Called when onboarding is completed or skipped */
	onComplete?: () => void;
}

/** Transient job for showing "in progress" status temporarily */
interface TransientJob {
	id: string;
	title: string;
	subtitle: string;
	status: "running" | "completed" | "failed";
}

/**
 * Compute the subtitle text for job 2 (Import Documents).
 */
function computeJob2Subtitle(
	job2Complete: boolean,
	hasImports: boolean,
	hasGenerated: boolean,
	imported: Array<string>,
	generated: Array<string>,
	discovered: Array<string>,
	content: ReturnType<typeof useIntlayer<"onboarding">>,
): string {
	if (job2Complete) {
		const parts: Array<string> = [];
		if (hasImports) {
			parts.push(`${imported.length} ${content.job2Progress.value}`);
		}
		if (hasGenerated) {
			parts.push(`${generated.length} generated`);
		}
		return parts.length > 0 ? parts.join(", ") : content.job2Complete.value;
	}
	if (discovered.length > 0) {
		return `${imported.length}/${discovered.length} ${content.job2Progress.value}`;
	}
	return content.job2Pending.value;
}

/**
 * Compute the 3 main onboarding jobs from stepData.
 */
function computeMainJobs(
	stepData: OnboardingStepData | undefined,
	content: ReturnType<typeof useIntlayer<"onboarding">>,
): Array<OnboardingJob> {
	const data = stepData ?? {};

	// Job 1: Connect GitHub - complete if connectedIntegration exists
	const job1Complete = Boolean(data.connectedIntegration);
	const job1: OnboardingJob = {
		id: "job-1-github",
		title: content.job1Title.value,
		subtitle: job1Complete ? (data.connectedRepo ?? content.job1Complete.value) : content.job1Pending.value,
		status: job1Complete ? "completed" : "queued",
		icon: "sync",
	};

	// Job 2: Import & Generate Documents - complete if docs imported and/or generated
	const discovered = data.discoveredFiles ?? [];
	const imported = data.importedArticles ?? [];
	const generated = data.generatedArticles ?? [];
	const hasImports = imported.length > 0;
	const hasGenerated = generated.length > 0;
	const job2Complete = (discovered.length > 0 && imported.length >= discovered.length) || hasImports || hasGenerated;
	const job2Subtitle = computeJob2Subtitle(
		job2Complete,
		hasImports,
		hasGenerated,
		imported,
		generated,
		discovered,
		content,
	);
	const job2: OnboardingJob = {
		id: "job-2-import",
		title: content.job2Title.value,
		subtitle: job2Subtitle,
		status: job2Complete ? "completed" : "queued",
		icon: "import",
	};

	// Job 3: Test Auto-Sync - complete if syncTriggered is true
	const job3Complete = Boolean(data.syncTriggered);
	const job3: OnboardingJob = {
		id: "job-3-sync",
		title: content.job3Title.value,
		subtitle: job3Complete ? content.job3Complete.value : content.job3Pending.value,
		status: job3Complete ? "completed" : "queued",
		icon: "sync",
	};

	return [job1, job2, job3];
}

export function OnboardingPage({ onComplete }: OnboardingPageProps): ReactElement | null {
	const content = useIntlayer("onboarding");
	const client = useClient();

	const [state, setState] = useState<OnboardingState | undefined>(undefined);
	const [isLoading, setIsLoading] = useState(true);
	const [isSkipping, setIsSkipping] = useState(false);
	const [isComplete, setIsComplete] = useState(false);
	const [error, setError] = useState<string | undefined>(undefined);
	const [transientJobs, setTransientJobs] = useState<Array<TransientJob>>([]);
	const [isJobsPanelMinimized, setIsJobsPanelMinimized] = useState(false);
	const [isDialogMinimized, setIsDialogMinimized] = useState(false);
	const [showGitHubModal, setShowGitHubModal] = useState(false);
	const [gitHubModalMode, setGitHubModalMode] = useState<"install" | "select" | "auto">("auto");
	const [fsmTransitions, setFsmTransitions] = useState<Array<OnboardingFsmTransition>>([]);

	// Ref to the chat component for sending messages programmatically
	const chatRef = useRef<OnboardingChatHandle>(null);

	// Compute the 3 main jobs from state
	const mainJobs = useMemo(() => computeMainJobs(state?.stepData, content), [state?.stepData, content]);

	// Combine main jobs with transient jobs for display
	const jobs = useMemo(() => {
		// Convert transient jobs to OnboardingJob format and prepend to main jobs
		const transient: Array<OnboardingJob> = transientJobs.map(tj => ({
			id: tj.id,
			title: tj.title,
			subtitle: tj.subtitle,
			status: tj.status,
			icon: "import" as const,
		}));
		return [...transient, ...mainJobs];
	}, [mainJobs, transientJobs]);

	// Drag state - position starts as null until initialized
	const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const dragStartRef = useRef({ x: 0, y: 0 });
	const dialogRef = useRef<HTMLDivElement>(null);

	// Initialize position to bottom-right on mount
	useEffect(() => {
		if (position === null && typeof window !== "undefined") {
			setPosition({
				x: window.innerWidth - 900, // Dialog width ~850px + margin
				y: window.innerHeight - 700, // Dialog height ~650px + margin
			});
		}
	}, [position]);

	// Load initial state
	useEffect(() => {
		async function loadState(): Promise<void> {
			try {
				log.debug("OnboardingPage: Loading onboarding state...");
				const response = await client.onboarding().getState();
				log.debug(
					"OnboardingPage: Loaded state - needsOnboarding=%s, status=%s",
					response.needsOnboarding,
					response.state?.status ?? "no_state",
				);
				setState(response.state);

				// Check if already completed
				if (response.state?.status === "completed" || response.state?.status === "skipped") {
					log.debug("OnboardingPage: Already complete, closing dialog");
					setIsComplete(true);
					onComplete?.();
				}
			} catch (err) {
				log.error(err, "OnboardingPage: Failed to load onboarding state");
				// Don't block on error - allow skip
				setError(content.errorGeneric.value);
			} finally {
				setIsLoading(false);
			}
		}
		loadState();
	}, [client, content.errorGeneric.value, onComplete]);

	// Whether the FSM is currently in the SYNC_WAITING state
	const syncWaiting =
		fsmTransitions.length > 0 ? fsmTransitions[fsmTransitions.length - 1].to === "SYNC_WAITING" : false;

	// Guard against duplicate "sync detected" messages from both Mercure and polling
	const syncDetectedRef = useRef(false);

	// Reset the guard when leaving SYNC_WAITING state
	useEffect(() => {
		if (!syncWaiting) {
			syncDetectedRef.current = false;
		}
	}, [syncWaiting]);

	// Primary: Real-time sync detection via Mercure subscription
	const mercureUserId = state?.userId ?? 0;
	useMercureSubscription<{ type: string }>({
		type: "onboarding",
		id: mercureUserId,
		directSseUrl: "",
		onMessage: data => {
			if (data.type === "webhook_received" && !syncDetectedRef.current) {
				syncDetectedRef.current = true;
				chatRef.current?.sendMessage("The sync was detected!");
			}
		},
		enabled: syncWaiting && !!state?.userId,
	});

	// Fallback: Polling for environments without Mercure (10s interval)
	useEffect(() => {
		if (!syncWaiting) {
			return;
		}

		const interval = setInterval(async () => {
			if (syncDetectedRef.current) {
				clearInterval(interval);
				return;
			}
			try {
				const response = await client.onboarding().getState();
				if (response.state?.stepData?.syncTriggered && !syncDetectedRef.current) {
					syncDetectedRef.current = true;
					clearInterval(interval);
					chatRef.current?.sendMessage("The sync was detected!");
				}
			} catch {
				// Silently ignore polling errors
			}
		}, 10000);

		return () => clearInterval(interval);
	}, [syncWaiting, client]);

	/**
	 * Handle skip/close button click - skip immediately without confirmation.
	 */
	const handleSkip = useCallback(async () => {
		setIsSkipping(true);
		try {
			await client.onboarding().skip();
			setIsComplete(true);
			onComplete?.();
		} catch (err) {
			console.error("Failed to skip onboarding:", err);
			// Even if skip API fails, allow user to proceed
			onComplete?.();
		}
	}, [client, onComplete]);

	/**
	 * Handle state updates from the chat agent (e.g., after each turn completes).
	 */
	const handleStateUpdate = useCallback((newState: OnboardingState) => {
		setState(newState);
	}, []);

	/**
	 * Handle chat completion.
	 */
	const handleChatComplete = useCallback(() => {
		setIsComplete(true);
		onComplete?.();
	}, [onComplete]);

	/**
	 * Handle chat error - don't block, just show error and allow skip.
	 */
	const handleChatError = useCallback(
		(errorMsg: string) => {
			if (errorMsg === "Unauthorized") {
				setError(content.errorUnauthorized.value);
			} else if (errorMsg.includes("llm_not_configured") || errorMsg.includes("server_error")) {
				setError(content.errorLlmNotConfigured.value);
			} else {
				setError(content.errorGeneric.value);
			}
		},
		[content.errorUnauthorized.value, content.errorLlmNotConfigured.value, content.errorGeneric.value],
	);

	/**
	 * Toggle jobs panel minimized state.
	 */
	const handleToggleJobsPanel = useCallback(() => {
		setIsJobsPanelMinimized(prev => !prev);
	}, []);

	/**
	 * Toggle dialog minimized state.
	 */
	const handleToggleDialogMinimized = useCallback(() => {
		setIsDialogMinimized(prev => !prev);
	}, []);

	/**
	 * Handle UI action from the onboarding agent.
	 */
	const handleUIAction = useCallback(
		(action: OnboardingUIAction) => {
			log.debug("OnboardingPage: UI action received: %s", action.type);
			if (action.type === "open_github_install") {
				// Add a transient "installing" job
				setTransientJobs(prev => [
					{
						id: "github-install",
						title: content.jobConnectGitHub.value,
						subtitle: action.message ?? "",
						status: "running",
					},
					...prev.filter(j => j.id !== "github-install" && j.id !== "github-connect"),
				]);
				setGitHubModalMode("install");
				setShowGitHubModal(true);
			} else if (action.type === "open_github_repo_select") {
				// Add a transient "connecting" job
				setTransientJobs(prev => [
					{
						id: "github-connect",
						title: content.jobConnectGitHub.value,
						subtitle: action.message ?? "",
						status: "running",
					},
					...prev.filter(j => j.id !== "github-connect" && j.id !== "github-install"),
				]);
				setGitHubModalMode("select");
				setShowGitHubModal(true);
			} else if (action.type === "open_github_connect") {
				// Add a transient "connecting" job
				setTransientJobs(prev => [
					{
						id: "github-connect",
						title: content.jobConnectGitHub.value,
						subtitle: action.message ?? "",
						status: "running",
					},
					...prev.filter(j => j.id !== "github-connect" && j.id !== "github-install"),
				]);
				setGitHubModalMode("auto");
				setShowGitHubModal(true);
			} else if (action.type === "navigate" && action.url) {
				window.location.href = action.url;
			} else if (action.type === "review_import_changes" && action.articleJrn && action.draftId) {
				// Navigate to article draft view with pending section changes
				const encodedJrn = encodeURIComponent(action.articleJrn);
				window.location.href = `/articles/${encodedJrn}?edit=${action.draftId}`;
			} else if (action.type === "space_created") {
				// Dispatch a custom event so the sidebar can re-fetch spaces/favorites
				log.debug("Space created during onboarding: %s", action.message);
				window.dispatchEvent(new CustomEvent("jolli:spaces-changed"));
			} else if (action.type === "open_gap_analysis") {
				log.debug("Gap analysis results available: %s", action.message);
			} else if (action.type === "generation_completed") {
				log.debug("Doc generation completed: %s", action.message);
			}
		},
		[content.jobConnectGitHub.value],
	);

	/**
	 * Handle GitHub connection completion (actual success — repo connected or app installed).
	 */
	const handleGitHubComplete = useCallback(() => {
		log.debug("OnboardingPage: GitHub connection completed, mode was: %s", gitHubModalMode);
		setShowGitHubModal(false);

		// Remove the transient jobs - main job will update via state
		setTransientJobs(prev => prev.filter(j => j.id !== "github-connect" && j.id !== "github-install"));

		// Send different messages based on the mode
		if (gitHubModalMode === "install") {
			chatRef.current?.sendMessage("I've installed the GitHub App.");
		} else {
			chatRef.current?.sendMessage("I've connected my GitHub repository.");
		}
	}, [gitHubModalMode]);

	/**
	 * Handle GitHub dialog cancellation (Go Back / close without completing).
	 * Just closes the modal without sending a message to the FSM agent.
	 */
	const handleGitHubCancel = useCallback(() => {
		log.debug("OnboardingPage: GitHub dialog cancelled");
		setShowGitHubModal(false);
		setTransientJobs(prev => prev.filter(j => j.id !== "github-connect" && j.id !== "github-install"));
	}, []);

	/**
	 * Handle tool call events - add transient running jobs to panel.
	 */
	const handleToolCall = useCallback(
		(toolCall: OnboardingToolCall) => {
			log.debug("OnboardingPage: Tool call: %s", toolCall.name);

			if (toolCall.name === "import_markdown") {
				const filePath = (toolCall.arguments?.file_path as string) || "document";
				const fileName = filePath.split("/").pop() || filePath;
				setTransientJobs(prev => [
					{
						id: toolCall.id,
						title: content.jobImportingDocument.value,
						subtitle: fileName,
						status: "running",
					},
					...prev.filter(j => j.id !== toolCall.id),
				]);
			} else if (toolCall.name === "scan_repository") {
				const repo = (toolCall.arguments?.repository as string) || "repository";
				setTransientJobs(prev => [
					{
						id: toolCall.id,
						title: content.jobScanningRepository.value,
						subtitle: repo,
						status: "running",
					},
					...prev.filter(j => j.id !== toolCall.id),
				]);
			}
		},
		[content.jobImportingDocument.value, content.jobScanningRepository.value],
	);

	/**
	 * Handle tool result events - update transient job status, then remove after delay.
	 */
	const handleToolResult = useCallback(
		(toolResult: OnboardingToolResult) => {
			log.debug("OnboardingPage: Tool result: %s, success=%s", toolResult.name, toolResult.success);

			// Update the transient job status
			setTransientJobs(prev =>
				prev.map(job => {
					if (job.id === toolResult.toolCallId) {
						return {
							...job,
							status: toolResult.success ? ("completed" as const) : ("failed" as const),
							subtitle: toolResult.success
								? toolResult.name === "import_markdown"
									? content.jobImportCompleted.value
									: content.jobScanCompleted.value
								: content.jobFailed.value,
						};
					}
					return job;
				}),
			);

			// Remove transient job after a short delay so user can see completion status
			setTimeout(() => {
				setTransientJobs(prev => prev.filter(j => j.id !== toolResult.toolCallId));
			}, 2000);

			// If there's a UI action in the result, handle it
			if (toolResult.uiAction) {
				handleUIAction(toolResult.uiAction);
			}
		},
		[content.jobImportCompleted.value, content.jobScanCompleted.value, content.jobFailed.value, handleUIAction],
	);

	/**
	 * Handle FSM transition event for dev logging.
	 */
	const handleFsmTransition = useCallback((transition: OnboardingFsmTransition) => {
		log.debug(
			"OnboardingPage: FSM transition: %s -> %s (intent: %s)",
			transition.from,
			transition.to,
			transition.intent,
		);
		setFsmTransitions(prev => [...prev, transition]);
	}, []);

	/**
	 * Handle drag start on the drag handle.
	 */
	const handleDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			if (position === null) {
				return;
			}
			setIsDragging(true);
			dragStartRef.current = {
				x: e.clientX - position.x,
				y: e.clientY - position.y,
			};
		},
		[position],
	);

	/**
	 * Handle mouse move while dragging.
	 */
	useEffect(() => {
		if (!isDragging) {
			return;
		}

		function handleMouseMove(e: MouseEvent): void {
			setPosition({
				x: e.clientX - dragStartRef.current.x,
				y: e.clientY - dragStartRef.current.y,
			});
		}

		function handleMouseUp(): void {
			setIsDragging(false);
		}

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isDragging]);

	// If complete or position not initialized, don't render
	if (isComplete || position === null) {
		return null;
	}

	// Minimized state - show only a small floating bar
	if (isDialogMinimized) {
		return (
			<div
				ref={dialogRef}
				className="fixed z-[9999] bg-background border rounded-lg shadow-xl flex items-center gap-2 px-3 py-2"
				style={{
					left: `${position.x}px`,
					top: `${position.y}px`,
					cursor: isDragging ? "grabbing" : "default",
				}}
				data-testid="onboarding-dialog-minimized"
			>
				{/* Drag handle */}
				<div
					className="flex items-center gap-2 cursor-grab active:cursor-grabbing rounded hover:bg-muted px-1"
					onMouseDown={handleDragStart}
					title={content.dragToMove.value}
					data-testid="dialog-drag-handle"
				>
					<GripHorizontal className="h-4 w-4 text-muted-foreground" />
					<span className="text-sm font-medium">Jolli Onboarding</span>
				</div>

				{/* Restore button */}
				<button
					type="button"
					onClick={handleToggleDialogMinimized}
					className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors"
					title="Restore"
					data-testid="restore-dialog-button"
				>
					<Plus className="h-4 w-4 text-muted-foreground" />
				</button>

				{/* Close button */}
				<button
					type="button"
					onClick={handleSkip}
					disabled={isSkipping}
					className="h-7 w-7 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
					title={content.closeDialog.value}
					data-testid="close-dialog-button"
				>
					<X className="h-4 w-4" />
				</button>
			</div>
		);
	}

	return (
		<>
			{/* Floating onboarding panel - no backdrop, always on top */}
			<div
				ref={dialogRef}
				className="fixed z-[9999] bg-background border rounded-lg shadow-2xl w-[850px] max-w-[95vw] h-[650px] max-h-[85vh] flex flex-col"
				style={{
					left: `${position.x}px`,
					top: `${position.y}px`,
					cursor: isDragging ? "grabbing" : "default",
				}}
				data-testid="onboarding-dialog"
			>
				{/* Dialog header with drag handle and window controls */}
				<div className="flex items-center justify-between border-b px-2 py-1.5 bg-muted/50 rounded-t-lg shrink-0">
					{/* Drag handle */}
					<div
						className="flex items-center gap-2 px-2 py-1 cursor-grab active:cursor-grabbing rounded hover:bg-muted"
						onMouseDown={handleDragStart}
						title={content.dragToMove.value}
						data-testid="dialog-drag-handle"
					>
						<GripHorizontal className="h-4 w-4 text-muted-foreground" />
						<span className="text-sm font-medium text-muted-foreground">Jolli Onboarding</span>
					</div>

					{/* Window controls */}
					<div className="flex items-center gap-1">
						{/* Expand jobs panel button (only visible when minimized on desktop) */}
						{isJobsPanelMinimized && (
							<button
								type="button"
								onClick={handleToggleJobsPanel}
								className="hidden lg:flex h-7 w-7 items-center justify-center rounded hover:bg-muted transition-colors"
								title={content.expandPanel.value}
								data-testid="toggle-jobs-panel-button"
							>
								<Plus className="h-4 w-4 text-muted-foreground" />
							</button>
						)}

						{/* Minimize dialog button */}
						<button
							type="button"
							onClick={handleToggleDialogMinimized}
							className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors"
							title={content.minimizePanel.value}
							data-testid="minimize-dialog-button"
						>
							<Minus className="h-4 w-4 text-muted-foreground" />
						</button>

						{/* Close button */}
						<button
							type="button"
							onClick={handleSkip}
							disabled={isSkipping}
							className="h-7 w-7 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
							title={content.closeDialog.value}
							data-testid="close-dialog-button"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				</div>

				{/* Content area - two-panel layout on desktop */}
				<div className="flex-1 flex flex-row min-h-0 overflow-hidden">
					{/* Left Panel - Chat */}
					<div
						className={`flex flex-col min-w-0 ${isJobsPanelMinimized ? "flex-1" : "flex-[3]"} ${!isJobsPanelMinimized ? "border-r border-r-transparent lg:border-r-border" : ""}`}
					>
						{/* Header */}
						<header className="border-b p-4 flex justify-between items-center shrink-0">
							<div>
								<h1 className="text-xl font-bold">{content.title.value}</h1>
								<p className="text-sm text-muted-foreground">{content.subtitle.value}</p>
							</div>
							<Button
								variant="ghost"
								onClick={handleSkip}
								disabled={isSkipping}
								data-testid="skip-button"
							>
								{isSkipping ? content.loading.value : content.skip.value}
							</Button>
						</header>

						{/* Chat content */}
						<div className="flex-1 overflow-hidden flex flex-col min-h-0">
							{/* Loading state */}
							{isLoading && (
								<div
									className="flex-1 flex items-center justify-center"
									data-testid="onboarding-loading"
								>
									<div className="text-center">
										<div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
										<p className="text-muted-foreground">{content.loading.value}</p>
									</div>
								</div>
							)}

							{/* Error display - show skip option prominently */}
							{!isLoading && error && (
								<div
									className="flex-1 flex flex-col items-center justify-center p-6"
									data-testid="onboarding-error"
								>
									<div className="text-center max-w-md">
										<div className="text-4xl mb-4">&#9888;&#65039;</div>
										<p className="text-muted-foreground mb-6">{error}</p>
										<Button
											onClick={handleSkip}
											disabled={isSkipping}
											data-testid="error-skip-button"
										>
											{isSkipping ? content.loading.value : content.skip.value}
										</Button>
									</div>
								</div>
							)}

							{/* Chat area - only show if no error */}
							{!isLoading && !error && (
								<div className="flex-1 overflow-hidden">
									<OnboardingChat
										ref={chatRef}
										initialState={state}
										onComplete={handleChatComplete}
										onError={handleChatError}
										onUIAction={handleUIAction}
										onToolCall={handleToolCall}
										onToolResult={handleToolResult}
										onStateUpdate={handleStateUpdate}
										onFsmTransition={handleFsmTransition}
									/>
								</div>
							)}

							{/* FSM Log - dev-only panel showing state transitions */}
							{process.env.NODE_ENV === "development" && (
								<OnboardingFsmLog transitions={fsmTransitions} />
							)}
						</div>
					</div>

					{/* Right Panel - Jobs (hidden on mobile/tablet or when minimized) */}
					{!isJobsPanelMinimized && (
						<div
							className="hidden lg:flex flex-[2] flex-col min-w-0 bg-muted/30"
							data-testid="onboarding-jobs-container"
						>
							<OnboardingJobsPanel jobs={jobs} onMinimize={handleToggleJobsPanel} />
						</div>
					)}
				</div>
			</div>

			{/* GitHub Connection Modal - higher z-index than the floating panel */}
			{showGitHubModal && (
				<div
					className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]"
					data-testid="github-connect-modal-overlay"
				>
					<div
						className="bg-background rounded-lg shadow-xl w-full max-w-2xl mx-4"
						data-testid="github-connect-modal"
					>
						<GitHubIntegrationFlow
							onComplete={handleGitHubComplete}
							onCancel={handleGitHubCancel}
							openInNewWindow
						/>
					</div>
				</div>
			)}
		</>
	);
}
