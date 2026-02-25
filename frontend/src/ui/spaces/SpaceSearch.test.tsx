import { SpaceSearch } from "./SpaceSearch";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { act } from "preact/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("SpaceSearch", () => {
	const mockOnSearch = vi.fn();
	const mockOnClear = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should render search input", () => {
		render(<SpaceSearch onSearch={mockOnSearch} onClear={mockOnClear} />);

		expect(screen.getByTestId("space-search")).toBeDefined();
		expect(screen.getByTestId("space-search-input")).toBeDefined();
	});

	it("should call onSearch with debounced query", () => {
		render(<SpaceSearch onSearch={mockOnSearch} onClear={mockOnClear} />);

		const input = screen.getByTestId("space-search-input");
		fireEvent.input(input, { target: { value: "test query" } });

		// Should not call immediately
		expect(mockOnSearch).not.toHaveBeenCalled();

		// Fast forward past debounce time
		act(() => {
			vi.advanceTimersByTime(500);
		});

		expect(mockOnSearch).toHaveBeenCalledWith("test query");
	});

	it("should show clear button when query is not empty", () => {
		render(<SpaceSearch onSearch={mockOnSearch} onClear={mockOnClear} />);

		const input = screen.getByTestId("space-search-input");

		// Initially no clear button
		expect(screen.queryByTestId("space-search-clear")).toBeNull();

		// Type something
		fireEvent.input(input, { target: { value: "test" } });

		// Clear button should appear
		expect(screen.getByTestId("space-search-clear")).toBeDefined();
	});

	it("should call onClear when clear button is clicked", () => {
		render(<SpaceSearch onSearch={mockOnSearch} onClear={mockOnClear} />);

		const input = screen.getByTestId("space-search-input");
		fireEvent.input(input, { target: { value: "test" } });

		const clearButton = screen.getByTestId("space-search-clear");
		fireEvent.click(clearButton);

		expect(mockOnClear).toHaveBeenCalled();
		expect((input as HTMLInputElement).value).toBe("");
	});

	it("should clear search on ESC key", async () => {
		render(<SpaceSearch onSearch={mockOnSearch} onClear={mockOnClear} />);

		const input = screen.getByTestId("space-search-input");
		fireEvent.input(input, { target: { value: "test" } });

		// Press ESC
		fireEvent.keyDown(window, { key: "Escape" });

		await waitFor(() => {
			expect(mockOnClear).toHaveBeenCalled();
		});
	});

	// TODO: Ctrl+F shortcut commented out - hijacks browser's native find
	// Uncomment these tests if we restore the shortcut
	// it("should handle Ctrl+F keyboard shortcut", () => {
	// 	render(<SpaceSearch onSearch={mockOnSearch} onClear={mockOnClear} />);
	// 	const input = screen.getByTestId("space-search-input") as HTMLInputElement;
	// 	fireEvent.keyDown(window, { key: "f", ctrlKey: true });
	// 	expect(input).toBeDefined();
	// });

	// it("should handle Cmd+F keyboard shortcut on Mac", () => {
	// 	render(<SpaceSearch onSearch={mockOnSearch} onClear={mockOnClear} />);
	// 	const input = screen.getByTestId("space-search-input") as HTMLInputElement;
	// 	fireEvent.keyDown(window, { key: "f", metaKey: true });
	// 	expect(input).toBeDefined();
	// });

	it("should disable input when loading", () => {
		render(<SpaceSearch onSearch={mockOnSearch} onClear={mockOnClear} loading={true} />);

		const input = screen.getByTestId("space-search-input") as HTMLInputElement;
		expect(input.disabled).toBe(true);
	});

	it("should debounce multiple rapid inputs", () => {
		render(<SpaceSearch onSearch={mockOnSearch} onClear={mockOnClear} />);

		const input = screen.getByTestId("space-search-input");

		// Type multiple characters quickly
		fireEvent.input(input, { target: { value: "t" } });
		act(() => {
			vi.advanceTimersByTime(100);
		});

		fireEvent.input(input, { target: { value: "te" } });
		act(() => {
			vi.advanceTimersByTime(100);
		});

		fireEvent.input(input, { target: { value: "tes" } });
		act(() => {
			vi.advanceTimersByTime(100);
		});

		fireEvent.input(input, { target: { value: "test" } });

		// Still should not have called onSearch
		expect(mockOnSearch).not.toHaveBeenCalled();

		// Fast forward past debounce time
		act(() => {
			vi.advanceTimersByTime(500);
		});

		// Should only be called once with final value
		expect(mockOnSearch).toHaveBeenCalledTimes(1);
		expect(mockOnSearch).toHaveBeenCalledWith("test");
	});
});
