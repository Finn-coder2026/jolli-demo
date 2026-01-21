import { SuccessScreen } from "./SuccessScreen";
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		successTitle: "All Set!",
		successMessage: "Your integration has been successfully configured",
		goToDashboard: "Go to Dashboard",
	}),
}));

describe("SuccessScreen", () => {
	it("should render default title and message from intlayer", () => {
		const mockOnFinish = vi.fn();
		render(<SuccessScreen onFinish={mockOnFinish} />);

		expect(screen.getByText("All Set!")).toBeDefined();
		expect(screen.getByText("Your integration has been successfully configured")).toBeDefined();
	});

	it("should render custom title when provided", () => {
		const mockOnFinish = vi.fn();
		render(<SuccessScreen onFinish={mockOnFinish} title="Custom Success!" />);

		expect(screen.getByText("Custom Success!")).toBeDefined();
	});

	it("should render custom message when provided", () => {
		const mockOnFinish = vi.fn();
		render(<SuccessScreen onFinish={mockOnFinish} message="Everything is working perfectly" />);

		expect(screen.getByText("Everything is working perfectly")).toBeDefined();
	});

	it("should call onFinish when button is clicked", () => {
		const mockOnFinish = vi.fn();
		render(<SuccessScreen onFinish={mockOnFinish} />);

		const button = screen.getByText("Go to Dashboard");
		fireEvent.click(button);

		expect(mockOnFinish).toHaveBeenCalledTimes(1);
	});

	it("should display success icon", () => {
		const mockOnFinish = vi.fn();
		const { container } = render(<SuccessScreen onFinish={mockOnFinish} />);

		const icon = container.querySelector('svg[data-lucide-icon="Check"]');
		expect(icon).toBeDefined();
	});

	it("should render with both custom title and message", () => {
		const mockOnFinish = vi.fn();
		render(<SuccessScreen onFinish={mockOnFinish} title="Done!" message="Setup complete" />);

		expect(screen.getByText("Done!")).toBeDefined();
		expect(screen.getByText("Setup complete")).toBeDefined();
	});
});
