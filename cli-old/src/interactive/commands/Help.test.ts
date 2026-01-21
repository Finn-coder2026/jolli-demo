import { helpCommand } from "./Help";
import type { CommandContext, CommandDefinition } from "./types";
import { describe, expect, it, vi } from "vitest";

describe("Help Command", () => {
	it("should have correct name and description", () => {
		expect(helpCommand.name).toBe("/help");
		expect(helpCommand.description).toBe("Show this help message");
	});

	it("should display all commands when commands array is provided", () => {
		const mockSetSystemMessage = vi.fn();
		const ctx: CommandContext = {
			setMessages: vi.fn(),
			setSystemMessage: mockSetSystemMessage,
			setShouldExit: vi.fn(),
			setViewMode: vi.fn(),
			onLogin: vi.fn(),
			reloadConvos: vi.fn(),
			isMountedRef: { current: true },
		};

		const mockCommands: Array<CommandDefinition> = [
			{ name: "/help", description: "Show help", handler: vi.fn() },
			{ name: "/exit", description: "Exit app", handler: vi.fn() },
			{ name: "/clear", description: "Clear screen", handler: vi.fn() },
		];

		helpCommand.handler(ctx, undefined, mockCommands);

		expect(mockSetSystemMessage).toHaveBeenCalledWith(
			"Available commands:\n\n/help - Show help\n/exit - Exit app\n/clear - Clear screen",
		);
	});

	it("should show error message when commands array is not provided", () => {
		const mockSetSystemMessage = vi.fn();
		const ctx: CommandContext = {
			setMessages: vi.fn(),
			setSystemMessage: mockSetSystemMessage,
			setShouldExit: vi.fn(),
			setViewMode: vi.fn(),
			onLogin: vi.fn(),
			reloadConvos: vi.fn(),
			isMountedRef: { current: true },
		};

		helpCommand.handler(ctx, undefined, undefined);

		expect(mockSetSystemMessage).toHaveBeenCalledWith("No commands available.");
	});

	it("should ignore args parameter", () => {
		const mockSetSystemMessage = vi.fn();
		const ctx: CommandContext = {
			setMessages: vi.fn(),
			setSystemMessage: mockSetSystemMessage,
			setShouldExit: vi.fn(),
			setViewMode: vi.fn(),
			onLogin: vi.fn(),
			reloadConvos: vi.fn(),
			isMountedRef: { current: true },
		};

		const mockCommands: Array<CommandDefinition> = [{ name: "/help", description: "Show help", handler: vi.fn() }];

		helpCommand.handler(ctx, "some-args", mockCommands);

		expect(mockSetSystemMessage).toHaveBeenCalledWith("Available commands:\n\n/help - Show help");
	});
});
