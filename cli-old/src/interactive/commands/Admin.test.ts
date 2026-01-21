import { adminCommand } from "./Admin";
import type { CommandContext } from "./types";
import { describe, expect, it, vi } from "vitest";

describe("adminCommand", () => {
	it("should have correct name and description", () => {
		expect(adminCommand.name).toBe("/admin");
		expect(adminCommand.description).toBe("Access admin utilities (hidden)");
	});

	it("should set viewMode to admin when executed", () => {
		const mockContext: CommandContext = {
			setMessages: vi.fn(),
			setSystemMessage: vi.fn(),
			setShouldExit: vi.fn(),
			setViewMode: vi.fn(),
			onLogin: vi.fn(),
			reloadConvos: vi.fn(),
			isMountedRef: { current: true },
		};

		adminCommand.handler(mockContext);

		expect(mockContext.setViewMode).toHaveBeenCalledWith("admin");
	});
});
