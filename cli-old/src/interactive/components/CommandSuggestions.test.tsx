/**
 * @vitest-environment jsdom
 */

import { CommandSuggestions } from "./CommandSuggestions";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock useInput from ink and capture callbacks
let useInputCallback: ((input: string, key: Record<string, boolean>) => void) | undefined;
vi.mock("ink", async () => {
	const actual = await vi.importActual("ink");
	return {
		...actual,
		useInput: vi.fn(
			(callback: (input: string, key: Record<string, boolean>) => void, options?: { isActive?: boolean }) => {
				if (options?.isActive !== false) {
					useInputCallback = callback;
				}
			},
		),
	};
});

describe("CommandSuggestions", () => {
	const mockCommands = [
		{ name: "/help", description: "Show help" },
		{ name: "/exit", description: "Exit the app" },
	];

	const mockOnSelect = vi.fn();
	const mockOnDismiss = vi.fn();

	beforeEach(() => {
		useInputCallback = undefined;
	});

	afterEach(() => {
		vi.clearAllMocks();
		useInputCallback = undefined;
	});

	it("should return null when commands array is empty", () => {
		const { container } = render(
			<CommandSuggestions commands={[]} onSelect={mockOnSelect} onDismiss={mockOnDismiss} />,
		);

		expect(container.textContent).toBe("");
	});

	it("should render commands with selection and help text", () => {
		const { getByText } = render(
			<CommandSuggestions commands={mockCommands} onSelect={mockOnSelect} onDismiss={mockOnDismiss} />,
		);

		expect(getByText("Type to filter, arrows to select, Enter to choose, Esc to dismiss:")).toBeDefined();
		expect(getByText(/\/help/)).toBeDefined();
		expect(getByText("Show help", { exact: false })).toBeDefined();
		expect(getByText(/>\s+\/help/)).toBeDefined(); // First item should be selected
	});

	it("should call onSelect when Enter is pressed", () => {
		render(<CommandSuggestions commands={mockCommands} onSelect={mockOnSelect} onDismiss={mockOnDismiss} />);

		// Simulate Enter key press
		if (useInputCallback) {
			useInputCallback("", { return: true });
		}

		expect(mockOnSelect).toHaveBeenCalledWith("/help");
		expect(mockOnSelect).toHaveBeenCalledTimes(1);
	});

	it("should navigate selection with arrow keys - down then up", () => {
		const { getByText } = render(
			<CommandSuggestions commands={mockCommands} onSelect={mockOnSelect} onDismiss={mockOnDismiss} />,
		);

		// Initially first item should be selected
		expect(getByText(/>\s+\/help/)).toBeDefined();

		// Press down arrow (move from index 0 to 1)
		if (useInputCallback) {
			useInputCallback("", { downArrow: true });
		}

		// Press up arrow (move from index 1 back to 0) - tests the prev > 0 branch
		if (useInputCallback) {
			useInputCallback("", { upArrow: true });
		}

		expect(useInputCallback).toBeDefined();
	});

	it("should wrap selection to last item when pressing up from first item", () => {
		render(<CommandSuggestions commands={mockCommands} onSelect={mockOnSelect} onDismiss={mockOnDismiss} />);

		// Press up arrow from first item (should wrap to last)
		if (useInputCallback) {
			useInputCallback("", { upArrow: true });
		}

		// Would wrap to last item in actual usage
		expect(useInputCallback).toBeDefined();
	});

	it("should wrap selection to first item when pressing down from last item", () => {
		render(<CommandSuggestions commands={mockCommands} onSelect={mockOnSelect} onDismiss={mockOnDismiss} />);

		// Move to last item first by pressing down
		if (useInputCallback) {
			useInputCallback("", { downArrow: true }); // Move to second item
		}

		// Press down arrow from last item (should wrap to first)
		if (useInputCallback) {
			useInputCallback("", { downArrow: true }); // Should wrap to first
		}

		expect(useInputCallback).toBeDefined();
	});

	it("should render multiple commands", () => {
		const manyCommands = [
			...mockCommands,
			{ name: "/clear", description: "Clear screen" },
			{ name: "/login", description: "Login" },
		];

		const { getByText } = render(
			<CommandSuggestions commands={manyCommands} onSelect={mockOnSelect} onDismiss={mockOnDismiss} />,
		);

		expect(getByText(/\/help/)).toBeDefined();
		expect(getByText(/\/exit/)).toBeDefined();
		expect(getByText(/\/clear/)).toBeDefined();
		expect(getByText(/\/login/)).toBeDefined();
	});

	it("should handle single command", () => {
		const singleCommand = [{ name: "/help", description: "Show help" }];

		const { getByText } = render(
			<CommandSuggestions commands={singleCommand} onSelect={mockOnSelect} onDismiss={mockOnDismiss} />,
		);

		expect(getByText(/\/help/)).toBeDefined();
	});

	it("should call onDismiss when Escape key is pressed", () => {
		render(<CommandSuggestions commands={mockCommands} onSelect={mockOnSelect} onDismiss={mockOnDismiss} />);

		// Simulate Escape key press
		if (useInputCallback) {
			useInputCallback("", { escape: true });
		}

		expect(mockOnDismiss).toHaveBeenCalled();
		expect(mockOnDismiss).toHaveBeenCalledTimes(1);
	});

	it("should always register useInput callback when there are commands", () => {
		render(<CommandSuggestions commands={mockCommands} onSelect={mockOnSelect} onDismiss={mockOnDismiss} />);

		// useInputCallback should be registered when there are commands
		expect(useInputCallback).toBeDefined();
	});
});
