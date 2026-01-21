import { getEnvOrError, loadEnvFiles } from "./Env";
import { trimConfigValues, trimEnvValue } from "./EnvUtils";
import { config as dotenvConfig } from "dotenv";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv", () => ({
	config: vi.fn(),
}));

describe("Env", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("getEnvOrError", () => {
		it("should return env variable when it exists", () => {
			process.env.TEST_VAR = "test-value";
			expect(getEnvOrError("TEST_VAR")).toBe("test-value");
		});

		it("should throw error when env variable is missing", () => {
			delete process.env.MISSING_VAR;
			expect(() => getEnvOrError("MISSING_VAR")).toThrow("Missing env var: MISSING_VAR");
		});

		it("should throw error when env variable is empty string", () => {
			process.env.EMPTY_VAR = "";
			expect(() => getEnvOrError("EMPTY_VAR")).toThrow("Missing env var: EMPTY_VAR");
		});

		it("should trim trailing newlines from env variable", () => {
			process.env.NEWLINE_VAR = "value\n";
			expect(getEnvOrError("NEWLINE_VAR")).toBe("value");
		});

		it("should trim leading and trailing whitespace from env variable", () => {
			process.env.SPACED_VAR = "  value  ";
			expect(getEnvOrError("SPACED_VAR")).toBe("value");
		});

		it("should preserve internal whitespace in env variable", () => {
			process.env.INTERNAL_SPACE_VAR = "value with spaces";
			expect(getEnvOrError("INTERNAL_SPACE_VAR")).toBe("value with spaces");
		});
	});

	describe("loadEnvFiles", () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		it("should call dotenv.config with .env first, then .env.local", () => {
			loadEnvFiles();

			expect(dotenvConfig).toHaveBeenCalledTimes(2);
			expect(dotenvConfig).toHaveBeenNthCalledWith(1, { path: ".env", override: true, quiet: true });
			expect(dotenvConfig).toHaveBeenNthCalledWith(2, { path: ".env.local", override: true, quiet: true });
		});

		it("should use override option to overwrite existing env values", () => {
			loadEnvFiles();

			// Both calls should have override: true to ensure .env.local values take precedence
			const calls = vi.mocked(dotenvConfig).mock.calls;
			expect(calls[0][0]).toHaveProperty("override", true);
			expect(calls[1][0]).toHaveProperty("override", true);
		});

		it("should use quiet option to suppress warnings", () => {
			loadEnvFiles();

			// Both calls should have quiet: true to suppress missing file warnings
			const calls = vi.mocked(dotenvConfig).mock.calls;
			expect(calls[0][0]).toHaveProperty("quiet", true);
			expect(calls[1][0]).toHaveProperty("quiet", true);
		});
	});

	describe("trimEnvValue", () => {
		it("should return value unchanged when no whitespace", () => {
			expect(trimEnvValue("clean-value")).toBe("clean-value");
		});

		it("should trim trailing newline", () => {
			expect(trimEnvValue("value\n")).toBe("value");
		});

		it("should trim trailing carriage return and newline", () => {
			expect(trimEnvValue("value\r\n")).toBe("value");
		});

		it("should trim leading and trailing spaces", () => {
			expect(trimEnvValue("  value  ")).toBe("value");
		});

		it("should trim leading and trailing tabs", () => {
			expect(trimEnvValue("\tvalue\t")).toBe("value");
		});

		it("should trim mixed whitespace", () => {
			expect(trimEnvValue(" \t\nvalue\n\t ")).toBe("value");
		});

		it("should preserve internal whitespace", () => {
			expect(trimEnvValue("value with spaces")).toBe("value with spaces");
		});

		it("should handle empty string", () => {
			expect(trimEnvValue("")).toBe("");
		});

		it("should handle string with only whitespace", () => {
			expect(trimEnvValue("   \n\t  ")).toBe("");
		});
	});

	describe("trimConfigValues", () => {
		it("should return empty object for empty input", () => {
			const result = trimConfigValues({}, "test-provider");
			expect(result).toEqual({});
		});

		it("should return values unchanged when no trimming needed", () => {
			const input = { KEY1: "value1", KEY2: "value2" };
			const result = trimConfigValues(input, "test-provider");
			expect(result).toEqual({ KEY1: "value1", KEY2: "value2" });
		});

		it("should trim trailing newlines from values", () => {
			const input = { KEY1: "value1\n", KEY2: "value2" };
			const result = trimConfigValues(input, "test-provider");
			expect(result).toEqual({ KEY1: "value1", KEY2: "value2" });
		});

		it("should trim all whitespace types from values", () => {
			const input = {
				NEWLINE_KEY: "value\n",
				SPACE_KEY: "  value  ",
				TAB_KEY: "\tvalue\t",
				CLEAN_KEY: "clean",
			};
			const result = trimConfigValues(input, "test-provider");
			expect(result).toEqual({
				NEWLINE_KEY: "value",
				SPACE_KEY: "value",
				TAB_KEY: "value",
				CLEAN_KEY: "clean",
			});
		});

		it("should log warning when values are trimmed", async () => {
			// Dynamic import to get the mocked logger
			const { getLog } = await import("./Logger");
			const mockLog = getLog(import.meta);
			const warnSpy = vi.spyOn(mockLog, "warn");

			const input = { KEY1: "value1\n", KEY2: "value2\n" };
			trimConfigValues(input, "test-provider");

			expect(warnSpy).toHaveBeenCalledWith(
				{ provider: "test-provider", trimmedKeys: ["KEY1", "KEY2"] },
				"Trimmed whitespace from %d environment variable(s): %s",
				2,
				"KEY1, KEY2",
			);
		});

		it("should not log warning when no values are trimmed", async () => {
			const { getLog } = await import("./Logger");
			const mockLog = getLog(import.meta);
			const warnSpy = vi.spyOn(mockLog, "warn");

			const input = { KEY1: "value1", KEY2: "value2" };
			trimConfigValues(input, "test-provider");

			expect(warnSpy).not.toHaveBeenCalled();
		});
	});
});
