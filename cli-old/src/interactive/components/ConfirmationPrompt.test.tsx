/**
 * @vitest-environment jsdom
 */
import { ConfirmationPrompt } from "./ConfirmationPrompt";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock ink-select-input
vi.mock("ink-select-input", () => ({
	default: ({
		items,
		onSelect,
	}: {
		items: Array<{ label: string; value: string }>;
		onSelect: (item: { value: string }) => void;
	}) => {
		return (
			<div data-testid="select-input">
				{items.map(item => (
					<button
						key={item.value}
						data-testid={`select-${item.value}`}
						onClick={() => onSelect(item)}
						type="button"
					>
						{item.label}
					</button>
				))}
			</div>
		);
	},
}));

// Mock ink-spinner
vi.mock("ink-spinner", () => ({
	default: () => <span data-testid="spinner">...</span>,
}));

describe("ConfirmationPrompt", () => {
	const mockOnConfirm = vi.fn();

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should render confirmation title", () => {
		const { getByText } = render(
			<ConfirmationPrompt message="Are you sure?" onConfirm={mockOnConfirm} loading={false} />,
		);

		expect(getByText("Confirmation Required")).toBeDefined();
	});

	it("should render confirmation message", () => {
		const { getByText } = render(
			<ConfirmationPrompt
				message="Are you sure you want to continue?"
				onConfirm={mockOnConfirm}
				loading={false}
			/>,
		);

		expect(getByText("Are you sure you want to continue?")).toBeDefined();
	});

	it("should render Yes and No options when not loading", () => {
		const { getByText } = render(
			<ConfirmationPrompt message="Are you sure?" onConfirm={mockOnConfirm} loading={false} />,
		);

		expect(getByText("Yes")).toBeDefined();
		expect(getByText("No")).toBeDefined();
	});

	it("should call onConfirm(true) when Yes is selected", () => {
		const { getByTestId } = render(
			<ConfirmationPrompt message="Are you sure?" onConfirm={mockOnConfirm} loading={false} />,
		);

		const yesButton = getByTestId("select-yes");
		yesButton.click();

		expect(mockOnConfirm).toHaveBeenCalledWith(true);
	});

	it("should call onConfirm(false) when No is selected", () => {
		const { getByTestId } = render(
			<ConfirmationPrompt message="Are you sure?" onConfirm={mockOnConfirm} loading={false} />,
		);

		const noButton = getByTestId("select-no");
		noButton.click();

		expect(mockOnConfirm).toHaveBeenCalledWith(false);
	});

	it("should show loading spinner when loading is true", () => {
		const { getByText, getByTestId } = render(
			<ConfirmationPrompt message="Are you sure?" onConfirm={mockOnConfirm} loading={true} />,
		);

		expect(getByTestId("spinner")).toBeDefined();
		expect(getByText("Processing...")).toBeDefined();
	});

	it("should not show Yes/No options when loading", () => {
		const { queryByText } = render(
			<ConfirmationPrompt message="Are you sure?" onConfirm={mockOnConfirm} loading={true} />,
		);

		// Yes and No should not be present during loading
		expect(queryByText("Yes")).toBeNull();
		expect(queryByText("No")).toBeNull();
	});

	it("should display error message when error is provided", () => {
		const { getByText } = render(
			<ConfirmationPrompt
				message="Are you sure?"
				onConfirm={mockOnConfirm}
				loading={false}
				error="Something went wrong"
			/>,
		);

		expect(getByText(/Error: Something went wrong/)).toBeDefined();
	});

	it("should handle null error gracefully", () => {
		const { queryByText } = render(
			<ConfirmationPrompt message="Are you sure?" onConfirm={mockOnConfirm} loading={false} error={null} />,
		);

		expect(queryByText(/Error:/)).toBeNull();
	});

	it("should handle undefined error gracefully", () => {
		const { queryByText } = render(
			<ConfirmationPrompt message="Are you sure?" onConfirm={mockOnConfirm} loading={false} />,
		);

		expect(queryByText(/Error:/)).toBeNull();
	});
});
