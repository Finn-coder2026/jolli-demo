import { createMockClient, renderWithProviders, wrapIntlayerMock } from "../../test/TestUtils";
import { OnboardingChat } from "./OnboardingChat";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-intlayer", () => ({
	useIntlayer: () =>
		wrapIntlayerMock({
			thinking: "Thinking...",
			send: "Send",
			chatPlaceholder: "Type your message...",
			chatInputLabel: "Chat with Jolli",
			errorGeneric: "Something went wrong",
			toolCallPrefix: "Running:",
			toolConnectGithub: "Connect GitHub",
			toolListRepos: "List Repositories",
			toolScanRepository: "Scan Repository",
			toolImportMarkdown: "Import Markdown",
			toolImportAllMarkdown: "Import All Documents",
			toolGenerateArticle: "Generate Article",
			toolAdvanceStep: "Advance Step",
			toolSkipOnboarding: "Skip Onboarding",
			toolCompleteOnboarding: "Complete Onboarding",
			toolCheckGithubStatus: "Check GitHub Status",
			toolInstallGithubApp: "Install GitHub App",
			toolConnectGithubRepo: "Connect Repository",
			toolGetOrCreateSpace: "Create Space",
			toolGapAnalysis: "Analyzing Documentation Gaps",
			toolGenerateFromCode: "Generating Documentation",
			toolCheckSyncTriggered: "Check Sync Status",
		}),
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

