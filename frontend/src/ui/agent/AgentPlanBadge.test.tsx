import { AgentPlanBadge } from "./AgentPlanBadge";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("AgentPlanBadge", () => {
	it("should render planning phase with correct label", () => {
		render(<AgentPlanBadge phase="planning" />);

		const badge = screen.getByTestId("plan-phase-badge");
		expect(badge.textContent).toBe("Planning");
		expect(badge.getAttribute("data-phase")).toBe("planning");
	});

	it("should render executing phase with correct label", () => {
		render(<AgentPlanBadge phase="executing" />);

		const badge = screen.getByTestId("plan-phase-badge");
		expect(badge.textContent).toBe("Executing");
		expect(badge.getAttribute("data-phase")).toBe("executing");
	});

	it("should render complete phase with correct label", () => {
		render(<AgentPlanBadge phase="complete" />);

		const badge = screen.getByTestId("plan-phase-badge");
		expect(badge.textContent).toBe("Complete");
		expect(badge.getAttribute("data-phase")).toBe("complete");
	});
});
