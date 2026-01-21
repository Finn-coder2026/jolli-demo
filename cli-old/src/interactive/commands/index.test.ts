import { COMMANDS, executeCommand, HIDDEN_COMMANDS } from "./index";
import type { CommandContext } from "./types";
import { describe, expect, it, vi } from "vitest";

describe("Command Registry", () => {
	describe("COMMANDS array", () => {
		it("should export all commands", () => {
			expect(COMMANDS).toHaveLength(6);

			const commandNames = COMMANDS.map(cmd => cmd.name);
			expect(commandNames).toContain("/help");
			expect(commandNames).toContain("/clear");
			expect(commandNames).toContain("/exit");
			expect(commandNames).toContain("/login");
			expect(commandNames).toContain("/logout");
			expect(commandNames).toContain("/conversations");
		});

		it("should not contain hidden commands", () => {
			const commandNames = COMMANDS.map(cmd => cmd.name);
			expect(commandNames).not.toContain("/admin");
		});

		it("should have all commands with proper structure", () => {
			for (const command of COMMANDS) {
				expect(command).toHaveProperty("name");
				expect(command).toHaveProperty("description");
				expect(command).toHaveProperty("handler");
				expect(typeof command.name).toBe("string");
				expect(typeof command.description).toBe("string");
				expect(typeof command.handler).toBe("function");
			}
		});
	});

	describe("HIDDEN_COMMANDS array", () => {
		it("should export hidden commands", () => {
			expect(HIDDEN_COMMANDS).toHaveLength(1);

			const commandNames = HIDDEN_COMMANDS.map(cmd => cmd.name);
			expect(commandNames).toContain("/admin");
		});

		it("should have all hidden commands with proper structure", () => {
			for (const command of HIDDEN_COMMANDS) {
				expect(command).toHaveProperty("name");
				expect(command).toHaveProperty("description");
				expect(command).toHaveProperty("handler");
				expect(typeof command.name).toBe("string");
				expect(typeof command.description).toBe("string");
				expect(typeof command.handler).toBe("function");
			}
		});
	});

	describe("executeCommand", () => {
		it("should execute a matching command", async () => {
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

			const result = await executeCommand("/clear", ctx);

			expect(result).toBe(true);
			expect(mockSetMessages).toHaveBeenCalledWith([]);
		});

		it("should return false for unknown command", async () => {
			const ctx: CommandContext = {
				setMessages: vi.fn(),
				setSystemMessage: vi.fn(),
				setShouldExit: vi.fn(),
				setViewMode: vi.fn(),
				onLogin: vi.fn(),
				reloadConvos: vi.fn(),
				isMountedRef: { current: true },
			};

			const result = await executeCommand("/unknown", ctx);

			expect(result).toBe(false);
		});

		it("should handle command names case-insensitively", async () => {
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

			const result = await executeCommand("/CLEAR", ctx);

			expect(result).toBe(true);
			expect(mockSetMessages).toHaveBeenCalledWith([]);
		});

		it("should trim whitespace from command names", async () => {
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

			const result = await executeCommand("  /clear  ", ctx);

			expect(result).toBe(true);
			expect(mockSetMessages).toHaveBeenCalledWith([]);
		});

		it("should pass COMMANDS array to command handler", async () => {
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

			await executeCommand("/help", ctx);

			expect(mockSetSystemMessage).toHaveBeenCalled();
			const callArg = mockSetSystemMessage.mock.calls[0][0];
			expect(callArg).toContain("Available commands:");
			expect(callArg).toContain("/help");
			expect(callArg).toContain("/clear");
			expect(callArg).toContain("/exit");
		});

		it("should execute hidden commands", async () => {
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

			const result = await executeCommand("/admin", ctx);

			expect(result).toBe(true);
			expect(mockSetViewMode).toHaveBeenCalledWith("admin");
		});
	});
});
