import { logoutCommand } from "./Logout";
import type { CommandContext } from "./types";
import { describe, expect, it, vi } from "vitest";

// Mock Config module
vi.mock("../../util/Config", () => ({
	clearAuthToken: vi.fn(),
}));

const Config = await import("../../util/Config");
const mockClearAuthToken = vi.mocked(Config.clearAuthToken);

describe("Logout Command", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should have correct name and description", () => {
		expect(logoutCommand.name).toBe("/logout");
		expect(logoutCommand.description).toBe("Log out and clear saved authentication");
	});

	it("should clear auth token, show success message, and exit", async () => {
		mockClearAuthToken.mockResolvedValue(undefined);
		const mockSetSystemMessage = vi.fn();
		const mockSetShouldExit = vi.fn();

		const ctx: CommandContext = {
			setMessages: vi.fn(),
			setSystemMessage: mockSetSystemMessage,
			setShouldExit: mockSetShouldExit,
			setViewMode: vi.fn(),
			onLogin: vi.fn(),
			reloadConvos: vi.fn(),
			isMountedRef: { current: true },
		};

		await logoutCommand.handler(ctx);

		expect(mockClearAuthToken).toHaveBeenCalledTimes(1);
		expect(mockSetSystemMessage).toHaveBeenCalledWith(
			"Logged out successfully. Restart interactive mode to log in again.",
		);
		expect(mockSetShouldExit).toHaveBeenCalledWith(true);
	});

	it("should show error message when logout fails", async () => {
		const error = new Error("File system error");
		mockClearAuthToken.mockRejectedValue(error);
		const mockSetSystemMessage = vi.fn();
		const mockSetShouldExit = vi.fn();

		const ctx: CommandContext = {
			setMessages: vi.fn(),
			setSystemMessage: mockSetSystemMessage,
			setShouldExit: mockSetShouldExit,
			setViewMode: vi.fn(),
			onLogin: vi.fn(),
			reloadConvos: vi.fn(),
			isMountedRef: { current: true },
		};

		await logoutCommand.handler(ctx);

		expect(mockClearAuthToken).toHaveBeenCalledTimes(1);
		expect(mockSetSystemMessage).toHaveBeenCalledWith("Logout failed: Error: File system error");
		expect(mockSetShouldExit).not.toHaveBeenCalled();
	});

	it("should handle non-Error exceptions", async () => {
		mockClearAuthToken.mockRejectedValue("String error");
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

		await logoutCommand.handler(ctx);

		expect(mockSetSystemMessage).toHaveBeenCalledWith("Logout failed: String error");
	});

	it("should not interact with other context properties on success", async () => {
		mockClearAuthToken.mockResolvedValue(undefined);
		const mockSetMessages = vi.fn();
		const mockSetViewMode = vi.fn();
		const mockOnLogin = vi.fn();

		const ctx: CommandContext = {
			setMessages: mockSetMessages,
			setSystemMessage: vi.fn(),
			setShouldExit: vi.fn(),
			setViewMode: mockSetViewMode,
			onLogin: mockOnLogin,
			reloadConvos: vi.fn(),
			isMountedRef: { current: true },
		};

		await logoutCommand.handler(ctx);

		expect(mockSetMessages).not.toHaveBeenCalled();
		expect(mockSetViewMode).not.toHaveBeenCalled();
		expect(mockOnLogin).not.toHaveBeenCalled();
	});
});
