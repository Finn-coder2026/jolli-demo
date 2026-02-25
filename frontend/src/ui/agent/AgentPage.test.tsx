import { AgentPage } from "./AgentPage";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { AgentPlanPhase } from "jolli-common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock MarkdownContent to avoid markdown-to-jsx / Preact VNode conflicts in tests
vi.mock("../../components/MarkdownContent", () => ({
	MarkdownContent: ({ children }: { children: string }) => <div data-testid="markdown-content">{children}</div>,
}));

// Mock useCurrentUser
const mockMarkAgentNavigating = vi.fn();
const mockDeactivateAgentHub = vi.fn();
vi.mock("../../contexts/CurrentUserContext", () => ({
	useCurrentUser: () => ({
		markAgentNavigating: mockMarkAgentNavigating,
		deactivateAgentHub: mockDeactivateAgentHub,
	}),
}));

// Mock useNavigation
const mockNavigate = vi.fn();
vi.mock("../../contexts/NavigationContext", () => ({
	useNavigation: () => ({ navigate: mockNavigate }),
}));

// Mock the useAgentHub hook
const mockSetMessage = vi.fn();
const mockSend = vi.fn();
const mockNewChat = vi.fn();
const mockSwitchConvo = vi.fn();
const mockDeleteConvo = vi.fn();
const mockStop = vi.fn();
const mockClearPendingNavigation = vi.fn();
const mockRetry = vi.fn();

// Mock client for create article
const mockCreateDocDraft = vi.fn().mockResolvedValue({ id: 42 });
vi.mock("../../contexts/ClientContext", () => ({
	useClient: () => ({
		docDrafts: () => ({
			createDocDraft: mockCreateDocDraft,
		}),
	}),
}));

const mockApproveConfirmation = vi.fn();
const mockDenyConfirmation = vi.fn();
const mockSetMode = vi.fn();

let mockHookState = {
	convos: [] as ReadonlyArray<{ id: number; title: string | undefined; updatedAt: string }>,
	activeConvoId: undefined as number | undefined,
	messages: [] as ReadonlyArray<{ role: string; content: string; timestamp: string }>,
	message: "",
	streamingContent: "",
	isLoading: false,
	error: undefined as string | undefined,
	pendingNavigation: undefined as { path: string; label: string } | undefined,
	plan: undefined as string | undefined,
	planPhase: undefined as AgentPlanPhase | undefined,
	mode: undefined as "plan" | "exec" | "exec-accept-all" | undefined,
	pendingConfirmations: [] as ReadonlyArray<{
		confirmationId: string;
		toolName: string;
		toolArgs: Record<string, unknown>;
		description: string;
	}>,
	setMessage: mockSetMessage,
	send: mockSend,
	newChat: mockNewChat,
	switchConvo: mockSwitchConvo,
	deleteConvo: mockDeleteConvo,
	stop: mockStop,
	clearPendingNavigation: mockClearPendingNavigation,
	retry: mockRetry,
	approveConfirmation: mockApproveConfirmation,
	denyConfirmation: mockDenyConfirmation,
	setMode: mockSetMode,
};

vi.mock("../../hooks/UseAgentHub", () => ({
	useAgentHub: () => mockHookState,
}));

