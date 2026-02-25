import { AgentInput } from "./AgentInput";
import { fireEvent, render, screen } from "@testing-library/preact";
import { createRef, type RefObject } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("AgentInput", () => {
	const defaultProps = {
		message: "",
		isLoading: false,
		onMessageChange: vi.fn(),
		onSend: vi.fn(),
		onStop: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render the input textarea and send button", () => {
		render(<AgentInput {...defaultProps} />);

		expect(screen.getByTestId("agent-input")).toBeDefined();
		expect(screen.getByTestId("agent-input-textarea")).toBeDefined();
		expect(screen.getByTestId("agent-send-button")).toBeDefined();
	});

	it("should show placeholder text", () => {
		render(<AgentInput {...defaultProps} />);

		const textarea = screen.getByTestId("agent-input-textarea") as HTMLTextAreaElement;
		expect(textarea.placeholder).toBe("Message Jolli Agent...");
	});

	it("should call onMessageChange when typing", () => {
		render(<AgentInput {...defaultProps} />);

		const textarea = screen.getByTestId("agent-input-textarea");
		fireEvent.input(textarea, { target: { value: "Hello" } });

		expect(defaultProps.onMessageChange).toHaveBeenCalledWith("Hello");
	});

	it("should call onSend when Enter is pressed with non-empty message", () => {
		render(<AgentInput {...defaultProps} message="Hello" />);

		const textarea = screen.getByTestId("agent-input-textarea");
		fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

		expect(defaultProps.onSend).toHaveBeenCalledTimes(1);
	});

	it("should not call onSend when Enter is pressed with empty message", () => {
		render(<AgentInput {...defaultProps} message="" />);

		const textarea = screen.getByTestId("agent-input-textarea");
		fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

		expect(defaultProps.onSend).not.toHaveBeenCalled();
	});

	it("should not call onSend when Shift+Enter is pressed", () => {
		render(<AgentInput {...defaultProps} message="Hello" />);

		const textarea = screen.getByTestId("agent-input-textarea");
		fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

		expect(defaultProps.onSend).not.toHaveBeenCalled();
	});

	it("should disable send button when message is empty", () => {
		render(<AgentInput {...defaultProps} message="" />);

		const button = screen.getByTestId("agent-send-button");
		expect(button.getAttribute("disabled")).toBe("");
	});

	it("should enable send button when message has content", () => {
		render(<AgentInput {...defaultProps} message="Hello" />);

		const button = screen.getByTestId("agent-send-button");
		expect(button.getAttribute("disabled")).toBeNull();
	});

	it("should call onSend when send button is clicked with message", () => {
		render(<AgentInput {...defaultProps} message="Hello" />);

		const button = screen.getByTestId("agent-send-button");
		fireEvent.click(button);

		expect(defaultProps.onSend).toHaveBeenCalledTimes(1);
	});

	it("should call onStop when button is clicked during loading", () => {
		render(<AgentInput {...defaultProps} isLoading={true} message="" />);

		const button = screen.getByTestId("agent-send-button");
		fireEvent.click(button);

		expect(defaultProps.onStop).toHaveBeenCalledTimes(1);
	});

	it("should not call onSend when Enter is pressed while loading", () => {
		render(<AgentInput {...defaultProps} isLoading={true} message="Hello" />);

		const textarea = screen.getByTestId("agent-input-textarea");
		fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

		expect(defaultProps.onSend).not.toHaveBeenCalled();
	});

	it("should show stop icon during loading", () => {
		const { container } = render(<AgentInput {...defaultProps} isLoading={true} />);

		const button = screen.getByTestId("agent-send-button");
		// During loading, the button should have destructive styling
		expect(button.className).toContain("bg-destructive");
		// Should render Square icon (stop)
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBeGreaterThan(0);
	});

	it("should not call onSend when button is clicked without message", () => {
		render(<AgentInput {...defaultProps} message="   " />);

		const button = screen.getByTestId("agent-send-button");
		fireEvent.click(button);

		expect(defaultProps.onSend).not.toHaveBeenCalled();
	});

	it("should expose the textarea element via inputRef", () => {
		const ref = createRef<HTMLTextAreaElement>() as RefObject<HTMLTextAreaElement | null>;
		render(<AgentInput {...defaultProps} inputRef={ref} />);

		const textarea = screen.getByTestId("agent-input-textarea");
		expect(ref.current).toBe(textarea);
	});

	it("should not render mode selector toolbar when mode is undefined", () => {
		render(<AgentInput {...defaultProps} />);

		expect(screen.queryByTestId("agent-input-toolbar")).toBeNull();
	});

	it("should render mode selector toolbar when mode and callbacks are provided", () => {
		render(<AgentInput {...defaultProps} mode="plan" onSetMode={vi.fn()} onOpenPlan={vi.fn()} />);

		expect(screen.getByTestId("agent-input-toolbar")).toBeDefined();
		expect(screen.getByTestId("agent-plan-toggle")).toBeDefined();
	});

	it("should not render mode selector toolbar when onSetMode is missing", () => {
		render(<AgentInput {...defaultProps} mode="plan" onOpenPlan={vi.fn()} />);

		expect(screen.queryByTestId("agent-input-toolbar")).toBeNull();
	});
});
