import { AgentPlanToggle } from "./AgentPlanToggle";
import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("AgentPlanToggle", () => {
	const defaultProps = {
		mode: "plan" as const,
		planPhase: undefined as "planning" | "executing" | "complete" | undefined,
		onSetMode: vi.fn(),
		onOpenPlan: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render the Plan label on the toggle button", () => {
		render(<AgentPlanToggle {...defaultProps} />);

		const button = screen.getByTestId("plan-mode-toggle");
		expect(button.textContent).toContain("Plan");
	});

	it("should show highlighted yellow style when mode is plan", () => {
		render(<AgentPlanToggle {...defaultProps} mode="plan" />);

		const button = screen.getByTestId("plan-mode-toggle");
		expect(button.className).toContain("bg-yellow-100");
		expect(button.className).toContain("text-yellow-800");
	});

	it("should show muted style when mode is exec", () => {
		render(<AgentPlanToggle {...defaultProps} mode="exec" />);

		const button = screen.getByTestId("plan-mode-toggle");
		expect(button.className).toContain("text-muted-foreground");
		expect(button.className).not.toContain("bg-yellow-100");
	});

	it("should show muted style when mode is exec-accept-all", () => {
		render(<AgentPlanToggle {...defaultProps} mode="exec-accept-all" />);

		const button = screen.getByTestId("plan-mode-toggle");
		expect(button.className).toContain("text-muted-foreground");
		expect(button.className).not.toContain("bg-yellow-100");
	});

	it("should call onSetMode with exec when clicked in plan mode", () => {
		const onSetMode = vi.fn();
		render(<AgentPlanToggle {...defaultProps} mode="plan" onSetMode={onSetMode} />);

		fireEvent.click(screen.getByTestId("plan-mode-toggle"));

		expect(onSetMode).toHaveBeenCalledWith("exec");
	});

	it("should call onSetMode with plan when clicked in exec mode", () => {
		const onSetMode = vi.fn();
		render(<AgentPlanToggle {...defaultProps} mode="exec" onSetMode={onSetMode} />);

		fireEvent.click(screen.getByTestId("plan-mode-toggle"));

		expect(onSetMode).toHaveBeenCalledWith("plan");
	});

	it("should have aria-pressed true when mode is plan", () => {
		render(<AgentPlanToggle {...defaultProps} mode="plan" />);

		const button = screen.getByTestId("plan-mode-toggle");
		expect(button.getAttribute("aria-pressed")).toBe("true");
	});

	it("should have aria-pressed false when mode is exec", () => {
		render(<AgentPlanToggle {...defaultProps} mode="exec" />);

		const button = screen.getByTestId("plan-mode-toggle");
		expect(button.getAttribute("aria-pressed")).toBe("false");
	});

	it("should show plan phase badge when planPhase is defined", () => {
		render(<AgentPlanToggle {...defaultProps} planPhase="planning" />);

		expect(screen.getByTestId("mode-plan-badge-button")).toBeDefined();
		expect(screen.getByTestId("plan-phase-badge")).toBeDefined();
	});

	it("should not show plan phase badge when planPhase is undefined", () => {
		render(<AgentPlanToggle {...defaultProps} planPhase={undefined} />);

		expect(screen.queryByTestId("mode-plan-badge-button")).toBeNull();
	});

	it("should call onOpenPlan when plan badge is clicked", () => {
		const onOpenPlan = vi.fn();
		render(<AgentPlanToggle {...defaultProps} planPhase="executing" onOpenPlan={onOpenPlan} />);

		fireEvent.click(screen.getByTestId("mode-plan-badge-button"));

		expect(onOpenPlan).toHaveBeenCalledTimes(1);
	});

	it("should show correct phase on the badge", () => {
		render(<AgentPlanToggle {...defaultProps} planPhase="complete" />);

		const badge = screen.getByTestId("plan-phase-badge");
		expect(badge.getAttribute("data-phase")).toBe("complete");
	});
});
