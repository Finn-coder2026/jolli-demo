import { resetConfig } from "../config/Config";
import {
	type AuthUserInfo,
	generateAuthCode,
	generateEncryptionKey,
	generatePendingEmailAuthCode,
	generateSigningKey,
	validateAuthCode,
} from "./AuthCodeService";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("AuthCodeService", () => {
	const testUserInfo: AuthUserInfo = {
		email: "test@example.com",
		name: "Test User",
		picture: "https://example.com/avatar.jpg",
		provider: "jolli_google",
		subject: "123456789",
	};

	const testEncryptionKey = generateEncryptionKey();
	const testSigningKey = generateSigningKey();

	let originalEncryptionKey: string | undefined;
	let originalSigningKey: string | undefined;
	let originalExpiry: string | undefined;

	beforeEach(() => {
		// Reset config cache before each test
		resetConfig();

		// Save original values
		originalEncryptionKey = process.env.AUTH_CODE_ENCRYPTION_KEY;
		originalSigningKey = process.env.AUTH_CODE_SIGNING_KEY;
		originalExpiry = process.env.AUTH_CODE_EXPIRY;

		// Set test keys
		process.env.AUTH_CODE_ENCRYPTION_KEY = testEncryptionKey;
		process.env.AUTH_CODE_SIGNING_KEY = testSigningKey;
		process.env.AUTH_CODE_EXPIRY = "60s";
	});

	afterEach(() => {
		// Restore original values
		if (originalEncryptionKey === undefined) {
			delete process.env.AUTH_CODE_ENCRYPTION_KEY;
		} else {
			process.env.AUTH_CODE_ENCRYPTION_KEY = originalEncryptionKey;
		}
		if (originalSigningKey === undefined) {
			delete process.env.AUTH_CODE_SIGNING_KEY;
		} else {
			process.env.AUTH_CODE_SIGNING_KEY = originalSigningKey;
		}
		if (originalExpiry === undefined) {
			delete process.env.AUTH_CODE_EXPIRY;
		} else {
			process.env.AUTH_CODE_EXPIRY = originalExpiry;
		}
		vi.useRealTimers();
		resetConfig();
	});

	describe("generateAuthCode", () => {
		it("should generate a non-empty auth code", () => {
			const code = generateAuthCode(testUserInfo, "acme", "https://acme.jolli.ai");
			expect(code).toBeTruthy();
			expect(typeof code).toBe("string");
			expect(code.length).toBeGreaterThan(0);
		});

		it("should generate different codes for different inputs", () => {
			const code1 = generateAuthCode(testUserInfo, "acme", "https://acme.jolli.ai");
			const code2 = generateAuthCode(testUserInfo, "other", "https://other.jolli.ai");
			expect(code1).not.toBe(code2);
		});

		it("should throw if encryption key is not configured", () => {
			delete process.env.AUTH_CODE_ENCRYPTION_KEY;
			resetConfig(); // Reset config cache after env change
			expect(() => generateAuthCode(testUserInfo, "acme", "https://acme.jolli.ai")).toThrow(
				"AUTH_CODE_ENCRYPTION_KEY is not configured",
			);
		});

		it("should throw if signing key is not configured", () => {
			delete process.env.AUTH_CODE_SIGNING_KEY;
			resetConfig(); // Reset config cache after env change
			expect(() => generateAuthCode(testUserInfo, "acme", "https://acme.jolli.ai")).toThrow(
				"AUTH_CODE_SIGNING_KEY is not configured",
			);
		});

		it("should throw if encryption key is wrong length", () => {
			process.env.AUTH_CODE_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
			resetConfig(); // Reset config cache after env change
			expect(() => generateAuthCode(testUserInfo, "acme", "https://acme.jolli.ai")).toThrow(
				"AUTH_CODE_ENCRYPTION_KEY must be 32 bytes",
			);
		});
	});

	describe("validateAuthCode", () => {
		it("should validate and decrypt a valid auth code", () => {
			const code = generateAuthCode(testUserInfo, "acme", "https://acme.jolli.ai");
			const payload = validateAuthCode(code);

			expect(payload).not.toBeNull();
			expect(payload?.userInfo.email).toBe("test@example.com");
			expect(payload?.userInfo.name).toBe("Test User");
			expect(payload?.userInfo.provider).toBe("jolli_google");
			expect(payload?.tenantSlug).toBe("acme");
			expect(payload?.returnTo).toBe("https://acme.jolli.ai");
		});

		it("should return null for tampered code", () => {
			const code = generateAuthCode(testUserInfo, "acme", "https://acme.jolli.ai");
			// Tamper with the code by changing a character
			const tamperedCode = code.slice(0, -1) + (code.slice(-1) === "a" ? "b" : "a");
			const payload = validateAuthCode(tamperedCode);
			expect(payload).toBeNull();
		});

		it("should return null for invalid base64", () => {
			const payload = validateAuthCode("not-valid-base64!!!");
			expect(payload).toBeNull();
		});

		it("should return null for expired code", () => {
			const code = generateAuthCode(testUserInfo, "acme", "https://acme.jolli.ai");

			// Fast forward time past expiry
			vi.useFakeTimers();
			vi.setSystemTime(Date.now() + 120000); // 2 minutes later

			const payload = validateAuthCode(code);
			expect(payload).toBeNull();
		});

		it("should return null if keys are not configured", () => {
			const code = generateAuthCode(testUserInfo, "acme", "https://acme.jolli.ai");

			delete process.env.AUTH_CODE_ENCRYPTION_KEY;
			delete process.env.AUTH_CODE_SIGNING_KEY;
			resetConfig(); // Reset config cache after env change

			const payload = validateAuthCode(code);
			expect(payload).toBeNull();
		});

		it("should return null for code signed with different key", () => {
			const code = generateAuthCode(testUserInfo, "acme", "https://acme.jolli.ai");

			// Change signing key
			process.env.AUTH_CODE_SIGNING_KEY = generateSigningKey();
			resetConfig(); // Reset config cache after env change

			const payload = validateAuthCode(code);
			expect(payload).toBeNull();
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

	describe("generatePendingEmailAuthCode", () => {
		const testEmails = ["test1@example.com", "test2@example.com"];
		const testAuthJson = { login: "testuser", id: 12345 };

		it("should generate a non-empty auth code", () => {
			const code = generatePendingEmailAuthCode(
				testEmails,
				testAuthJson,
				"github",
				"acme",
				"https://acme.jolli.ai",
			);
			expect(code).toBeTruthy();
			expect(typeof code).toBe("string");
			expect(code.length).toBeGreaterThan(0);
		});

		it("should include pending email selection data in payload", () => {
			const code = generatePendingEmailAuthCode(
				testEmails,
				testAuthJson,
				"github",
				"acme",
				"https://acme.jolli.ai",
			);
			const payload = validateAuthCode(code);

			expect(payload).not.toBeNull();
			expect(payload?.pendingEmailSelection).toBeDefined();
			expect(payload?.pendingEmailSelection?.emails).toEqual(testEmails);
			expect(payload?.pendingEmailSelection?.authJson).toEqual(testAuthJson);
			expect(payload?.pendingEmailSelection?.providerName).toBe("github");
		});

		it("should set placeholder userInfo", () => {
			const code = generatePendingEmailAuthCode(
				testEmails,
				testAuthJson,
				"github",
				"acme",
				"https://acme.jolli.ai",
			);
			const payload = validateAuthCode(code);

			expect(payload?.userInfo.email).toBe("");
			expect(payload?.userInfo.name).toBe("");
			expect(payload?.userInfo.provider).toBe("jolli_github");
			expect(payload?.userInfo.subject).toBe("");
		});

		it("should include tenant and returnTo", () => {
			const code = generatePendingEmailAuthCode(
				testEmails,
				testAuthJson,
				"github",
				"acme",
				"https://acme.jolli.ai",
			);
			const payload = validateAuthCode(code);

			expect(payload?.tenantSlug).toBe("acme");
			expect(payload?.returnTo).toBe("https://acme.jolli.ai");
		});

		it("should throw if encryption key is not configured", () => {
			delete process.env.AUTH_CODE_ENCRYPTION_KEY;
			resetConfig();
			expect(() =>
				generatePendingEmailAuthCode(testEmails, testAuthJson, "github", "acme", "https://acme.jolli.ai"),
			).toThrow("AUTH_CODE_ENCRYPTION_KEY is not configured");
		});

		it("should throw if signing key is not configured", () => {
			delete process.env.AUTH_CODE_SIGNING_KEY;
			resetConfig();
			expect(() =>
				generatePendingEmailAuthCode(testEmails, testAuthJson, "github", "acme", "https://acme.jolli.ai"),
			).toThrow("AUTH_CODE_SIGNING_KEY is not configured");
		});

		it("should throw if encryption key is wrong length", () => {
			process.env.AUTH_CODE_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
			resetConfig();
			expect(() =>
				generatePendingEmailAuthCode(testEmails, testAuthJson, "github", "acme", "https://acme.jolli.ai"),
			).toThrow("AUTH_CODE_ENCRYPTION_KEY must be 32 bytes");
		});
	});
});
