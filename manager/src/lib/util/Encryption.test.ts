import { decrypt, encrypt, generateEncryptionKey } from "./Encryption";
import { describe, expect, it } from "vitest";

describe("Encryption", () => {
	const testKey = generateEncryptionKey();

	describe("generateEncryptionKey", () => {
		it("should generate a 64-character hex string", () => {
			const key = generateEncryptionKey();
			expect(key).toHaveLength(64);
			expect(/^[0-9a-f]+$/i.test(key)).toBe(true);
		});

		it("should generate unique keys each time", () => {
			const key1 = generateEncryptionKey();
			const key2 = generateEncryptionKey();
			expect(key1).not.toBe(key2);
		});
	});

	describe("encrypt and decrypt", () => {
		it("should encrypt and decrypt a simple string", () => {
			const plaintext = "Hello, World!";
			const encrypted = encrypt(plaintext, testKey);
			const decrypted = decrypt(encrypted, testKey);
			expect(decrypted).toBe(plaintext);
		});

		it("should encrypt and decrypt JSON data", () => {
			const data = {
				accessToken: "abc123",
				refreshToken: "def456",
				expiresAt: 1234567890,
			};
			const plaintext = JSON.stringify(data);
			const encrypted = encrypt(plaintext, testKey);
			const decrypted = decrypt(encrypted, testKey);
			expect(JSON.parse(decrypted)).toEqual(data);
		});

		it("should produce different ciphertext each time (due to random IV)", () => {
			const plaintext = "Same message";
			const encrypted1 = encrypt(plaintext, testKey);
			const encrypted2 = encrypt(plaintext, testKey);
			expect(encrypted1).not.toBe(encrypted2);

			// But both should decrypt to the same value
			expect(decrypt(encrypted1, testKey)).toBe(plaintext);
			expect(decrypt(encrypted2, testKey)).toBe(plaintext);
		});

		it("should handle empty strings", () => {
			const plaintext = "";
			const encrypted = encrypt(plaintext, testKey);
			const decrypted = decrypt(encrypted, testKey);
			expect(decrypted).toBe(plaintext);
		});

		it("should handle unicode characters", () => {
			const plaintext = "Héllo, 世界! 🌍 Привет мир";
			const encrypted = encrypt(plaintext, testKey);
			const decrypted = decrypt(encrypted, testKey);
			expect(decrypted).toBe(plaintext);
		});

		it("should fail decryption with wrong key", () => {
			const plaintext = "Secret message";
			const encrypted = encrypt(plaintext, testKey);
			const wrongKey = generateEncryptionKey();
			expect(() => decrypt(encrypted, wrongKey)).toThrow();
		});

		it("should fail decryption with corrupted data", () => {
			const plaintext = "Secret message";
			const encrypted = encrypt(plaintext, testKey);
			// Corrupt the encrypted data
			const corruptedBytes = Buffer.from(encrypted, "base64");
			corruptedBytes[0] = corruptedBytes[0] ^ 0xff;
			const corrupted = corruptedBytes.toString("base64");
			expect(() => decrypt(corrupted, testKey)).toThrow();
		});

		it("should work with minimum length key (32 bytes / 64 hex chars)", () => {
			const minKey = "0".repeat(64);
			const plaintext = "Test message";
			const encrypted = encrypt(plaintext, minKey);
			const decrypted = decrypt(encrypted, minKey);
			expect(decrypted).toBe(plaintext);
		});
	});
});
