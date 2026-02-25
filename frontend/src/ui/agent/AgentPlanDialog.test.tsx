import { AgentPlanDialog } from "./AgentPlanDialog";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

// Mock MarkdownContent to avoid markdown-to-jsx / Preact VNode conflicts in tests
vi.mock("../../components/MarkdownContent", () => ({
	MarkdownContent: ({ children }: { children: string }) => <div data-testid="markdown-content">{children}</div>,
}));

describe("AgentPlanDialog", () => {
	const defaultProps = {
		open: true,
		onOpenChange: vi.fn(),
		plan: "# My Plan\n\n- Step 1\n- Step 2",
		phase: "planning" as const,
	};

	it("should render the dialog when open", () => {
		render(<AgentPlanDialog {...defaultProps} />);

		expect(screen.getByTestId("plan-dialog")).toBeDefined();
	});

	it("should display the plan markdown content", () => {
		render(<AgentPlanDialog {...defaultProps} />);

		expect(screen.getByTestId("plan-dialog-content")).toBeDefined();
		expect(screen.getByTestId("markdown-content").textContent).toContain("# My Plan");
	});

	it("should show the phase badge", () => {
		render(<AgentPlanDialog {...defaultProps} />);

		expect(screen.getByTestId("plan-phase-badge")).toBeDefined();
		expect(screen.getByTestId("plan-phase-badge").getAttribute("data-phase")).toBe("planning");
	});

	it("should show the dialog title", () => {
		render(<AgentPlanDialog {...defaultProps} />);

		const dialog = screen.getByTestId("plan-dialog");
		expect(dialog.textContent).toContain("Agent Plan");
	});

	it("should render with executing phase", () => {
		render(<AgentPlanDialog {...defaultProps} phase="executing" />);

		expect(screen.getByTestId("plan-phase-badge").getAttribute("data-phase")).toBe("executing");
	});

	it("should render with complete phase", () => {
		render(<AgentPlanDialog {...defaultProps} phase="complete" />);

		expect(screen.getByTestId("plan-phase-badge").getAttribute("data-phase")).toBe("complete");
	});

	it("should show placeholder when plan is undefined", () => {
		render(<AgentPlanDialog {...defaultProps} plan={undefined} />);

		expect(screen.getByTestId("plan-dialog-empty")).toBeDefined();
		expect(screen.queryByTestId("plan-dialog-content")).toBeNull();
	});
});
