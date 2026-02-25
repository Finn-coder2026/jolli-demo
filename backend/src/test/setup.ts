import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";

/**
 * Global environment cleanup to ensure tests have isolated process.env state.
 *
 * This captures the initial process.env state before all tests and restores it
 * after each test. This prevents environment variable pollution between tests.
 */
let originalEnvSnapshot: Record<string, string | undefined>;

beforeAll(() => {
	// Capture the initial environment state before any tests run
	originalEnvSnapshot = { ...process.env };
});

beforeEach(() => {
	// Before each test, reset process.env to the original state
	// This ensures each test starts with a clean environment
	// First, delete any keys that were added after the snapshot
	for (const key of Object.keys(process.env)) {
		if (!(key in originalEnvSnapshot)) {
			delete process.env[key];
		}
	}
	// Then restore original values
	for (const [key, value] of Object.entries(originalEnvSnapshot)) {
		if (value !== undefined) {
			process.env[key] = value;
		}
	}
});

afterEach(() => {
	// Clean up any stubbed environment variables from vitest
	vi.unstubAllEnvs();
});

// Mock uuid to fix ESM/CJS interop issue in Vitest
// Keep this local to test setup so backend build doesn't rely on transitive uuid typings.
vi.mock("uuid", () => {
	const v4 = () => randomUUID();
	return {
		v4,
		default: { v4 },
	};
});

// Mock ansi-styles to avoid Vitest ESM/CJS interop issues
vi.mock("ansi-styles", () => {
	const makeStyle = () => ({ open: "", close: "" });
	const color: Record<string, { open: string; close: string }> = {};
	const colorNames = [
		"black",
		"red",
		"green",
		"yellow",
		"blue",
		"magenta",
		"cyan",
		"white",
		"blackBright",
		"redBright",
		"greenBright",
		"yellowBright",
		"blueBright",
		"magentaBright",
		"cyanBright",
		"whiteBright",
		"gray",
		"grey",
	];
	for (const name of colorNames) {
		color[name] = makeStyle();
	}
	const styles = {
		bold: makeStyle(),
		color,
	};
	return { ...styles, default: styles };
});
