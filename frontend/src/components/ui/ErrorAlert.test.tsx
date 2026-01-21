import { ErrorAlert } from "./ErrorAlert";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("ErrorAlert", () => {
	it("should render error message", () => {
		render(<ErrorAlert message="Something went wrong" />);

		expect(screen.getByText("Something went wrong")).toBeDefined();
	});

	it("should display AlertCircle icon", () => {
		const { container } = render(<ErrorAlert message="Test error" />);

		const icon = container.querySelector('svg[data-lucide-icon="AlertCircle"]');
		expect(icon).toBeDefined();
	});

	it("should have proper styling classes", () => {
		const { container } = render(<ErrorAlert message="Error message" />);

		const alertDiv = container.querySelector(".bg-red-50");
		expect(alertDiv).toBeDefined();
		expect(alertDiv?.classList.contains("border-red-200")).toBe(true);
	});

	it("should render with different error messages", () => {
		const { rerender } = render(<ErrorAlert message="First error" />);
		expect(screen.getByText("First error")).toBeDefined();

		rerender(<ErrorAlert message="Second error" />);
		expect(screen.getByText("Second error")).toBeDefined();
	});
});
