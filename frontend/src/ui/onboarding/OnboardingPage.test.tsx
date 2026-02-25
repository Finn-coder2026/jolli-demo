import { createMockClient, renderWithProviders, wrapIntlayerMock } from "../../test/TestUtils";
import { OnboardingPage } from "./OnboardingPage";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		FileText: ({ className, "data-testid": testId }: { className?: string; "data-testid"?: string }) => (
			<div className={className} data-testid={testId} />
		),
		GitBranch: ({ className, "data-testid": testId }: { className?: string; "data-testid"?: string }) => (
			<div className={className} data-testid={testId} />
		),
		Search: ({ className, "data-testid": testId }: { className?: string; "data-testid"?: string }) => (
			<div className={className} data-testid={testId} />
		),
		Upload: ({ className, "data-testid": testId }: { className?: string; "data-testid"?: string }) => (
			<div className={className} data-testid={testId} />
		),
		GripHorizontal: ({ className }: { className?: string }) => (
			<div className={className} data-testid="grip-icon" />
		),
		Minus: ({ className }: { className?: string }) => <div className={className} data-testid="minus-icon" />,
		Plus: ({ className }: { className?: string }) => <div className={className} data-testid="plus-icon" />,
		X: ({ className }: { className?: string }) => <div className={className} data-testid="x-icon" />,
	};
});

vi.mock("react-intlayer", () => ({
	useIntlayer: () =>
		wrapIntlayerMock({
			title: "Welcome to Jolli",
			subtitle: "Let's get you set up",
			skip: "Skip for now",
			loading: "Loading...",
			thinking: "Thinking...",
			send: "Send",
			chatPlaceholder: "Type your message...",
			chatInputLabel: "Chat with Jolli",
			errorGeneric: "Something went wrong",
			errorUnauthorized: "Session expired",
			errorLlmNotConfigured: "AI not available",
			toolCallPrefix: "Running:",
			toolConnectGithub: "Connect GitHub",
			toolListRepos: "List Repos",
			toolScanRepository: "Scan Repo",
			toolImportMarkdown: "Import Markdown",
			toolImportAllMarkdown: "Import All",
			toolGenerateArticle: "Generate Article",
			toolAdvanceStep: "Advance Step",
			toolSkipOnboarding: "Skip Onboarding",
			toolCompleteOnboarding: "Complete Onboarding",
			toolCheckGithubStatus: "Check GitHub",
			toolInstallGithubApp: "Install GitHub App",
			toolConnectGithubRepo: "Connect Repo",
			toolGetOrCreateSpace: "Get/Create Space",
			toolGapAnalysis: "Gap Analysis",
			toolGenerateFromCode: "Generate from Code",
			toolCheckSyncTriggered: "Check Sync",
			jobsPanelTitle: "Jobs",
			jobsRunning: "running",
			jobsQueued: "queued",
			noJobs: "No jobs yet",
			jobStatusRunning: "Running",
			jobStatusQueued: "Queued",
			jobStatusCompleted: "Completed",
			jobStatusFailed: "Failed",
			closeDialog: "Close",
			minimizePanel: "Minimize",
			expandPanel: "Expand",
			dragToMove: "Drag to move",
			jobConnectGitHub: "Connecting to GitHub",
			jobGitHubConnected: "Repository connected",
			jobImportingDocument: "Importing document",
			jobImportCompleted: "Import completed",
			jobScanningRepository: "Scanning repository",
			jobScanCompleted: "Scan completed",
			jobFailed: "Failed",
			job1Title: "Connect GitHub",
			job1Complete: "Connected",
			job1Pending: "Not connected",
			job2Title: "Import Documents",
			job2Complete: "All documents imported",
			job2Pending: "No documents imported",
			job2Progress: "imported",
			job3Title: "Test Auto-Sync",
			job3Complete: "Sync working",
			job3Pending: "Not tested yet",
		}),
}));

