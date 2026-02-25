import { clearAuthToken, loadAuthToken, loadSpace, saveAuthToken, saveSpace } from "./config";
import { rm } from "node:fs/promises";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";

// Note: These tests operate on real filesystem files:
//   - ~/.jolli/config.json for auth token (global)
//   - .jolli/space.json for space (local per-directory)

const LOCAL_SPACE_FILE = ".jolli/space.json";
let originalAuthTokenEnv: string | undefined;
let originalSpaceEnv: string | undefined;

beforeEach(() => {
	originalAuthTokenEnv = process.env.JOLLI_AUTH_TOKEN;
	originalSpaceEnv = process.env.JOLLI_SPACE;
	delete process.env.JOLLI_AUTH_TOKEN;
	delete process.env.JOLLI_SPACE;
});

afterEach(() => {
	if (originalAuthTokenEnv === undefined) {
		delete process.env.JOLLI_AUTH_TOKEN;
	} else {
		process.env.JOLLI_AUTH_TOKEN = originalAuthTokenEnv;
	}

	if (originalSpaceEnv === undefined) {
		delete process.env.JOLLI_SPACE;
	} else {
		process.env.JOLLI_SPACE = originalSpaceEnv;
	}
});

afterAll(async () => {
	// Clean up local space file created during tests
	try {
		await rm(LOCAL_SPACE_FILE, { force: true });
	} catch {
		// Ignore if it doesn't exist
	}
});

describe("auth config", () => {
	test("saveAuthToken returns without error", async () => {
		// Just verify it doesn't throw - uses real file system
		await expect(saveAuthToken("test-token")).resolves.toBeUndefined();
	});

	test("loadAuthToken returns string or undefined", async () => {
		const token = await loadAuthToken();
		// Token should be either a string (if config exists) or undefined
		expect(token === undefined || typeof token === "string").toBe(true);
	});

	test("loadAuthToken prefers JOLLI_AUTH_TOKEN over global config", async () => {
		await saveAuthToken("config-token");
		process.env.JOLLI_AUTH_TOKEN = "env-token";

		const token = await loadAuthToken();
		expect(token).toBe("env-token");
	});

	test("clearAuthToken returns without error", async () => {
		// Just verify it doesn't throw
		await expect(clearAuthToken()).resolves.toBeUndefined();
	});

	test("clearAuthToken is idempotent", async () => {
		// Should not throw even when called multiple times
		await clearAuthToken();
		await expect(clearAuthToken()).resolves.toBeUndefined();
	});
});

describe("local space config", () => {
	test("saveSpace writes to local .jolli/space.json", async () => {
		await expect(saveSpace("my-space")).resolves.toBeUndefined();
	});

	test("loadSpace reads from local .jolli/space.json", async () => {
		await saveSpace("local-space");
		const space = await loadSpace();
		expect(space).toBe("local-space");
	});

	test("loadSpace prefers JOLLI_SPACE over local/global config", async () => {
		await saveSpace("local-space");
		process.env.JOLLI_SPACE = "env-space";

		const space = await loadSpace();
		expect(space).toBe("env-space");
	});

	test("saveSpace overwrites previous local space", async () => {
		await saveSpace("space-a");
		await saveSpace("space-b");
		const space = await loadSpace();
		expect(space).toBe("space-b");
	});

	test("loadSpace returns string or undefined when no local file exists", async () => {
		// Remove local space file to test fallback behavior
		try {
			await rm(LOCAL_SPACE_FILE, { force: true });
		} catch {
			// Ignore
		}
		const space = await loadSpace();
		// Should be either a string (from global fallback) or undefined
		expect(space === undefined || typeof space === "string").toBe(true);
	});
});
