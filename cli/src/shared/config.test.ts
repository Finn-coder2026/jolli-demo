import { getConfig, resetConfig } from "./config";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

describe("config module", () => {
	beforeEach(() => {
		// Reset config before each test
		resetConfig();
		// Clear any environment variables that might affect tests
		delete process.env.JOLLI_URL;
		delete process.env.SYNC_SERVER_URL;
		delete process.env.DEBUG;
		delete process.env.LOG_LEVEL;
		delete process.env.SYNC_JRN_PREFIX;
	});

	afterEach(() => {
		resetConfig();
	});

	test("getConfig returns default values", () => {
		const config = getConfig();
		expect(config.JOLLI_URL).toBe("http://localhost:8034");
		expect(config.SYNC_SERVER_URL).toBe("http://localhost:8034/api");
		expect(config.DEBUG).toBe(false);
		expect(config.LOG_LEVEL).toBe("warn");
		expect(config.SYNC_JRN_PREFIX).toBe("jrn:/global:docs:article/sync-");
	});

	test("getConfig reads from process.env", () => {
		process.env.JOLLI_URL = "https://custom.jolli.com";
		process.env.SYNC_SERVER_URL = "https://sync.custom.com";
		process.env.DEBUG = "true";
		process.env.LOG_LEVEL = "debug";

		resetConfig(); // Force reload
		const config = getConfig();

		expect(config.JOLLI_URL).toBe("https://custom.jolli.com");
		expect(config.SYNC_SERVER_URL).toBe("https://sync.custom.com");
		expect(config.DEBUG).toBe(true);
		expect(config.LOG_LEVEL).toBe("debug");
	});

	test("getConfig reads SYNC_JRN_PREFIX from process.env", () => {
		process.env.SYNC_JRN_PREFIX = "custom:prefix/sync-";

		resetConfig(); // Force reload
		const config = getConfig();

		expect(config.SYNC_JRN_PREFIX).toBe("custom:prefix/sync-");
	});

	test("getConfig caches config instance", () => {
		const config1 = getConfig();
		const config2 = getConfig();
		expect(config1).toBe(config2);
	});

	test("resetConfig clears cached config", () => {
		const config1 = getConfig();
		resetConfig();
		const config2 = getConfig();
		// They should be equal but not the same instance
		expect(config1).not.toBe(config2);
		expect(config1.JOLLI_URL).toBe(config2.JOLLI_URL);
	});

	test("DEBUG accepts string 'true'", () => {
		process.env.DEBUG = "true";
		resetConfig();
		const config = getConfig();
		expect(config.DEBUG).toBe(true);
	});

	test("DEBUG accepts string 'false'", () => {
		process.env.DEBUG = "false";
		resetConfig();
		const config = getConfig();
		expect(config.DEBUG).toBe(false);
	});

	test("LOG_LEVEL validates enum values", () => {
		const validLevels = ["trace", "debug", "info", "warn", "error", "fatal"];
		for (const level of validLevels) {
			process.env.LOG_LEVEL = level;
			resetConfig();
			const config = getConfig();
			expect(config.LOG_LEVEL).toBe(level);
		}
	});

	test("empty string environment variable uses default", () => {
		process.env.JOLLI_URL = "";
		resetConfig();
		const config = getConfig();
		expect(config.JOLLI_URL).toBe("http://localhost:8034");
	});
});

describe("config .env file loading", () => {
	const testEnvDir = "/tmp/jolli-config-env-test";

	beforeEach(async () => {
		resetConfig();
		delete process.env.JOLLI_URL;
		delete process.env.SYNC_SERVER_URL;
		delete process.env.DEBUG;
		delete process.env.LOG_LEVEL;
		await mkdir(testEnvDir, { recursive: true });
	});

	afterEach(async () => {
		resetConfig();
		await rm(testEnvDir, { recursive: true, force: true });
	});

	test("loads config from local .env file", async () => {
		const originalCwd = process.cwd();
		try {
			await writeFile(
				join(testEnvDir, ".env"),
				`JOLLI_URL=https://from-env-file.com
DEBUG=true`,
			);

			process.chdir(testEnvDir);
			resetConfig();
			const config = getConfig();

			expect(config.JOLLI_URL).toBe("https://from-env-file.com");
			expect(config.DEBUG).toBe(true);
		} finally {
			process.chdir(originalCwd);
		}
	});

	test("process.env takes priority over .env file", async () => {
		const originalCwd = process.cwd();
		try {
			await writeFile(join(testEnvDir, ".env"), `JOLLI_URL=https://from-env-file.com`);
			process.env.JOLLI_URL = "https://from-process-env.com";

			process.chdir(testEnvDir);
			resetConfig();
			const config = getConfig();

			expect(config.JOLLI_URL).toBe("https://from-process-env.com");
		} finally {
			process.chdir(originalCwd);
		}
	});

	test("handles .env file with comments", async () => {
		const originalCwd = process.cwd();
		try {
			await writeFile(
				join(testEnvDir, ".env"),
				`# This is a comment
JOLLI_URL=https://with-comments.com
# Another comment
DEBUG=true`,
			);

			process.chdir(testEnvDir);
			resetConfig();
			const config = getConfig();

			expect(config.JOLLI_URL).toBe("https://with-comments.com");
			expect(config.DEBUG).toBe(true);
		} finally {
			process.chdir(originalCwd);
		}
	});

	test("handles .env file with quoted values", async () => {
		const originalCwd = process.cwd();
		try {
			await writeFile(
				join(testEnvDir, ".env"),
				`JOLLI_URL="https://double-quoted.com"
SYNC_SERVER_URL='https://single-quoted.com'`,
			);

			process.chdir(testEnvDir);
			resetConfig();
			const config = getConfig();

			expect(config.JOLLI_URL).toBe("https://double-quoted.com");
			expect(config.SYNC_SERVER_URL).toBe("https://single-quoted.com");
		} finally {
			process.chdir(originalCwd);
		}
	});

	test("handles missing .env file gracefully", async () => {
		const originalCwd = process.cwd();
		try {
			process.chdir(testEnvDir);
			resetConfig();
			const config = getConfig();

			expect(config.JOLLI_URL).toBe("http://localhost:8034");
		} finally {
			process.chdir(originalCwd);
		}
	});
});
