import { createTenantAwareLogger } from "./TenantAwareLogger";
import type { Logger, LogLevel } from "jolli-common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock getTenantContext
vi.mock("../tenant/TenantContext", () => ({
	getTenantContext: vi.fn(),
}));

// Mock loggerRegistry
vi.mock("jolli-common", async () => {
	const actual = await vi.importActual("jolli-common");
	return {
		...actual,
		loggerRegistry: {
			shouldLog: vi.fn(),
		},
	};
});

describe("TenantAwareLogger", () => {
	let mockLogger: Logger;
	let mockGetTenantContext: ReturnType<typeof vi.fn>;
	let mockShouldLog: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		// Create a mock logger
		mockLogger = {
			trace: vi.fn(),
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			fatal: vi.fn(),
			level: "info",
			child: vi.fn(),
		} as unknown as Logger;

		// Get mocked functions
		const { getTenantContext } = await import("../tenant/TenantContext");
		mockGetTenantContext = getTenantContext as ReturnType<typeof vi.fn>;
		mockGetTenantContext.mockReturnValue(undefined);

		const { loggerRegistry } = await import("jolli-common");
		mockShouldLog = loggerRegistry.shouldLog as ReturnType<typeof vi.fn>;
		mockShouldLog.mockReturnValue(true);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("createTenantAwareLogger", () => {
		it("should return a proxy that wraps the logger", () => {
			const wrappedLogger = createTenantAwareLogger(mockLogger, "TestModule");
			expect(wrappedLogger).toBeDefined();
		});

		it("should call through to original logger when shouldLog returns true", () => {
			mockShouldLog.mockReturnValue(true);
			const wrappedLogger = createTenantAwareLogger(mockLogger, "TestModule");

			wrappedLogger.info("test message");

			expect(mockShouldLog).toHaveBeenCalledWith("info", "TestModule", undefined, undefined);
			expect(mockLogger.info).toHaveBeenCalledWith("test message");
		});

		it("should skip logging when shouldLog returns false", () => {
			mockShouldLog.mockReturnValue(false);
			const wrappedLogger = createTenantAwareLogger(mockLogger, "TestModule");

			wrappedLogger.debug("test message");

			expect(mockShouldLog).toHaveBeenCalledWith("debug", "TestModule", undefined, undefined);
			expect(mockLogger.debug).not.toHaveBeenCalled();
		});

		it("should pass tenant context to shouldLog when available", () => {
			const mockContext = {
				tenant: { slug: "acme" },
				org: { slug: "engineering" },
			};
			mockGetTenantContext.mockReturnValue(mockContext);
			mockShouldLog.mockReturnValue(true);

			const wrappedLogger = createTenantAwareLogger(mockLogger, "TestModule");
			wrappedLogger.warn("test message");

			expect(mockShouldLog).toHaveBeenCalledWith("warn", "TestModule", "acme", "engineering");
		});

		it("should intercept all log methods", () => {
			const wrappedLogger = createTenantAwareLogger(mockLogger, "TestModule");
			const logMethods: Array<LogLevel> = ["trace", "debug", "info", "warn", "error", "fatal"];

			for (const method of logMethods) {
				mockShouldLog.mockClear();
				(mockLogger as unknown as Record<string, ReturnType<typeof vi.fn>>)[method].mockClear();

				wrappedLogger[method]("test");

				expect(mockShouldLog).toHaveBeenCalledWith(method, "TestModule", undefined, undefined);
				expect(
					(mockLogger as unknown as Record<string, ReturnType<typeof vi.fn>>)[method],
				).toHaveBeenCalledWith("test");
			}
		});

		it("should pass through non-log properties unchanged", () => {
			const wrappedLogger = createTenantAwareLogger(mockLogger, "TestModule");

			expect(wrappedLogger.level).toBe("info");
			expect(wrappedLogger.child).toBe(mockLogger.child);
		});

		it("should preserve log method return values", () => {
			(mockLogger.info as ReturnType<typeof vi.fn>).mockReturnValue("logged");
			const wrappedLogger = createTenantAwareLogger(mockLogger, "TestModule");

			const result = wrappedLogger.info("test");

			expect(result).toBe("logged");
		});

		it("should return undefined when log is skipped", () => {
			mockShouldLog.mockReturnValue(false);
			const wrappedLogger = createTenantAwareLogger(mockLogger, "TestModule");

			const result = wrappedLogger.debug("test");

			expect(result).toBeUndefined();
		});

		it("should pass multiple arguments to log methods", () => {
			const wrappedLogger = createTenantAwareLogger(mockLogger, "TestModule");

			wrappedLogger.info({ data: "test" }, "message with %s", "args");

			expect(mockLogger.info).toHaveBeenCalledWith({ data: "test" }, "message with %s", "args");
		});
	});
});
