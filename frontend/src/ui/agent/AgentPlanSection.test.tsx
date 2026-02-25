import { AgentPlanSection } from "./AgentPlanSection";
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

// Mock MarkdownContent to avoid markdown-to-jsx / Preact VNode conflicts in tests
vi.mock("../../components/MarkdownContent", () => ({
	MarkdownContent: ({ children }: { children: string }) => <div data-testid="markdown-content">{children}</div>,
}));

describe("AgentPlanSection", () => {
	const defaultProps = {
		phase: "planning" as const,
		plan: "# Step 1\nDo something" as string | undefined,
		onOpenPlan: vi.fn(),
	};

	it("should return null when phase is undefined", () => {
		const { container } = render(<AgentPlanSection {...defaultProps} phase={undefined} />);

		expect(container.innerHTML).toBe("");
	});

	it("should render plan section when phase is set", () => {
		render(<AgentPlanSection {...defaultProps} />);

		expect(screen.getByTestId("plan-section")).toBeDefined();
	});

	it("should show the phase badge when phase exists", () => {
		render(<AgentPlanSection {...defaultProps} />);

		expect(screen.getByTestId("plan-phase-badge")).toBeDefined();
	});

	it("should show accordion header with plan label, phase badge, and chevron", () => {
		render(<AgentPlanSection {...defaultProps} />);

		const toggle = screen.getByTestId("plan-toggle-button");
		expect(toggle.textContent).toContain("Agent Plan");
		expect(screen.getByTestId("plan-phase-badge")).toBeDefined();
	});

	it("should auto-expand when phase is set", () => {
		render(<AgentPlanSection {...defaultProps} />);

		// useEffect auto-sets expanded=true when phase transitions to defined
		expect(screen.getByTestId("plan-inline-content")).toBeDefined();
	});

	it("should collapse when toggle is clicked", () => {
		render(<AgentPlanSection {...defaultProps} />);

		// Initially expanded (auto-expand via useEffect)
		expect(screen.getByTestId("plan-inline-content")).toBeDefined();
		expect(screen.getByTestId("plan-maximize-button")).toBeDefined();

		// Click toggle to collapse — use fireEvent for proper state batching in Preact
		fireEvent.click(screen.getByTestId("plan-toggle-button"));

		expect(screen.queryByTestId("plan-inline-content")).toBeNull();
		expect(screen.queryByTestId("plan-maximize-button")).toBeNull();
	});

	it("should expand again when toggle is clicked after collapsing", () => {
		render(<AgentPlanSection {...defaultProps} />);

		// Collapse
		fireEvent.click(screen.getByTestId("plan-toggle-button"));
		expect(screen.queryByTestId("plan-inline-content")).toBeNull();

		// Expand
		fireEvent.click(screen.getByTestId("plan-toggle-button"));
		expect(screen.getByTestId("plan-inline-content")).toBeDefined();
	});

	it("should show maximize button that calls onOpenPlan", () => {
		const onOpenPlan = vi.fn();
		render(<AgentPlanSection {...defaultProps} onOpenPlan={onOpenPlan} />);

		const maxBtn = screen.getByTestId("plan-maximize-button");
		expect(maxBtn).toBeDefined();

		fireEvent.click(maxBtn);

		expect(onOpenPlan).toHaveBeenCalledTimes(1);
	});

	it("should show markdown content when plan is present and expanded", () => {
		render(<AgentPlanSection {...defaultProps} />);

		expect(screen.getByTestId("markdown-content")).toBeDefined();
		expect(screen.getByTestId("markdown-content").textContent).toContain("Step 1");
	});

	it("should show empty placeholder when plan is undefined and expanded", () => {
		render(<AgentPlanSection {...defaultProps} plan={undefined} />);

		expect(screen.getByTestId("plan-inline-empty")).toBeDefined();
		expect(screen.queryByTestId("markdown-content")).toBeNull();
	});

	it("should render with executing phase", () => {
		render(<AgentPlanSection {...defaultProps} phase="executing" />);

		expect(screen.getByTestId("plan-phase-badge").getAttribute("data-phase")).toBe("executing");
	});

	it("should render with complete phase", () => {
		render(<AgentPlanSection {...defaultProps} phase="complete" />);

		expect(screen.getByTestId("plan-phase-badge").getAttribute("data-phase")).toBe("complete");
	});
});
