import { clearCommand } from "./Clear";
import type { CommandContext } from "./types";
import { describe, expect, it, vi } from "vitest";

describe("Clear Command", () => {
	it("should have correct name and description", () => {
		expect(clearCommand.name).toBe("/clear");
		expect(clearCommand.description).toBe("Clear the screen");
	});

	it("should clear messages by setting empty array", () => {
		const mockSetMessages = vi.fn();
		const ctx: CommandContext = {
			setMessages: mockSetMessages,
			setSystemMessage: vi.fn(),
			setShouldExit: vi.fn(),
			setViewMode: vi.fn(),
			onLogin: vi.fn(),
			reloadConvos: vi.fn(),
			isMountedRef: { current: true },
		};

		clearCommand.handler(ctx);

		expect(mockSetMessages).toHaveBeenCalledWith([]);
	});

	it("should not interact with other context properties", () => {
		const mockSetSystemMessage = vi.fn();
		const mockSetShouldExit = vi.fn();
		const mockSetViewMode = vi.fn();
		const mockOnLogin = vi.fn();

		const ctx: CommandContext = {
			setMessages: vi.fn(),
			setSystemMessage: mockSetSystemMessage,
			setShouldExit: mockSetShouldExit,
			setViewMode: mockSetViewMode,
			onLogin: mockOnLogin,
			reloadConvos: vi.fn(),
			isMountedRef: { current: true },
		};

		clearCommand.handler(ctx);

		expect(mockSetSystemMessage).not.toHaveBeenCalled();
		expect(mockSetShouldExit).not.toHaveBeenCalled();
		expect(mockSetViewMode).not.toHaveBeenCalled();
		expect(mockOnLogin).not.toHaveBeenCalled();
	});
});
