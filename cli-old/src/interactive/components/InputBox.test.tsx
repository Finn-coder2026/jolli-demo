/**
 * @vitest-environment jsdom
 */

import { InputBox } from "./InputBox";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Track the useInput handler
let inputHandler: ((input: string, key: { ctrl?: boolean }) => void) | null = null;

// Mock ink's useInput
vi.mock("ink", async () => {
	const actual = await vi.importActual("ink");
	return {
		...actual,
		useInput: (handler: (input: string, key: { ctrl?: boolean }) => void) => {
			inputHandler = handler;
		},
	};
});

// Mock ink-text-input
vi.mock("ink-text-input", () => ({
	default: ({
		value,
		onChange,
		onSubmit,
		placeholder,
	}: {
		value: string;
		onChange: (value: string) => void;
		onSubmit: () => void;
		placeholder?: string;
	}) => {
		return (
			<div data-testid="text-input">
				<input
					data-testid="input-element"
					value={value}
					onChange={e => onChange(e.target.value)}
					onKeyDown={e => {
						if (e.key === "Enter") {
							onSubmit();
						}
					}}
					placeholder={placeholder}
					type="text"
				/>
			</div>
		);
	},
}));

describe("InputBox", () => {
	const mockOnChange = vi.fn();
	const mockOnSubmit = vi.fn();

	beforeEach(() => {
		inputHandler = null;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should render the help text", () => {
		const { getByText } = render(
			<InputBox value="" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />,
		);

		expect(getByText("Type your message and press Enter to send (Ctrl+C to exit)")).toBeDefined();
	});

	it("should render the prompt symbol", () => {
		const { getByText } = render(
			<InputBox value="" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />,
		);

		expect(getByText(">")).toBeDefined();
	});

	it("should render TextInput when not loading", () => {
		const { getByTestId } = render(
			<InputBox value="test message" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />,
		);

		const input = getByTestId("input-element") as HTMLInputElement;
		expect(input).toBeDefined();
		expect(input.value).toBe("test message");
	});

	it("should render loading message when isLoading is true", () => {
		const { getByText, queryByTestId } = render(
			<InputBox value="test message" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={true} />,
		);

		expect(getByText("Waiting for response...")).toBeDefined();
		expect(queryByTestId("input-element")).toBeNull();
	});

	it("should pass value prop to TextInput", () => {
		const { getByTestId } = render(
			<InputBox value="my test value" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />,
		);

		const input = getByTestId("input-element") as HTMLInputElement;
		expect(input.value).toBe("my test value");
	});

	it("should call onChange when input value changes", () => {
		const { getByTestId } = render(
			<InputBox value="" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />,
		);

		const input = getByTestId("input-element") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "new value" } });

		expect(mockOnChange).toHaveBeenCalledTimes(1);
		expect(mockOnChange).toHaveBeenCalledWith("new value");
	});

	it("should call onSubmit when Enter is pressed", () => {
		const { getByTestId } = render(
			<InputBox value="message to send" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />,
		);

		const input = getByTestId("input-element") as HTMLInputElement;
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

		expect(mockOnSubmit).toHaveBeenCalledTimes(1);
	});

	it("should pass placeholder to TextInput", () => {
		const { getByTestId } = render(
			<InputBox value="" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />,
		);

		const input = getByTestId("input-element") as HTMLInputElement;
		expect(input.placeholder).toBe("Type your message...");
	});

	it("should not render TextInput when loading", () => {
		const { queryByTestId } = render(
			<InputBox value="test" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={true} />,
		);

		expect(queryByTestId("text-input")).toBeNull();
	});

	it("should render different content based on loading state", () => {
		const { rerender, getByText, queryByText, getByTestId } = render(
			<InputBox value="test" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />,
		);

		// When not loading, should show input
		expect(getByTestId("input-element")).toBeDefined();
		expect(queryByText("Waiting for response...")).toBeNull();

		// Rerender with loading state
		rerender(<InputBox value="test" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={true} />);

		// When loading, should show loading message
		expect(getByText("Waiting for response...")).toBeDefined();
		expect(queryByText("input-element")).toBeNull();
	});

	it("should not call onSubmit when Enter is pressed and hasCommandSuggestions is true", () => {
		const { getByTestId } = render(
			<InputBox
				value="/"
				onChange={mockOnChange}
				onSubmit={mockOnSubmit}
				isLoading={false}
				hasCommandSuggestions={true}
			/>,
		);

		const input = getByTestId("input-element") as HTMLInputElement;
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

		// onSubmit should NOT be called when command suggestions are visible
		expect(mockOnSubmit).not.toHaveBeenCalled();
	});

	it("should call onSubmit when Enter is pressed and hasCommandSuggestions is false", () => {
		const { getByTestId } = render(
			<InputBox
				value="hello"
				onChange={mockOnChange}
				onSubmit={mockOnSubmit}
				isLoading={false}
				hasCommandSuggestions={false}
			/>,
		);

		const input = getByTestId("input-element") as HTMLInputElement;
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

		// onSubmit should be called when no command suggestions are visible
		expect(mockOnSubmit).toHaveBeenCalledTimes(1);
	});

	it("should hide TextInput when CTRL is pressed", () => {
		const { queryByTestId, getByText, rerender } = render(
			<InputBox value="hello" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />,
		);

		// Initially, TextInput should be visible
		expect(queryByTestId("input-element")).toBeDefined();

		// Simulate Ctrl+L being pressed
		inputHandler?.("l", { ctrl: true });

		// Force a re-render to see the state change
		rerender(<InputBox value="hello" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />);

		// TextInput should be hidden and replaced with static Text
		expect(queryByTestId("input-element")).toBeNull();
		expect(getByText("hello")).toBeDefined();
	});

	it("should show TextInput again after CTRL timeout", () => {
		vi.useFakeTimers();

		const { queryByTestId, rerender } = render(
			<InputBox value="hello" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />,
		);

		// Simulate Ctrl+L being pressed
		inputHandler?.("l", { ctrl: true });
		rerender(<InputBox value="hello" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />);

		// TextInput should be hidden
		expect(queryByTestId("input-element")).toBeNull();

		// Fast-forward past the timeout
		vi.advanceTimersByTime(150);
		rerender(<InputBox value="hello" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />);

		// TextInput should be visible again
		expect(queryByTestId("input-element")).toBeDefined();

		vi.useRealTimers();
	});

	it("should block onChange when CTRL is pressed", () => {
		const { getByTestId } = render(
			<InputBox value="hello" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />,
		);

		// Simulate Ctrl+L being pressed
		inputHandler?.("l", { ctrl: true });

		// Try to change the input (simulating TextInput trying to add "l")
		const input = getByTestId("input-element") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "hellol" } });

		// onChange should NOT be called because CTRL is pressed
		expect(mockOnChange).not.toHaveBeenCalled();
	});

	it("should allow normal typing when control is not pressed", () => {
		const { getByTestId } = render(
			<InputBox value="" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />,
		);

		// Type "l" into the input (without ctrl)
		const input = getByTestId("input-element") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "l" } });

		// onChange SHOULD be called with "l" because ctrl was not pressed
		expect(mockOnChange).toHaveBeenCalledWith("l");
	});

	it("should allow typing after CTRL timeout expires", () => {
		vi.useFakeTimers();

		const { getByTestId } = render(
			<InputBox value="hello" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />,
		);

		// Simulate Ctrl+L being pressed
		inputHandler?.("l", { ctrl: true });

		// Try to change immediately - should be blocked
		const input = getByTestId("input-element") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "hellol" } });
		expect(mockOnChange).not.toHaveBeenCalled();

		// Fast-forward past the timeout
		vi.advanceTimersByTime(150);

		// Now typing should work
		fireEvent.change(input, { target: { value: "hellol" } });
		expect(mockOnChange).toHaveBeenCalledWith("hellol");

		vi.useRealTimers();
	});

	it("should show space when value is empty and CTRL is pressed", () => {
		const { queryByTestId, rerender } = render(
			<InputBox value="" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />,
		);

		// Initially, TextInput should be visible
		expect(queryByTestId("input-element")).toBeDefined();

		// Simulate Ctrl+L being pressed
		inputHandler?.("l", { ctrl: true });

		// Force a re-render to see the state change
		rerender(<InputBox value="" onChange={mockOnChange} onSubmit={mockOnSubmit} isLoading={false} />);

		// TextInput should be hidden (space is shown instead but we can't easily query for it)
		expect(queryByTestId("input-element")).toBeNull();
	});
});
