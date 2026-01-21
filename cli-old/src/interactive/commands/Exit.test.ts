import { exitCommand } from "./Exit";
import type { CommandContext } from "./types";
import { describe, expect, it, vi } from "vitest";

describe("Exit Command", () => {
	it("should have correct name and description", () => {
		expect(exitCommand.name).toBe("/exit");
		expect(exitCommand.description).toBe("Exit interactive mode");
	});

	it("should clear messages, show goodbye message, and set exit flag", () => {
		const mockSetMessages = vi.fn();
		const mockSetSystemMessage = vi.fn();
		const mockSetShouldExit = vi.fn();

		const ctx: CommandContext = {
			setMessages: mockSetMessages,
			setSystemMessage: mockSetSystemMessage,
			setShouldExit: mockSetShouldExit,
			setViewMode: vi.fn(),
			onLogin: vi.fn(),
			reloadConvos: vi.fn(),
			isMountedRef: { current: true },
		};

		exitCommand.handler(ctx);

		expect(mockSetMessages).toHaveBeenCalledWith([]);
		expect(mockSetSystemMessage).toHaveBeenCalledWith("Goodbye! 👋");
		expect(mockSetShouldExit).toHaveBeenCalledWith(true);
	});

	it("should not interact with view mode or login", () => {
		const mockSetViewMode = vi.fn();
		const mockOnLogin = vi.fn();

		const ctx: CommandContext = {
			setMessages: vi.fn(),
			setSystemMessage: vi.fn(),
			setShouldExit: vi.fn(),
			setViewMode: mockSetViewMode,
			onLogin: mockOnLogin,
			reloadConvos: vi.fn(),
			isMountedRef: { current: true },
		};

		exitCommand.handler(ctx);

		expect(mockSetViewMode).not.toHaveBeenCalled();
		expect(mockOnLogin).not.toHaveBeenCalled();
	});
});
