import { AgentConfirmationCard } from "./AgentConfirmationCard";
import { render, screen } from "@testing-library/preact";
import type { PendingConfirmation } from "jolli-common";
import { describe, expect, it, vi } from "vitest";

describe("AgentConfirmationCard", () => {
	const defaultConfirmation: PendingConfirmation = {
		confirmationId: "conf_123",
		toolName: "create_folder",
		toolArgs: { name: "Docs", spaceId: "space_1" },
		description: "Create folder 'Docs' in space 'Engineering'",
	};

	it("renders the confirmation card with description", () => {
		render(<AgentConfirmationCard confirmation={defaultConfirmation} onApprove={vi.fn()} onDeny={vi.fn()} />);

		expect(screen.getByTestId("confirmation-card")).toBeDefined();
		expect(screen.getByTestId("confirmation-description").textContent).toContain(
			"Create folder 'Docs' in space 'Engineering'",
		);
	});

	it("renders Confirm action title", () => {
		render(<AgentConfirmationCard confirmation={defaultConfirmation} onApprove={vi.fn()} onDeny={vi.fn()} />);

		expect(screen.getByTestId("confirmation-title").textContent).toContain("Confirm action");
	});

	it("renders approve and deny buttons", () => {
		render(<AgentConfirmationCard confirmation={defaultConfirmation} onApprove={vi.fn()} onDeny={vi.fn()} />);

		expect(screen.getByTestId("confirmation-approve")).toBeDefined();
		expect(screen.getByTestId("confirmation-deny")).toBeDefined();
	});

	it("calls onApprove with confirmationId when approve is clicked", () => {
		const onApprove = vi.fn();
		render(<AgentConfirmationCard confirmation={defaultConfirmation} onApprove={onApprove} onDeny={vi.fn()} />);

		screen.getByTestId("confirmation-approve").click();

		expect(onApprove).toHaveBeenCalledWith("conf_123");
	});

	it("calls onDeny with confirmationId when deny is clicked", () => {
		const onDeny = vi.fn();
		render(<AgentConfirmationCard confirmation={defaultConfirmation} onApprove={vi.fn()} onDeny={onDeny} />);

		screen.getByTestId("confirmation-deny").click();

		expect(onDeny).toHaveBeenCalledWith("conf_123");
	});

	it("sets data-confirmation-id attribute", () => {
		render(<AgentConfirmationCard confirmation={defaultConfirmation} onApprove={vi.fn()} onDeny={vi.fn()} />);

		expect(screen.getByTestId("confirmation-card").getAttribute("data-confirmation-id")).toBe("conf_123");
	});
});
