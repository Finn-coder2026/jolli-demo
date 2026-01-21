/**
 * @vitest-environment jsdom
 */
import { CommandProvider, useCommandContext } from "./CommandContext";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock MessageInputContext
vi.mock("./MessageInputContext", () => ({
	useMessageInputContext: vi.fn(),
}));

// Import mocked hook
import { useMessageInputContext } from "./MessageInputContext";

describe("CommandContext", () => {
	beforeEach(() => {
		// Mock MessageInputContext
		vi.mocked(useMessageInputContext).mockReturnValue({
			message: "",
			setMessage: vi.fn(),
			handleSend: vi.fn(),
			handleCommand: vi.fn(),
		});
	});

	describe("useCommandContext", () => {
		it("should throw error when used outside CommandProvider", () => {
			const TestComponent = () => {
				expect(() => useCommandContext()).toThrow("useCommandContext must be used within a CommandProvider");
				return <div>Test</div>;
			};

			render(<TestComponent />);
		});

		it("should return context value when used inside CommandProvider", () => {
			const TestComponent = () => {
				const context = useCommandContext();
				expect(context).toBeDefined();
				expect(context.commandSuggestions).toEqual([]);
				expect(context.handleCommandSelect).toBeDefined();
				expect(typeof context.handleCommandSelect).toBe("function");
				return <div>Test</div>;
			};

			render(
				<CommandProvider>
					<TestComponent />
				</CommandProvider>,
			);
		});

		it("should initialize with empty command suggestions", () => {
			const TestComponent = () => {
				const { commandSuggestions } = useCommandContext();
				expect(commandSuggestions).toEqual([]);
				expect(Array.isArray(commandSuggestions)).toBe(true);
				return <div>Test</div>;
			};

			render(
				<CommandProvider>
					<TestComponent />
				</CommandProvider>,
			);
		});

		it("should handle command selection", async () => {
			const mockSetMessage = vi.fn();
			const mockHandleCommand = vi.fn();

			vi.mocked(useMessageInputContext).mockReturnValue({
				message: "/help",
				setMessage: mockSetMessage,
				handleSend: vi.fn(),
				handleCommand: mockHandleCommand,
			});

			const TestComponent = () => {
				const { handleCommandSelect } = useCommandContext();
				return (
					<button type="button" onClick={() => handleCommandSelect("/help")}>
						Select
					</button>
				);
			};

			const { getByText } = render(
				<CommandProvider>
					<TestComponent />
				</CommandProvider>,
			);

			getByText("Select").click();

			await vi.waitFor(() => {
				expect(mockSetMessage).toHaveBeenCalledWith("");
				expect(mockHandleCommand).toHaveBeenCalledWith("/help");
			});
		});
	});
});
