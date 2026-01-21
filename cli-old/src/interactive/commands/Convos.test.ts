import { convosCommand } from "./Convos";
import type { CommandContext } from "./types";
import { describe, expect, it, vi } from "vitest";

describe("Convos Command", () => {
	it("should have correct name and description", () => {
		expect(convosCommand.name).toBe("/conversations");
		expect(convosCommand.description).toBe("Toggle conversation list view");
	});

	it("should toggle view mode from chat to convos", () => {
		const mockSetViewMode = vi.fn();

		const ctx: CommandContext = {
			setMessages: vi.fn(),
			setSystemMessage: vi.fn(),
			setShouldExit: vi.fn(),
			setViewMode: mockSetViewMode,
			onLogin: vi.fn(),
			reloadConvos: vi.fn(),
			isMountedRef: { current: true },
		};

		convosCommand.handler(ctx);

		expect(mockSetViewMode).toHaveBeenCalledTimes(1);

		// Extract the callback function passed to setViewMode
		const callback = mockSetViewMode.mock.calls[0][0];

		// Test the toggle logic
		expect(callback("chat")).toBe("conversations");
		expect(callback("conversations")).toBe("chat");
	});

	it("should not interact with other context properties", () => {
		const mockSetMessages = vi.fn();
		const mockSetSystemMessage = vi.fn();
		const mockSetShouldExit = vi.fn();
		const mockOnLogin = vi.fn();

		const ctx: CommandContext = {
			setMessages: mockSetMessages,
			setSystemMessage: mockSetSystemMessage,
			setShouldExit: mockSetShouldExit,
			setViewMode: vi.fn(),
			onLogin: mockOnLogin,
			reloadConvos: vi.fn(),
			isMountedRef: { current: true },
		};

		convosCommand.handler(ctx);

		expect(mockSetMessages).not.toHaveBeenCalled();
		expect(mockSetSystemMessage).not.toHaveBeenCalled();
		expect(mockSetShouldExit).not.toHaveBeenCalled();
		expect(mockOnLogin).not.toHaveBeenCalled();
	});
});