describe("OnboardingChat", () => {
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

	it("should render chat container", () => {
		renderWithProviders(<OnboardingChat />, { client: mockClient, ...renderOptions });

		expect(screen.getByTestId("onboarding-chat")).toBeDefined();
	});

	it("should render input field and send button", () => {
		renderWithProviders(<OnboardingChat />, { client: mockClient, ...renderOptions });

		expect(screen.getByTestId("chat-input")).toBeDefined();
		expect(screen.getByTestId("chat-send-button")).toBeDefined();
	});

	it("should send initial greeting on mount", async () => {
		renderWithProviders(<OnboardingChat />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			// Should have sent initial greeting
			expect(mockOnboarding.chat).toHaveBeenCalled();
		});
	});

	it("should display user message when sent", async () => {
		renderWithProviders(<OnboardingChat />, { client: mockClient, ...renderOptions });

		// Wait for initial greeting to complete
		await waitFor(() => {
			expect(screen.getByTestId("chat-message-user")).toBeDefined();
		});

		expect(screen.getByTestId("chat-message-user")).toBeDefined();
	});

	it("should display timestamp on messages", async () => {
		renderWithProviders(<OnboardingChat />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByTestId("chat-message-user")).toBeDefined();
		});

		// Find any timestamp element (they include the message id)
		const timestamps = document.querySelectorAll('[data-testid^="message-timestamp-"]');
		expect(timestamps.length).toBeGreaterThan(0);
	});

	it("should disable input while loading", async () => {
		// Create a chat mock that takes time to respond
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			await new Promise(resolve => setTimeout(resolve, 100));
			yield { type: "content", content: "Response" };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingChat />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			const input = screen.getByTestId("chat-input") as HTMLInputElement;
			expect(input.disabled).toBe(true);
		});
	});

	it("should show thinking indicator while streaming", async () => {
		// Create a chat mock that takes time
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			await new Promise(resolve => setTimeout(resolve, 50));
			yield { type: "content", content: "Hello" };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingChat />, { client: mockClient, ...renderOptions });

		// Initially should show thinking
		await waitFor(() => {
			expect(screen.getByText("Thinking...")).toBeDefined();
		});
	});

	it("should handle form submission", async () => {
		renderWithProviders(<OnboardingChat />, { client: mockClient, ...renderOptions });

		// Wait for initial greeting and response to complete
		await waitFor(() => {
			expect(mockOnboarding.chat).toHaveBeenCalled();
			// Ensure the response has finished streaming
			expect(screen.getByText("Mock response")).toBeDefined();
		});

		const callCount = mockOnboarding.chat.mock.calls.length;

		// Type a message
		const input = screen.getByTestId("chat-input") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "Hello" } });

		// Wait for React to process the state update
		await waitFor(() => {
			expect(input.value).toBe("Hello");
		});

		// Submit the form
		const button = screen.getByTestId("chat-send-button");
		fireEvent.click(button);

		await waitFor(() => {
			expect(mockOnboarding.chat.mock.calls.length).toBeGreaterThan(callCount);
		});
	});

	it("should hide input when complete", () => {
		renderWithProviders(<OnboardingChat initialState={{ status: "completed" } as never} />, {
			client: mockClient,
			...renderOptions,
		});

		expect(screen.queryByTestId("chat-input")).toBe(null);
	});

	it("should call onComplete when status changes to completed", async () => {
		const onComplete = vi.fn();

		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "content", content: "All done!" };
			yield { type: "done", state: { status: "completed" } };
		});

		renderWithProviders(<OnboardingChat onComplete={onComplete} />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(onComplete).toHaveBeenCalled();
		});
	});

	it("should call onError when error occurs", async () => {
		const onError = vi.fn();

		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "error", error: "Test error" };
		});

		renderWithProviders(<OnboardingChat onError={onError} />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(onError).toHaveBeenCalledWith("Test error");
		});
	});

	it("should display tool calls in messages", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "tool_call", toolCall: { id: "tc-1", name: "connect_github", arguments: {} } };
			yield { type: "content", content: "Connected!" };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingChat />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByText("Connect GitHub")).toBeDefined();
		});
	});

	it("should send message on Enter key press", async () => {
		renderWithProviders(<OnboardingChat />, { client: mockClient, ...renderOptions });

		// Wait for initial greeting and response to complete
		await waitFor(() => {
			expect(mockOnboarding.chat).toHaveBeenCalled();
			expect(screen.getByText("Mock response")).toBeDefined();
		});

		const callCount = mockOnboarding.chat.mock.calls.length;

		// Type a message
		const input = screen.getByTestId("chat-input") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "Hello" } });

		// Wait for React to process the state update
		await waitFor(() => {
			expect(input.value).toBe("Hello");
		});

		// Press Enter
		fireEvent.keyPress(input, { key: "Enter", charCode: 13 });

		await waitFor(() => {
			expect(mockOnboarding.chat.mock.calls.length).toBeGreaterThan(callCount);
		});
	});

	it("should not send message on Shift+Enter", async () => {
		renderWithProviders(<OnboardingChat />, { client: mockClient, ...renderOptions });

		// Wait for initial greeting and response to complete
		await waitFor(() => {
			expect(mockOnboarding.chat).toHaveBeenCalled();
			expect(screen.getByText("Mock response")).toBeDefined();
		});

		const callCount = mockOnboarding.chat.mock.calls.length;

		// Type a message
		const input = screen.getByTestId("chat-input") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "Hello" } });

		// Wait for React to process the state update
		await waitFor(() => {
			expect(input.value).toBe("Hello");
		});

		// Press Shift+Enter
		fireEvent.keyPress(input, { key: "Enter", charCode: 13, shiftKey: true });

		// Give it a moment to process
		await new Promise(resolve => setTimeout(resolve, 50));

		// Should NOT have sent another message
		expect(mockOnboarding.chat.mock.calls.length).toBe(callCount);
	});

	it("should call onComplete when status is skipped", async () => {
		const onComplete = vi.fn();

		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "content", content: "Skipping!" };
			yield { type: "done", state: { status: "skipped" } };
		});

		renderWithProviders(<OnboardingChat onComplete={onComplete} />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(onComplete).toHaveBeenCalled();
		});
	});

	it("should handle error event without error message", async () => {
		const onError = vi.fn();

		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "error" };
		});

		renderWithProviders(<OnboardingChat onError={onError} />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(onError).toHaveBeenCalledWith("Unknown error");
		});
	});

	it("should handle exception in chat stream", async () => {
		const onError = vi.fn();

		// biome-ignore lint/suspicious/useAwait lint/correctness/useYield: Mock that throws before yield
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			throw new Error("Network error");
		});

		renderWithProviders(<OnboardingChat onError={onError} />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(onError).toHaveBeenCalledWith("Network error");
		});
	});

	it("should display unknown tool name when not in map", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "tool_call", toolCall: { id: "tc-1", name: "unknown_tool", arguments: {} } };
			yield { type: "content", content: "Done!" };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingChat />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByText("unknown_tool")).toBeDefined();
		});
	});

	it("should handle content event with empty content", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "content", content: "" };
			yield { type: "content", content: "Hello" };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingChat />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByText("Hello")).toBeDefined();
		});
	});

	it("should handle tool_result event", async () => {
		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "tool_call", toolCall: { id: "tc-1", name: "connect_github", arguments: {} } };
			yield {
				type: "tool_result",
				toolResult: { toolCallId: "tc-1", name: "connect_github", content: "Success", success: true },
			};
			yield { type: "content", content: "Connected!" };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingChat />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(screen.getByText("Connected!")).toBeDefined();
		});
	});

	it("should hide input when initial state is skipped", () => {
		renderWithProviders(<OnboardingChat initialState={{ status: "skipped" } as never} />, {
			client: mockClient,
			...renderOptions,
		});

		expect(screen.queryByTestId("chat-input")).toBe(null);
	});

	it("should call onUIAction when ui_action event is received", async () => {
		const onUIAction = vi.fn();

		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "ui_action", uiAction: { type: "open_github_connect", message: "Connect GitHub" } };
			yield { type: "content", content: "Opening GitHub connection..." };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingChat onUIAction={onUIAction} />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(onUIAction).toHaveBeenCalledWith({ type: "open_github_connect", message: "Connect GitHub" });
		});
	});

	it("should call onStateUpdate when done event has state", async () => {
		const onStateUpdate = vi.fn();

		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "content", content: "Connected!" };
			yield { type: "done", state: { status: "in_progress", stepData: { connectedIntegration: 42 } } };
		});

		renderWithProviders(<OnboardingChat onStateUpdate={onStateUpdate} />, { client: mockClient, ...renderOptions });

		await waitFor(() => {
			expect(onStateUpdate).toHaveBeenCalledWith({
				status: "in_progress",
				stepData: { connectedIntegration: 42 },
			});
		});
	});

	it("should expose sendMessage via ref", async () => {
		// This test is checking that the ref exposes sendMessage, which is used
		// by OnboardingPage to continue the conversation after GitHub connection.
		// The implementation uses forwardRef and useImperativeHandle.
		// Since we're testing the component in isolation, we verify the ref exists
		// by checking the component renders successfully with a ref.
		const ref = { current: null };

		// biome-ignore lint/suspicious/useAwait: Mock async generator
		mockOnboarding.chat = vi.fn().mockImplementation(async function* () {
			yield { type: "content", content: "Response" };
			yield { type: "done", state: undefined };
		});

		renderWithProviders(<OnboardingChat ref={ref} />, { client: mockClient, ...renderOptions });

		// Wait for initial message to complete
		await waitFor(() => {
			expect(screen.getByText("Response")).toBeDefined();
		});

		// Verify the ref was populated (forwardRef is working)
		expect(ref.current).not.toBe(null);
	});
});
