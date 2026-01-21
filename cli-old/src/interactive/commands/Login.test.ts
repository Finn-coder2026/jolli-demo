import { loginCommand } from "./Login";
import type { CommandContext } from "./types";
import { describe, expect, it, vi } from "vitest";

describe("Login Command", () => {
	it("should have correct name and description", () => {
		expect(loginCommand.name).toBe("/login");
		expect(loginCommand.description).toBe("Authenticate with your account");
	});

	it("should show opening message, call onLogin, reload convos, and clear message", async () => {
		const mockSetSystemMessage = vi.fn();
		const mockOnLogin = vi.fn().mockResolvedValue(undefined);
		const mockReloadConversations = vi.fn().mockResolvedValue(undefined);

		const ctx: CommandContext = {
			setMessages: vi.fn(),
			setSystemMessage: mockSetSystemMessage,
			setShouldExit: vi.fn(),
			setViewMode: vi.fn(),
			onLogin: mockOnLogin,
			reloadConvos: mockReloadConversations,
			isMountedRef: { current: true },
		};

		await loginCommand.handler(ctx);

		expect(mockSetSystemMessage).toHaveBeenCalledTimes(3);
		expect(mockSetSystemMessage).toHaveBeenNthCalledWith(1, "Opening browser for login...");
		expect(mockOnLogin).toHaveBeenCalledTimes(1);
		expect(mockSetSystemMessage).toHaveBeenNthCalledWith(2, "Login successful! Loading conversations...");
		expect(mockReloadConversations).toHaveBeenCalledTimes(1);
		expect(mockSetSystemMessage).toHaveBeenNthCalledWith(3, null);
	});

	it("should show error message when login fails", async () => {
		const mockSetSystemMessage = vi.fn();
		const error = new Error("Network error");
		const mockOnLogin = vi.fn().mockRejectedValue(error);

		const ctx: CommandContext = {
			setMessages: vi.fn(),
			setSystemMessage: mockSetSystemMessage,
			setShouldExit: vi.fn(),
			setViewMode: vi.fn(),
			onLogin: mockOnLogin,
			reloadConvos: vi.fn(),
			isMountedRef: { current: true },
		};

		await loginCommand.handler(ctx);

		expect(mockSetSystemMessage).toHaveBeenCalledTimes(2);
		expect(mockSetSystemMessage).toHaveBeenNthCalledWith(1, "Opening browser for login...");
		expect(mockOnLogin).toHaveBeenCalledTimes(1);
		expect(mockSetSystemMessage).toHaveBeenNthCalledWith(2, "Login failed: Error: Network error");
	});

	it("should handle non-Error exceptions", async () => {
		const mockSetSystemMessage = vi.fn();
		const mockOnLogin = vi.fn().mockRejectedValue("String error");

		const ctx: CommandContext = {
			setMessages: vi.fn(),
			setSystemMessage: mockSetSystemMessage,
			setShouldExit: vi.fn(),
			setViewMode: vi.fn(),
			onLogin: mockOnLogin,
			reloadConvos: vi.fn(),
			isMountedRef: { current: true },
		};

		await loginCommand.handler(ctx);

		expect(mockSetSystemMessage).toHaveBeenNthCalledWith(2, "Login failed: String error");
	});

	it("should not interact with other context properties", async () => {
		const mockSetMessages = vi.fn();
		const mockSetShouldExit = vi.fn();
		const mockSetViewMode = vi.fn();

		const ctx: CommandContext = {
			setMessages: mockSetMessages,
			setSystemMessage: vi.fn(),
			setShouldExit: mockSetShouldExit,
			setViewMode: mockSetViewMode,
			onLogin: vi.fn().mockResolvedValue(undefined),
			reloadConvos: vi.fn().mockResolvedValue(undefined),
			isMountedRef: { current: true },
		};

		await loginCommand.handler(ctx);

		expect(mockSetMessages).not.toHaveBeenCalled();
		expect(mockSetShouldExit).not.toHaveBeenCalled();
		expect(mockSetViewMode).not.toHaveBeenCalled();
	});
});