// Mock clipboard API
Object.assign(navigator, {
	clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

describe("AgentPage", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		mockHookState = {
			convos: [],
			activeConvoId: undefined,
			messages: [],
			message: "",
			streamingContent: "",
			isLoading: false,
			error: undefined,
			pendingNavigation: undefined,
			plan: undefined,
			planPhase: undefined,
			mode: undefined,
			pendingConfirmations: [],
			setMessage: mockSetMessage,
			send: mockSend,
			newChat: mockNewChat,
			switchConvo: mockSwitchConvo,
			deleteConvo: mockDeleteConvo,
			stop: mockStop,
			clearPendingNavigation: mockClearPendingNavigation,
			retry: mockRetry,
			approveConfirmation: mockApproveConfirmation,
			denyConfirmation: mockDenyConfirmation,
			setMode: mockSetMode,
		};
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should render the agent page with sidebar and welcome screen", () => {
		render(<AgentPage />);

		expect(screen.getByTestId("agent-page")).toBeDefined();
		expect(screen.getByTestId("agent-sidebar")).toBeDefined();
		expect(screen.getByTestId("agent-welcome")).toBeDefined();
		expect(screen.getByTestId("agent-input")).toBeDefined();
	});

	it("should show welcome screen when no active conversation", () => {
		render(<AgentPage />);

		expect(screen.getByTestId("agent-welcome")).toBeDefined();
		expect(screen.queryByTestId("agent-conversation")).toBeNull();
	});

	it("should show conversation when active convo ID is set", () => {
		mockHookState.activeConvoId = 1;
		mockHookState.messages = [{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" }];

		render(<AgentPage />);

		expect(screen.getByTestId("agent-conversation")).toBeDefined();
		expect(screen.queryByTestId("agent-welcome")).toBeNull();
	});

	it("should show error message when error is set", () => {
		mockHookState.error = "Something went wrong";

		render(<AgentPage />);

		expect(screen.getByTestId("agent-error")).toBeDefined();
	});

	it("should not show error message when no error", () => {
		render(<AgentPage />);

		expect(screen.queryByTestId("agent-error")).toBeNull();
	});

	it("should render sidebar with conversation groups", () => {
		mockHookState.convos = [
			{ id: 1, title: "Chat 1", updatedAt: new Date().toISOString() },
			{ id: 2, title: "Chat 2", updatedAt: new Date().toISOString() },
		];

		render(<AgentPage />);

		const items = screen.getAllByTestId("convo-item");
		expect(items).toHaveLength(2);
	});

	it("should call setMessage when suggestion card is clicked", () => {
		render(<AgentPage />);

		const draftCard = screen.getByTestId("suggestion-suggestionDraft");
		draftCard.click();

		expect(mockSetMessage).toHaveBeenCalledWith("I'd like to draft a new article");
	});

	it("should pass isLoading to input component", () => {
		mockHookState.isLoading = true;
		mockHookState.activeConvoId = 1;

		render(<AgentPage />);

		// The send button should show stop styling during loading
		const sendButton = screen.getByTestId("agent-send-button");
		expect(sendButton.className).toContain("bg-destructive");
	});

	it("should navigate after a brief delay when pendingNavigation is set", () => {
		mockHookState.pendingNavigation = { path: "/article-draft/42", label: "My Draft" };

		render(<AgentPage />);

		// Neither has been called yet — both wait for the 800ms delay
		expect(mockNavigate).not.toHaveBeenCalled();
		expect(mockClearPendingNavigation).not.toHaveBeenCalled();
		expect(mockMarkAgentNavigating).not.toHaveBeenCalled();

		vi.advanceTimersByTime(800);
		expect(mockClearPendingNavigation).toHaveBeenCalled();
		expect(mockMarkAgentNavigating).toHaveBeenCalled();
		expect(mockNavigate).toHaveBeenCalledWith("/article-draft/42");
	});

	it("should not navigate when pendingNavigation is undefined", () => {
		render(<AgentPage />);

		vi.advanceTimersByTime(1000);
		expect(mockNavigate).not.toHaveBeenCalled();
		expect(mockClearPendingNavigation).not.toHaveBeenCalled();
	});

	it("should pass retry to AgentConversation", () => {
		mockHookState.activeConvoId = 1;
		mockHookState.messages = [
			{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" },
			{ role: "assistant", content: "Hi there!", timestamp: "2026-02-11T10:00:01Z" },
		];

		render(<AgentPage />);

		// The retry button should be visible on the last assistant message
		expect(screen.getByTestId("retry-message-button")).toBeDefined();
	});

	it("should show create article button on assistant messages in conversation", () => {
		mockHookState.activeConvoId = 1;
		mockHookState.messages = [
			{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" },
			{ role: "assistant", content: "Here is some content", timestamp: "2026-02-11T10:00:01Z" },
		];

		render(<AgentPage />);

		expect(screen.getByTestId("create-article-button")).toBeDefined();
	});

	it("should focus the input textarea when New Chat is clicked", async () => {
		render(<AgentPage />);

		const newChatButton = screen.getByTestId("new-chat-button");
		fireEvent.click(newChatButton);

		// Focus happens via queueMicrotask — flush it
		await vi.advanceTimersByTimeAsync(0);

		const textarea = screen.getByTestId("agent-input-textarea");
		expect(document.activeElement).toBe(textarea);
	});

	it("should call deactivateAgentHub on unmount", () => {
		const { unmount } = render(<AgentPage />);

		expect(mockDeactivateAgentHub).not.toHaveBeenCalled();

		unmount();

		expect(mockDeactivateAgentHub).toHaveBeenCalled();
	});

	it("should focus the input textarea when a suggestion card is clicked", async () => {
		render(<AgentPage />);

		const searchCard = screen.getByTestId("suggestion-suggestionSearch");
		fireEvent.click(searchCard);

		// Focus happens via queueMicrotask — flush it
		await vi.advanceTimersByTimeAsync(0);

		const textarea = screen.getByTestId("agent-input-textarea");
		expect(document.activeElement).toBe(textarea);
		expect(mockSetMessage).toHaveBeenCalledWith("Search my knowledge base for ");
	});

	it("should show mode selector in input area when activeConvoId and mode are set", () => {
		mockHookState.activeConvoId = 1;
		mockHookState.messages = [{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" }];
		mockHookState.mode = "plan";

		render(<AgentPage />);

		expect(screen.getByTestId("agent-plan-toggle")).toBeDefined();
		expect(screen.getByTestId("plan-mode-toggle")).toBeDefined();
	});

	it("should not show mode selector when no active conversation", () => {
		mockHookState.mode = "plan";

		render(<AgentPage />);

		expect(screen.queryByTestId("agent-plan-toggle")).toBeNull();
	});

	it("should open plan dialog when plan badge is clicked in input area", () => {
		mockHookState.activeConvoId = 1;
		mockHookState.messages = [{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" }];
		mockHookState.plan = "# My Plan";
		mockHookState.planPhase = "executing";
		mockHookState.mode = "plan";

		render(<AgentPage />);

		fireEvent.click(screen.getByTestId("mode-plan-badge-button"));

		expect(screen.getByTestId("plan-dialog")).toBeDefined();
	});

	it("should render plan dialog when plan and planPhase exist and dialog is open", () => {
		mockHookState.activeConvoId = 1;
		mockHookState.messages = [{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" }];
		mockHookState.plan = "# Step 1\n# Step 2";
		mockHookState.planPhase = "complete";
		mockHookState.mode = "plan";

		render(<AgentPage />);

		// Open via plan badge click in input area
		fireEvent.click(screen.getByTestId("mode-plan-badge-button"));

		const dialog = screen.getByTestId("plan-dialog");
		expect(dialog).toBeDefined();
	});

	it("should render plan dialog when planPhase exists but plan is undefined", () => {
		mockHookState.activeConvoId = 1;
		mockHookState.messages = [{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" }];
		mockHookState.planPhase = "planning";
		mockHookState.mode = "plan";

		render(<AgentPage />);

		// Open via plan badge click in input area
		fireEvent.click(screen.getByTestId("mode-plan-badge-button"));

		expect(screen.getByTestId("plan-dialog")).toBeDefined();
		expect(screen.getByTestId("plan-dialog-empty")).toBeDefined();
	});

	it("should show plan toggle as muted when mode is exec", () => {
		mockHookState.activeConvoId = 1;
		mockHookState.messages = [{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" }];
		mockHookState.mode = "exec";

		render(<AgentPage />);

		const button = screen.getByTestId("plan-mode-toggle");
		expect(button.className).toContain("text-muted-foreground");
		expect(button.getAttribute("aria-pressed")).toBe("false");
	});

	it("should show plan toggle as highlighted when mode is plan", () => {
		mockHookState.activeConvoId = 1;
		mockHookState.messages = [{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" }];
		mockHookState.mode = "plan";

		render(<AgentPage />);

		const button = screen.getByTestId("plan-mode-toggle");
		expect(button.className).toContain("bg-yellow-100");
		expect(button.getAttribute("aria-pressed")).toBe("true");
	});
});
