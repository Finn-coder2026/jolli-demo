/**
 * @vitest-environment jsdom
 */
import { AdminUtilitiesList } from "./AdminUtilitiesList";
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
				<div data-testid="items-count">{items.length}</div>
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

describe("AdminUtilitiesList", () => {
	const mockOnSelect = vi.fn();
	const mockOnBack = vi.fn();

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should render admin utilities title", () => {
		const { getByText } = render(<AdminUtilitiesList onSelect={mockOnSelect} onBack={mockOnBack} />);

		expect(getByText("Admin Utilities")).toBeDefined();
	});

	it("should render Clear all articles option", () => {
		const { getByText } = render(<AdminUtilitiesList onSelect={mockOnSelect} onBack={mockOnBack} />);

		expect(getByText("Clear all articles")).toBeDefined();
	});

	it("should render Back to Chat option", () => {
		const { getByText } = render(<AdminUtilitiesList onSelect={mockOnSelect} onBack={mockOnBack} />);

		expect(getByText(/Back to Chat/)).toBeDefined();
	});

	it("should call onSelect when Clear all articles is selected", () => {
		const { getByTestId } = render(<AdminUtilitiesList onSelect={mockOnSelect} onBack={mockOnBack} />);

		const clearButton = getByTestId("select-clear-all-articles");
		clearButton.click();

		expect(mockOnSelect).toHaveBeenCalledWith("clear-all-articles");
		expect(mockOnBack).not.toHaveBeenCalled();
	});

	it("should call onBack when Back to Chat is selected", () => {
		const { getByTestId } = render(<AdminUtilitiesList onSelect={mockOnSelect} onBack={mockOnBack} />);

		const backButton = getByTestId("select-back");
		backButton.click();

		expect(mockOnBack).toHaveBeenCalled();
		expect(mockOnSelect).not.toHaveBeenCalled();
	});

	it("should render correct number of items", () => {
		const { getByTestId } = render(<AdminUtilitiesList onSelect={mockOnSelect} onBack={mockOnBack} />);

		// Should have 2 items: clear-all-articles and back
		expect(getByTestId("items-count").textContent).toBe("2");
	});
});
