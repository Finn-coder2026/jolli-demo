import { resetConfig } from "../config/Config";
import {
	generateConnectCode,
	generateConnectState,
	generateEncryptionKey,
	generateSigningKey,
	getProviderKeys,
	isEncryptedState,
	validateConnectCode,
	validateConnectState,
} from "./ConnectStateService";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ConnectStateService", () => {
	const testEncryptionKey = generateEncryptionKey();
	const testSigningKey = generateSigningKey();

	let originalGitHubEncryptionKey: string | undefined;
	let originalGitHubSigningKey: string | undefined;

	beforeEach(() => {
		// Reset config cache before each test
		resetConfig();

		// Save original values
		originalGitHubEncryptionKey = process.env.GITHUB_CONNECT_ENCRYPTION_KEY;
		originalGitHubSigningKey = process.env.GITHUB_CONNECT_SIGNING_KEY;

		// Set test keys for GitHub provider
		process.env.GITHUB_CONNECT_ENCRYPTION_KEY = testEncryptionKey;
		process.env.GITHUB_CONNECT_SIGNING_KEY = testSigningKey;
	});

	afterEach(() => {
		// Restore original values
		if (originalGitHubEncryptionKey === undefined) {
			delete process.env.GITHUB_CONNECT_ENCRYPTION_KEY;
		} else {
			process.env.GITHUB_CONNECT_ENCRYPTION_KEY = originalGitHubEncryptionKey;
		}
		if (originalGitHubSigningKey === undefined) {
			delete process.env.GITHUB_CONNECT_SIGNING_KEY;
		} else {
			process.env.GITHUB_CONNECT_SIGNING_KEY = originalGitHubSigningKey;
		}
		vi.useRealTimers();
		resetConfig();
	});

	describe("getProviderKeys", () => {
		it("should return keys for configured provider", () => {
			const keys = getProviderKeys("github");
			expect(keys).not.toBeNull();
			expect(keys?.encryptionKey).toBeInstanceOf(Buffer);
			expect(keys?.encryptionKey.length).toBe(32);
			expect(typeof keys?.signingKey).toBe("string");
		});

		it("should return null for unconfigured provider", () => {
			const keys = getProviderKeys("unconfigured");
			expect(keys).toBeNull();
		});

		it("should return null if encryption key is missing", () => {
			delete process.env.GITHUB_CONNECT_ENCRYPTION_KEY;
			resetConfig();
			const keys = getProviderKeys("github");
			expect(keys).toBeNull();
		});

		it("should return null if signing key is missing", () => {
			delete process.env.GITHUB_CONNECT_SIGNING_KEY;
			resetConfig();
			const keys = getProviderKeys("github");
			expect(keys).toBeNull();
		});

		it("should return null if encryption key is wrong length", () => {
			process.env.GITHUB_CONNECT_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
			resetConfig();
			const keys = getProviderKeys("github");
			expect(keys).toBeNull();
		});
	});

	describe("generateConnectState", () => {
		it("should generate a non-empty state", () => {
			const state = generateConnectState("github", "acme", "default", "https://acme.jolli.ai");
			expect(state).toBeTruthy();
			expect(typeof state).toBe("string");
			expect(state.length).toBeGreaterThan(0);
		});

		it("should generate different states for different inputs", () => {
			const state1 = generateConnectState("github", "acme", "default", "https://acme.jolli.ai");
			const state2 = generateConnectState("github", "other", "default", "https://other.jolli.ai");
			expect(state1).not.toBe(state2);
		});

		it("should generate different states each time (random IV)", () => {
			const state1 = generateConnectState("github", "acme", "default", "https://acme.jolli.ai");
			const state2 = generateConnectState("github", "acme", "default", "https://acme.jolli.ai");
			expect(state1).not.toBe(state2);
		});

		it("should handle undefined orgSlug", () => {
			const state = generateConnectState("github", "acme", undefined, "https://acme.jolli.ai");
			expect(state).toBeTruthy();
		});

		it("should throw if provider keys are not configured", () => {
			delete process.env.GITHUB_CONNECT_ENCRYPTION_KEY;
			delete process.env.GITHUB_CONNECT_SIGNING_KEY;
			resetConfig();
			expect(() => generateConnectState("github", "acme", "default", "https://acme.jolli.ai")).toThrow(
				"Connect keys not configured for provider: github",
			);
		});
	});

	describe("validateConnectState", () => {
		it("should validate and decrypt a valid state", () => {
			const state = generateConnectState("github", "acme", "default", "https://acme.jolli.ai");
			const payload = validateConnectState(state);

			expect(payload).not.toBeNull();
			expect(payload?.provider).toBe("github");
			expect(payload?.tenantSlug).toBe("acme");
			expect(payload?.orgSlug).toBe("default");
			expect(payload?.returnTo).toBe("https://acme.jolli.ai");
			expect(payload?.issuedAt).toBeDefined();
			expect(payload?.expiresAt).toBeDefined();
		});

		it("should return null for tampered state", () => {
			const state = generateConnectState("github", "acme", "default", "https://acme.jolli.ai");
			// Tamper with the state by decoding, modifying the signature, and re-encoding
			const decoded = Buffer.from(state, "base64url").toString("utf8");
			const parsed = JSON.parse(decoded);
			// Modify the signature to make it invalid
			parsed.sig = "0".repeat(64);
			const tamperedState = Buffer.from(JSON.stringify(parsed), "utf8").toString("base64url");
			const payload = validateConnectState(tamperedState);
			expect(payload).toBeNull();
		});

		it("should return null for invalid base64", () => {
			const payload = validateConnectState("not-valid-base64!!!");
			expect(payload).toBeNull();
		});

		it("should return null for expired state", () => {
			const state = generateConnectState("github", "acme", "default", "https://acme.jolli.ai");

			// Fast forward time past expiry (5 minutes + buffer)
			vi.useFakeTimers();
			vi.setSystemTime(Date.now() + 6 * 60 * 1000); // 6 minutes later

			const payload = validateConnectState(state);
			expect(payload).toBeNull();
		});

		it("should return null if keys are not configured", () => {
			const state = generateConnectState("github", "acme", "default", "https://acme.jolli.ai");

			delete process.env.GITHUB_CONNECT_ENCRYPTION_KEY;
			delete process.env.GITHUB_CONNECT_SIGNING_KEY;
			resetConfig();

			const payload = validateConnectState(state);
			expect(payload).toBeNull();
		});

		it("should return null for state signed with different key", () => {
			const state = generateConnectState("github", "acme", "default", "https://acme.jolli.ai");

			// Change signing key
			process.env.GITHUB_CONNECT_SIGNING_KEY = generateSigningKey();
			resetConfig();

			const payload = validateConnectState(state);
			expect(payload).toBeNull();
		});
	});

	describe("generateConnectCode", () => {
		interface TestCodeData {
			installationId: number;
			accountLogin: string;
			containerType: "org" | "user";
			repoNames: Array<string>;
		}

		const testCodeData: TestCodeData = {
			installationId: 12345,
			accountLogin: "acme-org",
			containerType: "org",
			repoNames: ["acme-org/repo1", "acme-org/repo2"],
		};

		it("should generate a non-empty code", () => {
			const code = generateConnectCode("github", "acme", "default", testCodeData);
			expect(code).toBeTruthy();
			expect(typeof code).toBe("string");
			expect(code.length).toBeGreaterThan(0);
		});

		it("should generate different codes for different inputs", () => {
			const code1 = generateConnectCode("github", "acme", "default", testCodeData);
			const code2 = generateConnectCode("github", "other", "default", testCodeData);
			expect(code1).not.toBe(code2);
		});

		it("should throw if provider keys are not configured", () => {
			delete process.env.GITHUB_CONNECT_ENCRYPTION_KEY;
			delete process.env.GITHUB_CONNECT_SIGNING_KEY;
			resetConfig();
			expect(() => generateConnectCode("github", "acme", "default", testCodeData)).toThrow(
				"Connect keys not configured for provider: github",
			);
		});
	});

	describe("validateConnectCode", () => {
		interface TestCodeData {
			installationId: number;
			accountLogin: string;
			containerType: "org" | "user";
			repoNames: Array<string>;
		}

		const testCodeData: TestCodeData = {
			installationId: 12345,
			accountLogin: "acme-org",
			containerType: "org",
			repoNames: ["acme-org/repo1", "acme-org/repo2"],
		};

		it("should validate and decrypt a valid code", () => {
			const code = generateConnectCode("github", "acme", "default", testCodeData);
			const result = validateConnectCode<TestCodeData>("github", code);

			expect(result).not.toBeNull();
			expect(result?.tenantSlug).toBe("acme");
			expect(result?.orgSlug).toBe("default");
			expect(result?.data.installationId).toBe(12345);
			expect(result?.data.accountLogin).toBe("acme-org");
			expect(result?.data.containerType).toBe("org");
			expect(result?.data.repoNames).toEqual(["acme-org/repo1", "acme-org/repo2"]);
		});

		it("should return null for tampered code", () => {
			const code = generateConnectCode("github", "acme", "default", testCodeData);
			// Tamper with the code
			const tamperedCode = code.slice(0, -1) + (code.slice(-1) === "a" ? "b" : "a");
			const result = validateConnectCode<TestCodeData>("github", tamperedCode);
			expect(result).toBeNull();
		});

		it("should return null for expired code", () => {
			const code = generateConnectCode("github", "acme", "default", testCodeData);

			// Fast forward time past expiry (5 minutes + buffer)
			vi.useFakeTimers();
			vi.setSystemTime(Date.now() + 6 * 60 * 1000);

			const result = validateConnectCode<TestCodeData>("github", code);
			expect(result).toBeNull();
		});

		it("should return null for wrong provider", () => {
			// Generate code for github
			const code = generateConnectCode("github", "acme", "default", testCodeData);

			// Try to validate with different provider (would need different keys)
			// Since gitlab keys aren't configured, this should return null
			const result = validateConnectCode<TestCodeData>("gitlab", code);
			expect(result).toBeNull();
		});

		it("should return null if provider keys are not configured", () => {
			const code = generateConnectCode("github", "acme", "default", testCodeData);

			delete process.env.GITHUB_CONNECT_ENCRYPTION_KEY;
			delete process.env.GITHUB_CONNECT_SIGNING_KEY;
			resetConfig();

			const result = validateConnectCode<TestCodeData>("github", code);
			expect(result).toBeNull();
		});

		it("should return null for provider mismatch when keys are same", () => {
			// Set up gitlab to use the same keys as github
			process.env.GITLAB_CONNECT_ENCRYPTION_KEY = process.env.GITHUB_CONNECT_ENCRYPTION_KEY;
			process.env.GITLAB_CONNECT_SIGNING_KEY = process.env.GITHUB_CONNECT_SIGNING_KEY;
			resetConfig();

			// Generate a code for github
			const code = generateConnectCode("github", "acme", "default", testCodeData);

			// Try to validate with gitlab (same keys, but provider mismatch)
			// The code decrypts successfully but the provider field inside says "github"
			const result = validateConnectCode<TestCodeData>("gitlab", code);
			expect(result).toBeNull();
		});
	});

	describe("isEncryptedState", () => {
		it("should return true for encrypted state", () => {
			const state = generateConnectState("github", "acme", "default", "https://acme.jolli.ai");
			expect(isEncryptedState(state)).toBe(true);
		});

		it("should return false for plain URL", () => {
			const plainUrl = encodeURIComponent("https://acme.jolli.ai");
			expect(isEncryptedState(plainUrl)).toBe(false);
		});

		it("should return false for URL starting with http", () => {
			expect(isEncryptedState("https://acme.jolli.ai")).toBe(false);
			expect(isEncryptedState("http://localhost:3000")).toBe(false);
		});

		it("should return false for empty string", () => {
			expect(isEncryptedState("")).toBe(false);
		});

		it("should return false for random string that is not encrypted", () => {
			expect(isEncryptedState("random-string-123")).toBe(false);
		});

		it("should return false for base64 that is not encrypted structure", () => {
			const base64 = Buffer.from('{"foo":"bar"}').toString("base64url");
			expect(isEncryptedState(base64)).toBe(false);
		});

		it("should handle invalid percent-encoded strings", () => {
			// This will cause decodeURIComponent to throw, triggering the catch block
			const invalidPercentEncoded = "%E0%A4%A";
			expect(isEncryptedState(invalidPercentEncoded)).toBe(false);
		});
	});

	describe("key generation", () => {
		it("should generate 32-byte encryption key", () => {
			const key = generateEncryptionKey();
			const decoded = Buffer.from(key, "base64");
			expect(decoded.length).toBe(32);
		});

		it("should generate 32-byte signing key", () => {
			const key = generateSigningKey();
			const decoded = Buffer.from(key, "base64");
			expect(decoded.length).toBe(32);
		});

		it("should generate unique keys each time", () => {
			const key1 = generateEncryptionKey();
			const key2 = generateEncryptionKey();
			expect(key1).not.toBe(key2);
		});
	});

	describe("provider name case insensitivity", () => {
		it("should work with lowercase provider names", () => {
			const state = generateConnectState("github", "acme", "default", "https://acme.jolli.ai");
			const payload = validateConnectState(state);
			expect(payload).not.toBeNull();
		});

		// Note: The config lookup converts to uppercase, so the env var should always be uppercase
		// This test ensures the provider name "github" maps to "GITHUB_CONNECT_ENCRYPTION_KEY"
		it("should look up keys with uppercase provider name", () => {
			const keys = getProviderKeys("github");
			expect(keys).not.toBeNull();
		});
	});
});
