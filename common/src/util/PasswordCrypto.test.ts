import { decryptPassword, encryptPassword, generatePasswordEncryptionKey, isEncryptedPassword } from "./PasswordCrypto";
import { describe, expect, it } from "vitest";

describe("PasswordCrypto", () => {
	// Generate a valid test key
	const testKey = generatePasswordEncryptionKey();

	describe("encryptPassword", () => {
		it("should encrypt a simple password", () => {
			const password = "mysecretpassword123";
			const encrypted = encryptPassword(password, testKey);

			// Result should be base64 encoded
			expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);

			// Result should be different from input
			expect(encrypted).not.toBe(password);
		});

		it("should produce different ciphertext for same password (due to random IV)", () => {
			const password = "samepassword";
			const encrypted1 = encryptPassword(password, testKey);
			const encrypted2 = encryptPassword(password, testKey);

			// Each encryption should be unique due to random IV
			expect(encrypted1).not.toBe(encrypted2);
		});

		it("should throw error for invalid key length", () => {
			const password = "test";
			const shortKey = Buffer.from("tooshort").toString("base64");

			expect(() => encryptPassword(password, shortKey)).toThrow(
				"Encryption key must be 32 bytes (256 bits) when decoded from base64",
			);
		});

		it("should handle passwords with special characters", () => {
			const password = "p@$$w0rd!#$%^&*()_+-=[]{}|;':\",./<>?`~";
			const encrypted = encryptPassword(password, testKey);

			expect(encrypted).toBeDefined();
			expect(encrypted.length).toBeGreaterThan(0);
		});

		it("should handle passwords with unicode characters", () => {
			const password = "password123!@#";
			const encrypted = encryptPassword(password, testKey);

			expect(encrypted).toBeDefined();
			expect(encrypted.length).toBeGreaterThan(0);
		});

		it("should handle empty password", () => {
			const password = "";
			const encrypted = encryptPassword(password, testKey);

			expect(encrypted).toBeDefined();
		});
	});

	describe("decryptPassword", () => {
		it("should decrypt an encrypted password", () => {
			const originalPassword = "mysecretpassword123";
			const encrypted = encryptPassword(originalPassword, testKey);
			const decrypted = decryptPassword(encrypted, testKey);

			expect(decrypted).toBe(originalPassword);
		});

		it("should correctly round-trip passwords with special characters", () => {
			const originalPassword = "p@$$w0rd!#$%^&*()_+-=[]{}|;':\",./<>?`~";
			const encrypted = encryptPassword(originalPassword, testKey);
			const decrypted = decryptPassword(encrypted, testKey);

			expect(decrypted).toBe(originalPassword);
		});

		it("should correctly round-trip passwords with unicode characters", () => {
			const originalPassword = "password123!@#";
			const encrypted = encryptPassword(originalPassword, testKey);
			const decrypted = decryptPassword(encrypted, testKey);

			expect(decrypted).toBe(originalPassword);
		});

		it("should correctly round-trip empty password", () => {
			const originalPassword = "";
			const encrypted = encryptPassword(originalPassword, testKey);
			const decrypted = decryptPassword(encrypted, testKey);

			expect(decrypted).toBe(originalPassword);
		});

		it("should throw error when decrypting with wrong key", () => {
			const originalPassword = "secretpassword";
			const encrypted = encryptPassword(originalPassword, testKey);
			const wrongKey = generatePasswordEncryptionKey();

			expect(() => decryptPassword(encrypted, wrongKey)).toThrow();
		});

		it("should throw error for invalid key length", () => {
			const encrypted = encryptPassword("test", testKey);
			const shortKey = Buffer.from("tooshort").toString("base64");

			expect(() => decryptPassword(encrypted, shortKey)).toThrow(
				"Encryption key must be 32 bytes (256 bits) when decoded from base64",
			);
		});

		it("should throw error for tampered ciphertext", () => {
			const originalPassword = "secretpassword";
			const encrypted = encryptPassword(originalPassword, testKey);

			// Tamper with the encrypted data by modifying a character in the middle
			const tamperedChars = encrypted.split("");
			const midpoint = Math.floor(tamperedChars.length / 2);
			tamperedChars[midpoint] = tamperedChars[midpoint] === "A" ? "B" : "A";
			const tampered = tamperedChars.join("");

			expect(() => decryptPassword(tampered, testKey)).toThrow();
		});

		it("should throw error for malformed base64", () => {
			const malformedEncrypted = "not-valid-base64!!!";

			expect(() => decryptPassword(malformedEncrypted, testKey)).toThrow();
		});

		it("should throw error for invalid JSON structure", () => {
			const invalidJson = Buffer.from("not-json", "utf8").toString("base64");

			expect(() => decryptPassword(invalidJson, testKey)).toThrow();
		});
	});

	describe("isEncryptedPassword", () => {
		it("should return true for encrypted password", () => {
			const encrypted = encryptPassword("password123", testKey);

			expect(isEncryptedPassword(encrypted)).toBe(true);
		});

		it("should return false for plaintext password", () => {
			expect(isEncryptedPassword("plainpassword123")).toBe(false);
		});

		it("should return false for empty string", () => {
			expect(isEncryptedPassword("")).toBe(false);
		});

		it("should return false for random base64 string without proper structure", () => {
			const randomBase64 = Buffer.from("random-data-here", "utf8").toString("base64");

			expect(isEncryptedPassword(randomBase64)).toBe(false);
		});

		it("should return false for JSON with missing fields", () => {
			const partialJson = Buffer.from(JSON.stringify({ iv: "test" }), "utf8").toString("base64");

			expect(isEncryptedPassword(partialJson)).toBe(false);
		});

		it("should return false for JSON with extra fields", () => {
			const extraFields = Buffer.from(
				JSON.stringify({ iv: "test", ciphertext: "test", tag: "test", extra: "field" }),
				"utf8",
			).toString("base64");

			expect(isEncryptedPassword(extraFields)).toBe(false);
		});

		it("should return false for JSON with wrong field types", () => {
			const wrongTypes = Buffer.from(
				JSON.stringify({ iv: 123, ciphertext: "test", tag: "test" }),
				"utf8",
			).toString("base64");

			expect(isEncryptedPassword(wrongTypes)).toBe(false);
		});

		it("should return false for JSON primitive value (not object)", () => {
			const primitiveJson = Buffer.from(JSON.stringify("just a string"), "utf8").toString("base64");
			expect(isEncryptedPassword(primitiveJson)).toBe(false);

			const numberJson = Buffer.from(JSON.stringify(12345), "utf8").toString("base64");
			expect(isEncryptedPassword(numberJson)).toBe(false);

			const nullJson = Buffer.from(JSON.stringify(null), "utf8").toString("base64");
			expect(isEncryptedPassword(nullJson)).toBe(false);
		});
	});

	describe("generatePasswordEncryptionKey", () => {
		it("should generate a valid base64 encoded key", () => {
			const key = generatePasswordEncryptionKey();

			// Should be base64 encoded
			expect(key).toMatch(/^[A-Za-z0-9+/=]+$/);

			// Should decode to 32 bytes
			const decoded = Buffer.from(key, "base64");
			expect(decoded.length).toBe(32);
		});

		it("should generate unique keys each time", () => {
			const key1 = generatePasswordEncryptionKey();
			const key2 = generatePasswordEncryptionKey();

			expect(key1).not.toBe(key2);
		});

		it("should generate keys that work with encrypt/decrypt", () => {
			const key = generatePasswordEncryptionKey();
			const password = "testpassword";

			const encrypted = encryptPassword(password, key);
			const decrypted = decryptPassword(encrypted, key);

			expect(decrypted).toBe(password);
		});
	});
});
