import type { ConvoDateGroup } from "../../util/ConvoDateGroupUtil";
import { AgentSidebar } from "./AgentSidebar";
import { render, screen } from "@testing-library/preact";
import type { AgentPlanPhase } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock MarkdownContent to avoid markdown-to-jsx / Preact VNode conflicts in tests
vi.mock("../../components/MarkdownContent", () => ({
	MarkdownContent: ({ children }: { children: string }) => <div data-testid="markdown-content">{children}</div>,
}));

describe("AgentSidebar", () => {
	const defaultProps = {
		groups: [] as ReadonlyArray<ConvoDateGroup>,
		activeConvoId: undefined as number | undefined,
		planPhase: undefined as AgentPlanPhase | undefined,
		plan: undefined as string | undefined,
		onNewChat: vi.fn(),
		onSelectConvo: vi.fn(),
		onDeleteConvo: vi.fn(),
		onOpenPlan: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render sidebar with new chat button", () => {
		render(<AgentSidebar {...defaultProps} />);

		expect(screen.getByTestId("agent-sidebar")).toBeDefined();
		expect(screen.getByTestId("new-chat-button")).toBeDefined();
		expect(screen.getByTestId("new-chat-button").textContent).toContain("New Chat");
	});

	it("should call onNewChat when new chat button is clicked", () => {
		render(<AgentSidebar {...defaultProps} />);

		screen.getByTestId("new-chat-button").click();

		expect(defaultProps.onNewChat).toHaveBeenCalledTimes(1);
	});

	it("should render conversation groups with labels", () => {
		const groups: ReadonlyArray<ConvoDateGroup> = [
			{
				label: "Today",
				convos: [
					{ id: 1, title: "Chat about React", convoKind: undefined, updatedAt: "2026-02-11T10:00:00Z" },
					{ id: 2, title: "Chat about TypeScript", convoKind: undefined, updatedAt: "2026-02-11T09:00:00Z" },
				],
			},
			{
				label: "Yesterday",
				convos: [{ id: 3, title: "Old chat", convoKind: undefined, updatedAt: "2026-02-10T15:00:00Z" }],
			},
		];

		const { container } = render(<AgentSidebar {...defaultProps} groups={groups} />);

		// Should render group headers
		const headers = container.querySelectorAll("h3");
		expect(headers).toHaveLength(2);
		expect(headers[0].textContent).toBe("Today");
		expect(headers[1].textContent).toBe("Yesterday");

		// Should render conversation items
		const items = screen.getAllByTestId("convo-item");
		expect(items).toHaveLength(3);
	});

	it("should show conversation titles", () => {
		const groups: ReadonlyArray<ConvoDateGroup> = [
			{
				label: "Today",
				convos: [{ id: 1, title: "My Chat", convoKind: undefined, updatedAt: "2026-02-11T10:00:00Z" }],
			},
		];

		render(<AgentSidebar {...defaultProps} groups={groups} />);

		const item = screen.getByTestId("convo-item-button");
		expect(item.textContent).toBe("My Chat");
	});

	it("should show untitled label for conversations without title", () => {
		const groups: ReadonlyArray<ConvoDateGroup> = [
			{
				label: "Today",
				convos: [{ id: 1, title: undefined, convoKind: undefined, updatedAt: "2026-02-11T10:00:00Z" }],
			},
		];

		render(<AgentSidebar {...defaultProps} groups={groups} />);

		const item = screen.getByTestId("convo-item-button");
		expect(item.textContent).toBe("Untitled conversation");
	});

	it("should call onSelectConvo when a conversation is clicked", () => {
		const groups: ReadonlyArray<ConvoDateGroup> = [
			{
				label: "Today",
				convos: [{ id: 42, title: "Chat", convoKind: undefined, updatedAt: "2026-02-11T10:00:00Z" }],
			},
		];

		render(<AgentSidebar {...defaultProps} groups={groups} />);

		screen.getByTestId("convo-item-button").click();

		expect(defaultProps.onSelectConvo).toHaveBeenCalledWith(42);
	});

	it("should highlight active conversation", () => {
		const groups: ReadonlyArray<ConvoDateGroup> = [
			{
				label: "Today",
				convos: [
					{ id: 1, title: "Active", convoKind: undefined, updatedAt: "2026-02-11T10:00:00Z" },
					{ id: 2, title: "Inactive", convoKind: undefined, updatedAt: "2026-02-11T09:00:00Z" },
				],
			},
		];

		render(<AgentSidebar {...defaultProps} groups={groups} activeConvoId={1} />);

		const items = screen.getAllByTestId("convo-item");
		expect(items[0].getAttribute("data-active")).toBe("true");
		expect(items[1].getAttribute("data-active")).toBe("false");
	});

	it("should render empty state when no groups", () => {
		render(<AgentSidebar {...defaultProps} groups={[]} />);

		expect(screen.getByTestId("agent-sidebar")).toBeDefined();
		expect(screen.queryByTestId("convo-item")).toBeNull();
	});

	it("should render the dropdown menu trigger for conversations", () => {
		const groups: ReadonlyArray<ConvoDateGroup> = [
			{
				label: "Today",
				convos: [{ id: 1, title: "Chat", convoKind: undefined, updatedAt: "2026-02-11T10:00:00Z" }],
			},
		];

		render(<AgentSidebar {...defaultProps} groups={groups} />);

		expect(screen.getByTestId("convo-menu-trigger")).toBeDefined();
	});

	it("should render Sparkles icon for getting_started conversations", () => {
		const groups: ReadonlyArray<ConvoDateGroup> = [
			{
				label: "Today",
				convos: [
					{
						id: 1,
						title: "Getting Started",
						convoKind: "getting_started",
						updatedAt: "2026-02-11T10:00:00Z",
					},
					{ id: 2, title: "Regular Chat", convoKind: undefined, updatedAt: "2026-02-11T09:00:00Z" },
				],
			},
		];

		render(<AgentSidebar {...defaultProps} groups={groups} />);

		// The getting_started convo should have a Sparkles icon (svg inside the button)
		const buttons = screen.getAllByTestId("convo-item-button");
		const sparklesSvgs = buttons[0].querySelectorAll("svg");
		expect(sparklesSvgs.length).toBeGreaterThan(0);

		// The regular convo should NOT have a Sparkles icon
		const regularSvgs = buttons[1].querySelectorAll("svg");
		expect(regularSvgs.length).toBe(0);
	});

	it("should render plan section when planPhase is set", () => {
		render(<AgentSidebar {...defaultProps} planPhase="planning" />);

		expect(screen.getByTestId("plan-section")).toBeDefined();
	});

	it("should not render plan section when planPhase is undefined", () => {
		render(<AgentSidebar {...defaultProps} />);

		expect(screen.queryByTestId("plan-section")).toBeNull();
	});

	it("should call onOpenPlan when plan maximize button is clicked", () => {
		const onOpenPlan = vi.fn();
		render(<AgentSidebar {...defaultProps} planPhase="executing" onOpenPlan={onOpenPlan} />);

		screen.getByTestId("plan-maximize-button").click();

		expect(onOpenPlan).toHaveBeenCalledTimes(1);
	});
});
