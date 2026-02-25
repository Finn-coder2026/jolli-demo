import { UserContextDialog } from "./UserContextDialog";
import { render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Helper to create intlayer-like values
function createMockIntlayerValue(str: string) {
	// biome-ignore lint/style/useConsistentBuiltinInstantiation: Mock helper
	// biome-ignore lint/suspicious/noExplicitAny: Mock helper
	const val = new String(str) as any;
	val.value = str;
	return val;
}

// Mock react-intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		userContext: createMockIntlayerValue("User Context"),
		userContextDescription: createMockIntlayerValue("Current Agent Hub context state for debugging"),
		contextActive: createMockIntlayerValue("Active"),
		contextConversationId: createMockIntlayerValue("Conversation ID"),
		contextNone: createMockIntlayerValue("none"),
	}),
}));

// Mock useCurrentUser to control state
const mockSetAgentHubConversation = vi.fn();
const mockMarkAgentNavigating = vi.fn();
const mockDeactivateAgentHub = vi.fn();
const mockClearContext = vi.fn();

let mockUserContext = {
	agentHubContext: undefined as { conversationId?: number; active: boolean } | undefined,
};

vi.mock("../../contexts/CurrentUserContext", () => ({
	useCurrentUser: () => ({
		userContext: mockUserContext,
		setAgentHubConversation: mockSetAgentHubConversation,
		markAgentNavigating: mockMarkAgentNavigating,
		deactivateAgentHub: mockDeactivateAgentHub,
		clearContext: mockClearContext,
	}),
}));

// Mock Dialog components to render simple HTML for testing
vi.mock("../../components/ui/Dialog", () => ({
	Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
	DialogContent: ({ children, ...props }: { children: React.ReactNode; "data-testid"?: string }) => (
		<div data-testid={props["data-testid"]}>{children}</div>
	),
	DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
	DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

describe("UserContextDialog", () => {
	const mockOnOpenChange = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		mockUserContext = { agentHubContext: undefined };
	});

	it("should render dialog with default inactive state", () => {
		render(<UserContextDialog open={true} onOpenChange={mockOnOpenChange} />);

		expect(screen.getByTestId("user-context-dialog")).toBeDefined();
		expect(screen.getByTestId("context-active").textContent).toContain("false");
		expect(screen.getByTestId("context-conversation-id").textContent).toContain("none");
	});

	it("should render active state with conversation ID", () => {
		mockUserContext = {
			agentHubContext: { conversationId: 42, active: true },
		};

		render(<UserContextDialog open={true} onOpenChange={mockOnOpenChange} />);

		expect(screen.getByTestId("context-active").textContent).toContain("true");
		expect(screen.getByTestId("context-conversation-id").textContent).toContain("42");
	});

	it("should render inactive state with preserved conversation ID", () => {
		mockUserContext = {
			agentHubContext: { conversationId: 7, active: false },
		};

		render(<UserContextDialog open={true} onOpenChange={mockOnOpenChange} />);

		expect(screen.getByTestId("context-active").textContent).toContain("false");
		expect(screen.getByTestId("context-conversation-id").textContent).toContain("7");
	});

	it("should not render content when dialog is closed", () => {
		render(<UserContextDialog open={false} onOpenChange={mockOnOpenChange} />);

		expect(screen.queryByTestId("user-context-dialog")).toBeNull();
	});
});