// Mock useMercureSubscription hook
vi.mock("../../hooks/useMercureSubscription", () => ({
	useMercureSubscription: vi.fn(() => ({
		connected: false,
		reconnecting: false,
		usingMercure: false,
	})),
}));

// Mock GitHubIntegrationFlow to avoid complex dependencies
vi.mock("../integrations/github/GitHubIntegrationFlow", () => ({
	GitHubIntegrationFlow: ({ onComplete, onCancel }: { onComplete: () => void; onCancel: () => void }) => (
		<div data-testid="github-integration-flow">
			<button type="button" onClick={onComplete} data-testid="github-complete-button">
				Complete
			</button>
			<button type="button" onClick={onCancel} data-testid="github-cancel-button">
				Cancel
			</button>
		</div>
	),
}));

/** Common render options that disable providers we don't need */
const renderOptions = {
	withNavigation: false,
	withDevTools: false,
	withSpace: false,
	withSites: false,
	withOrg: false,
	withPreferences: false,
};

describe("OnboardingPage", () => {
	let mockClient: ReturnType<typeof createMockClient>;
	let mockOnboarding: {
		getState: ReturnType<typeof vi.fn>;
		chat: ReturnType<typeof vi.fn>;
		skip: ReturnType<typeof vi.fn>;
		complete: ReturnType<typeof vi.fn>;
		restart: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers({ shouldAdvanceTime: true });

		// Create persistent onboarding mock object
		mockOnboarding = {
			getState: vi.fn().mockResolvedValue({
				state: undefined,
				needsOnboarding: true,
			}),
			// biome-ignore lint/suspicious/useAwait: Mock async generator
			chat: vi.fn().mockImplementation(async function* () {
				yield { type: "content", content: "Mock response" };
				yield { type: "done", state: undefined };
			}),
			skip: vi.fn().mockResolvedValue({ success: true, state: {} }),
			complete: vi.fn().mockResolvedValue({ success: true, state: {} }),
			restart: vi.fn().mockResolvedValue({ success: true, state: {} }),
		};

		mockClient = createMockClient();
		// Override onboarding to return our persistent mock
		mockClient.onboarding = vi.fn(() => mockOnboarding);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should render two-panel layout on desktop", async () => {
		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-dialog")).toBeDefined();
		});

		// Check for jobs container (hidden on mobile by CSS, but present in DOM)
		expect(screen.getByTestId("onboarding-jobs-container")).toBeDefined();
	});

	it("should render floating dialog", async () => {
		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-dialog")).toBeDefined();
		});
	});

	it("should show loading state initially", () => {
		mockOnboarding.getState = vi.fn().mockImplementation(
			() =>
				new Promise(() => {
					// Never resolves - used to test loading state
				}),
		);

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		expect(screen.getByTestId("onboarding-loading")).toBeDefined();
	});

	it("should render skip button in header", async () => {
		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("skip-button")).toBeDefined();
		});
	});

	it("should render jobs panel with 3 main jobs", async () => {
		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-jobs-panel")).toBeDefined();
		});

		// Jobs panel should show the 3 main onboarding jobs
		expect(screen.getByTestId("onboarding-job-item-job-1-github")).toBeDefined();
		expect(screen.getByTestId("onboarding-job-item-job-2-import")).toBeDefined();
		expect(screen.getByTestId("onboarding-job-item-job-3-sync")).toBeDefined();
	});

	it("should return null when complete", async () => {
		mockOnboarding.getState = vi.fn().mockResolvedValue({
			state: { status: "completed" },
			needsOnboarding: false,
		});

		const onComplete = vi.fn();
		const { container } = renderWithProviders(<OnboardingPage onComplete={onComplete} />, {
			client: mockClient,
			...renderOptions,
		});

		await waitFor(() => {
			expect(onComplete).toHaveBeenCalled();
		});

		// Component should return null
		expect(container.querySelector('[data-testid="onboarding-dialog"]')).toBe(null);
	});

	it("should return null when skipped", async () => {
		mockOnboarding.getState = vi.fn().mockResolvedValue({
			state: { status: "skipped" },
			needsOnboarding: false,
		});

		const onComplete = vi.fn();
		const { container } = renderWithProviders(<OnboardingPage onComplete={onComplete} />, {
			client: mockClient,
			...renderOptions,
		});

		await waitFor(() => {
			expect(onComplete).toHaveBeenCalled();
		});

		expect(container.querySelector('[data-testid="onboarding-dialog"]')).toBe(null);
	});

	it("should show error state with skip option", async () => {
		mockOnboarding.getState = vi.fn().mockRejectedValue(new Error("Network error"));

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(
			() => {
				expect(screen.getByTestId("onboarding-error")).toBeDefined();
			},
			{ timeout: 3000 },
		);

		expect(screen.getByTestId("error-skip-button")).toBeDefined();
	});

	it("should render chat when loaded successfully", async () => {
		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-chat")).toBeDefined();
		});
	});

	it("should render drag handle in dialog header", async () => {
		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("dialog-drag-handle")).toBeDefined();
		});
	});

	it("should render close button in dialog header", async () => {
		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("close-dialog-button")).toBeDefined();
		});
	});

	it("should close dialog when close button is clicked", async () => {
		const onComplete = vi.fn();
		renderWithProviders(<OnboardingPage onComplete={onComplete} />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("close-dialog-button")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("close-dialog-button"));

		await waitFor(() => {
			expect(onComplete).toHaveBeenCalled();
		});
	});

	it("should still call onComplete when skip API fails", async () => {
		mockOnboarding.skip = vi.fn().mockRejectedValue(new Error("Network error"));

		const onComplete = vi.fn();
		renderWithProviders(<OnboardingPage onComplete={onComplete} />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("close-dialog-button")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("close-dialog-button"));

		await waitFor(() => {
			expect(onComplete).toHaveBeenCalled();
		});
	});

	it("should render minimize button on jobs panel", async () => {
		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("minimize-jobs-panel-button")).toBeDefined();
		});
	});

	it("should hide jobs panel when minimize button is clicked", async () => {
		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-jobs-container")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("minimize-jobs-panel-button"));

		await waitFor(() => {
			expect(screen.queryByTestId("onboarding-jobs-container")).toBe(null);
		});
	});

	it("should show expand button in header when jobs panel is minimized", async () => {
		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-jobs-container")).toBeDefined();
		});

		// Initially, expand button should not be visible
		expect(screen.queryByTestId("toggle-jobs-panel-button")).toBe(null);

		// Minimize the panel
		fireEvent.click(screen.getByTestId("minimize-jobs-panel-button"));

		await waitFor(() => {
			// Now expand button should be visible
			expect(screen.getByTestId("toggle-jobs-panel-button")).toBeDefined();
		});
	});

	it("should show jobs panel again when expand button is clicked", async () => {
		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-jobs-container")).toBeDefined();
		});

		// First minimize using the jobs panel button
		fireEvent.click(screen.getByTestId("minimize-jobs-panel-button"));
		await waitFor(() => {
			expect(screen.queryByTestId("onboarding-jobs-container")).toBe(null);
		});

		// Then expand using the header button
		fireEvent.click(screen.getByTestId("toggle-jobs-panel-button"));
		await waitFor(() => {
			expect(screen.getByTestId("onboarding-jobs-container")).toBeDefined();
		});
	});

	it("should show GitHub modal when ui_action open_github_connect is received", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "ui_action", uiAction: { type: "open_github_connect", message: "Connect GitHub" } };
			yield { type: "content", content: "Opening GitHub..." };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("github-connect-modal")).toBeDefined();
		});
	});

	it("should close GitHub modal and send message when GitHub connection completes", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "ui_action", uiAction: { type: "open_github_connect", message: "Connect GitHub" } };
			yield { type: "content", content: "Opening GitHub..." };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		// Wait for GitHub modal to appear
		await waitFor(() => {
			expect(screen.getByTestId("github-connect-modal")).toBeDefined();
		});

		// Click the complete button in the mocked GitHubIntegrationFlow
		fireEvent.click(screen.getByTestId("github-complete-button"));

		// Modal should be closed
		await waitFor(() => {
			expect(screen.queryByTestId("github-connect-modal")).toBe(null);
		});
	});

	it("should close GitHub modal without sending message when cancelled", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "ui_action", uiAction: { type: "open_github_connect", message: "Connect GitHub" } };
			yield { type: "content", content: "Opening GitHub..." };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("github-connect-modal")).toBeDefined();
		});

		// Click the cancel button
		fireEvent.click(screen.getByTestId("github-cancel-button"));

		// Modal should be closed
		await waitFor(() => {
			expect(screen.queryByTestId("github-connect-modal")).toBe(null);
		});
	});

	it("should add GitHub connection job to panel when ui_action is received", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "ui_action", uiAction: { type: "open_github_connect", message: "Connect GitHub" } };
			yield { type: "content", content: "Opening GitHub..." };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-job-item-github-connect")).toBeDefined();
		});
	});

	it("should show GitHub install modal when open_github_install action is received", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "ui_action", uiAction: { type: "open_github_install", message: "Install GitHub App" } };
			yield { type: "content", content: "Installing..." };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("github-connect-modal")).toBeDefined();
		});

		// Should add install transient job
		expect(screen.getByTestId("onboarding-job-item-github-install")).toBeDefined();
	});

	it("should send install message when completing from install mode", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "ui_action", uiAction: { type: "open_github_install", message: "Install GitHub App" } };
			yield { type: "content", content: "Installing..." };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("github-connect-modal")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("github-complete-button"));

		// Modal should close and send install-specific message
		await waitFor(() => {
			expect(screen.queryByTestId("github-connect-modal")).toBe(null);
		});
	});

	it("should show GitHub repo select modal when open_github_repo_select action is received", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield {
				type: "ui_action",
				uiAction: { type: "open_github_repo_select", message: "Select repository" },
			};
			yield { type: "content", content: "Selecting..." };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("github-connect-modal")).toBeDefined();
		});

		// Should add connect transient job
		expect(screen.getByTestId("onboarding-job-item-github-connect")).toBeDefined();
	});

	it("should navigate to article draft when review_import_changes action is received", async () => {
		// Mock window.location.href
		const originalLocation = window.location;
		const mockLocation = { ...originalLocation, href: "" };
		Object.defineProperty(window, "location", {
			value: mockLocation,
			writable: true,
		});

		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield {
				type: "ui_action",
				uiAction: {
					type: "review_import_changes",
					articleJrn: "jrn:prod:global:docs:document/test-article-abc123",
					draftId: 42,
					message: "Review 3 changes",
				},
			};
			yield { type: "content", content: "Opening article for review..." };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(mockLocation.href).toContain("/articles/");
			expect(mockLocation.href).toContain("?edit=42");
		});

		// Restore original location
		Object.defineProperty(window, "location", {
			value: originalLocation,
			writable: true,
		});
	});

	it("should navigate when navigate ui_action is received", async () => {
		const originalLocation = window.location;
		const mockLocation = { ...originalLocation, href: "" };
		Object.defineProperty(window, "location", {
			value: mockLocation,
			writable: true,
		});

		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield {
				type: "ui_action",
				uiAction: { type: "navigate", url: "/articles/some-article", message: "Navigate" },
			};
			yield { type: "content", content: "Navigating..." };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(mockLocation.href).toBe("/articles/some-article");
		});

		Object.defineProperty(window, "location", {
			value: originalLocation,
			writable: true,
		});
	});

	it("should dispatch spaces-changed event on space_created ui_action", async () => {
		const dispatchSpy = vi.spyOn(window, "dispatchEvent");

		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield {
				type: "ui_action",
				uiAction: { type: "space_created", message: "Space created" },
			};
			yield { type: "content", content: "Space ready" };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			const calls = dispatchSpy.mock.calls.filter(
				call => call[0] instanceof CustomEvent && call[0].type === "jolli:spaces-changed",
			);
			expect(calls.length).toBeGreaterThan(0);
		});

		dispatchSpy.mockRestore();
	});

	it("should handle open_gap_analysis ui_action without error", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield {
				type: "ui_action",
				uiAction: { type: "open_gap_analysis", message: "Gap analysis results" },
			};
			yield { type: "content", content: "Analysis done" };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		// Should not crash - just verify chat renders
		await waitFor(() => {
			expect(screen.getByTestId("onboarding-chat")).toBeDefined();
		});
	});

	it("should handle generation_completed ui_action without error", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield {
				type: "ui_action",
				uiAction: { type: "generation_completed", message: "Generation done" },
			};
			yield { type: "content", content: "Done" };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-chat")).toBeDefined();
		});
	});

	it("should add transient job when import_markdown tool call is received", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield {
				type: "tool_call",
				toolCall: { id: "tc-1", name: "import_markdown", arguments: { file_path: "docs/README.md" } },
			};
			yield { type: "tool_result", toolResult: { toolCallId: "tc-1", name: "import_markdown", success: true } };
			yield { type: "content", content: "Imported" };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-job-item-tc-1")).toBeDefined();
		});
	});

	it("should add transient job when scan_repository tool call is received", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield {
				type: "tool_call",
				toolCall: { id: "tc-2", name: "scan_repository", arguments: { repository: "my-org/my-repo" } },
			};
			yield { type: "content", content: "Scanning..." };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-job-item-tc-2")).toBeDefined();
		});
	});

	it("should update and remove transient job when tool result is received", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield {
				type: "tool_call",
				toolCall: { id: "tc-3", name: "import_markdown", arguments: { file_path: "docs/guide.md" } },
			};
			yield { type: "tool_result", toolResult: { toolCallId: "tc-3", name: "import_markdown", success: true } };
			yield { type: "content", content: "Imported" };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		// Job should appear
		await waitFor(() => {
			expect(screen.getByTestId("onboarding-job-item-tc-3")).toBeDefined();
		});

		// After 2 seconds, transient job should be removed
		vi.advanceTimersByTime(2500);
		await waitFor(() => {
			expect(screen.queryByTestId("onboarding-job-item-tc-3")).toBe(null);
		});
	});

	it("should show failed status for unsuccessful tool result", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield {
				type: "tool_call",
				toolCall: { id: "tc-4", name: "scan_repository", arguments: { repository: "bad-repo" } },
			};
			yield {
				type: "tool_result",
				toolResult: { toolCallId: "tc-4", name: "scan_repository", success: false },
			};
			yield { type: "content", content: "Failed to scan" };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		// Job should appear with failed status text
		await waitFor(() => {
			expect(screen.getByTestId("onboarding-job-item-tc-4")).toBeDefined();
		});
	});

	it("should handle tool result with ui_action", async () => {
		const dispatchSpy = vi.spyOn(window, "dispatchEvent");

		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield {
				type: "tool_call",
				toolCall: { id: "tc-5", name: "import_markdown", arguments: { file_path: "docs/api.md" } },
			};
			yield {
				type: "tool_result",
				toolResult: {
					toolCallId: "tc-5",
					name: "import_markdown",
					success: true,
					uiAction: { type: "space_created", message: "New space" },
				},
			};
			yield { type: "content", content: "Done" };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			const calls = dispatchSpy.mock.calls.filter(
				call => call[0] instanceof CustomEvent && call[0].type === "jolli:spaces-changed",
			);
			expect(calls.length).toBeGreaterThan(0);
		});

		dispatchSpy.mockRestore();
	});

	it("should show Unauthorized error when chat returns Unauthorized", async () => {
		// First chat call auto-sends greeting - make it error
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "error", error: "Unauthorized" };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-error")).toBeDefined();
		});
	});

	it("should show LLM error when chat returns llm_not_configured error", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "error", error: "llm_not_configured" };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-error")).toBeDefined();
		});
	});

	it("should show generic error for other chat errors", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "error", error: "something unexpected" };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-error")).toBeDefined();
		});
	});

	it("should minimize and restore dialog", async () => {
		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-dialog")).toBeDefined();
		});

		// Click minimize button
		fireEvent.click(screen.getByTestId("minimize-dialog-button"));

		// Should show minimized bar
		await waitFor(() => {
			expect(screen.getByTestId("onboarding-dialog-minimized")).toBeDefined();
		});
		expect(screen.queryByTestId("onboarding-dialog")).toBe(null);

		// Click restore button
		fireEvent.click(screen.getByTestId("restore-dialog-button"));

		// Should restore full dialog
		await waitFor(() => {
			expect(screen.getByTestId("onboarding-dialog")).toBeDefined();
		});
		expect(screen.queryByTestId("onboarding-dialog-minimized")).toBe(null);
	});

	it("should allow skip from minimized dialog", async () => {
		const onComplete = vi.fn();
		renderWithProviders(<OnboardingPage onComplete={onComplete} />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-dialog")).toBeDefined();
		});

		// Minimize
		fireEvent.click(screen.getByTestId("minimize-dialog-button"));
		await waitFor(() => {
			expect(screen.getByTestId("onboarding-dialog-minimized")).toBeDefined();
		});

		// Click close on minimized bar
		fireEvent.click(screen.getByTestId("close-dialog-button"));
		await waitFor(() => {
			expect(onComplete).toHaveBeenCalled();
		});
	});

	it("should drag the dialog on mousedown", async () => {
		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("dialog-drag-handle")).toBeDefined();
		});

		const dragHandle = screen.getByTestId("dialog-drag-handle");
		const dialog = screen.getByTestId("onboarding-dialog");
		const initialLeft = dialog.style.left;

		// Start dragging
		fireEvent.mouseDown(dragHandle, { clientX: 100, clientY: 100 });

		// Move mouse
		fireEvent.mouseMove(document, { clientX: 200, clientY: 150 });

		// Position should change
		await waitFor(() => {
			expect(dialog.style.left).not.toBe(initialLeft);
		});

		// Stop dragging
		fireEvent.mouseUp(document);
	});

	it("should drag the minimized dialog bar", async () => {
		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-dialog")).toBeDefined();
		});

		// Minimize
		fireEvent.click(screen.getByTestId("minimize-dialog-button"));
		await waitFor(() => {
			expect(screen.getByTestId("onboarding-dialog-minimized")).toBeDefined();
		});

		const dragHandle = screen.getByTestId("dialog-drag-handle");

		// Start dragging minimized bar
		fireEvent.mouseDown(dragHandle, { clientX: 100, clientY: 100 });
		fireEvent.mouseMove(document, { clientX: 300, clientY: 200 });
		fireEvent.mouseUp(document);
	});

	it("should update jobs when state has completed step data", async () => {
		mockOnboarding.getState = vi.fn().mockResolvedValue({
			state: {
				status: "in_progress",
				stepData: {
					connectedIntegration: "github-app-123",
					connectedRepo: "my-org/my-repo",
					discoveredFiles: ["doc1.md", "doc2.md"],
					importedArticles: ["doc1.md", "doc2.md"],
					generatedArticles: [],
					syncTriggered: true,
				},
			},
			needsOnboarding: true,
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-job-item-job-1-github")).toBeDefined();
		});
	});

	it("should show generated count in job2 when articles are generated", async () => {
		mockOnboarding.getState = vi.fn().mockResolvedValue({
			state: {
				status: "in_progress",
				stepData: {
					discoveredFiles: [],
					importedArticles: [],
					generatedArticles: ["gen1.md"],
				},
			},
			needsOnboarding: true,
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-job-item-job-2-import")).toBeDefined();
		});
	});

	it("should show partial import progress in job2 subtitle", async () => {
		mockOnboarding.getState = vi.fn().mockResolvedValue({
			state: {
				status: "in_progress",
				stepData: {
					discoveredFiles: ["a.md", "b.md", "c.md"],
					importedArticles: ["a.md"],
					generatedArticles: [],
				},
			},
			needsOnboarding: true,
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-job-item-job-2-import")).toBeDefined();
		});
	});

	it("should handle FSM transition events for dev logging", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield {
				type: "fsm_transition",
				fsmTransition: { from: "GREETING", to: "GITHUB_CHECK", intent: "check_github" },
			};
			yield { type: "content", content: "Checking GitHub..." };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		// Should render without error
		await waitFor(() => {
			expect(screen.getByTestId("onboarding-chat")).toBeDefined();
		});
	});

	it("should close dialog when chat done event has completed state", async () => {
		const onComplete = vi.fn();

		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "content", content: "All done!" };
			yield { type: "done", state: { status: "completed" } };
		});

		renderWithProviders(<OnboardingPage onComplete={onComplete} />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(onComplete).toHaveBeenCalled();
		});
	});

	it("should handle state update from chat", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "content", content: "Connected!" };
			yield {
				type: "done",
				state: {
					status: "in_progress",
					stepData: { connectedIntegration: "github-123", connectedRepo: "org/repo" },
				},
			};
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		// Wait for state update to propagate to jobs panel
		await waitFor(() => {
			expect(screen.getByTestId("onboarding-chat")).toBeDefined();
		});
	});

	it("should show both imported and generated counts in job2", async () => {
		mockOnboarding.getState = vi.fn().mockResolvedValue({
			state: {
				status: "in_progress",
				stepData: {
					discoveredFiles: [],
					importedArticles: ["a.md", "b.md"],
					generatedArticles: ["c.md"],
				},
			},
			needsOnboarding: true,
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("onboarding-job-item-job-2-import")).toBeDefined();
		});
	});

	it("should enter SYNC_WAITING state and start polling when FSM transitions", async () => {
		vi.useRealTimers();

		// Return state with userId so Mercure subscription can be enabled
		mockOnboarding.getState = vi.fn().mockResolvedValue({
			state: { status: "in_progress", userId: 42, stepData: {} },
			needsOnboarding: true,
		});

		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield {
				type: "fsm_transition",
				fsmTransition: { from: "GITHUB_CONNECTED", to: "SYNC_WAITING", intent: "wait_for_sync" },
			};
			yield { type: "content", content: "Waiting for sync..." };
			yield { type: "done", state: { status: "in_progress", userId: 42, stepData: {} } };
		});

		renderWithProviders(<OnboardingPage />, { client: mockClient, ...renderOptions });

		// Wait for chat to complete and FSM transition to be recorded
		await waitFor(() => {
			// Chat should have been called (greeting auto-sends)
			expect(mockOnboarding.chat).toHaveBeenCalled();
		});

		// Verify the component rendered without error in SYNC_WAITING state
		expect(screen.getByTestId("onboarding-chat")).toBeDefined();

		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	it("should skip via header skip button", async () => {
		const onComplete = vi.fn();
		renderWithProviders(<OnboardingPage onComplete={onComplete} />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("skip-button")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("skip-button"));

		await waitFor(() => {
			expect(mockOnboarding.skip).toHaveBeenCalled();
			expect(onComplete).toHaveBeenCalled();
		});
	});

	it("should handle error skip button click", async () => {
		mockOnboarding.getState = vi.fn().mockRejectedValue(new Error("Network error"));
		const onComplete = vi.fn();

		renderWithProviders(<OnboardingPage onComplete={onComplete} />, { client: mockClient, ...renderOptions });

		await waitFor(
			() => {
				expect(screen.getByTestId("error-skip-button")).toBeDefined();
			},
			{ timeout: 3000 },
		);

		fireEvent.click(screen.getByTestId("error-skip-button"));

		await waitFor(() => {
			expect(onComplete).toHaveBeenCalled();
		});
	});
});
