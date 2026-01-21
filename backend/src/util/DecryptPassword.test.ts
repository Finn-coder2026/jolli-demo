import * as Config from "../config/Config";
import { decryptDatabasePassword } from "./DecryptPassword";
import { encryptPassword, generatePasswordEncryptionKey } from "jolli-common/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("DecryptPassword", () => {
	const testKey = generatePasswordEncryptionKey();

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("decryptDatabasePassword", () => {
		it("should return plaintext password when no encryption key is configured", async () => {
			vi.spyOn(Config, "getConfig").mockReturnValue({
				DB_PASSWORD_ENCRYPTION_KEY: undefined,
			} as ReturnType<typeof Config.getConfig>);

			const password = "plaintext-password";
			const result = await decryptDatabasePassword(password);

			expect(result).toBe(password);
		});

		it("should return plaintext password when value is not encrypted", async () => {
			vi.spyOn(Config, "getConfig").mockReturnValue({
				DB_PASSWORD_ENCRYPTION_KEY: testKey,
			} as ReturnType<typeof Config.getConfig>);

			const password = "plaintext-password";
			const result = await decryptDatabasePassword(password);

			expect(result).toBe(password);
		});

		it("should decrypt encrypted password when encryption key is configured", async () => {
			vi.spyOn(Config, "getConfig").mockReturnValue({
				DB_PASSWORD_ENCRYPTION_KEY: testKey,
			} as ReturnType<typeof Config.getConfig>);

			const originalPassword = "my-secret-password";
			const encrypted = encryptPassword(originalPassword, testKey);
			const result = await decryptDatabasePassword(encrypted);

			expect(result).toBe(originalPassword);
		});

		it("should handle passwords with special characters", async () => {
			vi.spyOn(Config, "getConfig").mockReturnValue({
				DB_PASSWORD_ENCRYPTION_KEY: testKey,
			} as ReturnType<typeof Config.getConfig>);

			const originalPassword = "p@$$w0rd!#$%^&*()_+-=[]{}|;':\",./<>?`~";
			const encrypted = encryptPassword(originalPassword, testKey);
			const result = await decryptDatabasePassword(encrypted);

			expect(result).toBe(originalPassword);
		});

		it("should throw error when decrypting with wrong key", () => {
			const wrongKey = generatePasswordEncryptionKey();
			vi.spyOn(Config, "getConfig").mockReturnValue({
				DB_PASSWORD_ENCRYPTION_KEY: wrongKey,
			} as ReturnType<typeof Config.getConfig>);

			const originalPassword = "secret-password";
			const encrypted = encryptPassword(originalPassword, testKey);

			// Since decryptPassword throws synchronously before Promise.resolve,
			// the function will throw during execution
			expect(() => decryptDatabasePassword(encrypted)).toThrow();
		});

		it("should throw error when encryption key is invalid length", () => {
			// Use a key that's not 32 bytes when decoded
			const invalidKey = Buffer.from("short-key").toString("base64");
			vi.spyOn(Config, "getConfig").mockReturnValue({
				DB_PASSWORD_ENCRYPTION_KEY: invalidKey,
			} as ReturnType<typeof Config.getConfig>);

			const encrypted = encryptPassword("password", testKey);

			expect(() => decryptDatabasePassword(encrypted)).toThrow(
				"Encryption key must be 32 bytes (256 bits) when decoded from base64",
			);
		});

		it("should return plaintext for valid base64 JSON that is not an object", async () => {
			vi.spyOn(Config, "getConfig").mockReturnValue({
				DB_PASSWORD_ENCRYPTION_KEY: testKey,
			} as ReturnType<typeof Config.getConfig>);

			// Base64 encode a JSON array - valid base64, valid JSON, but not an object
			const jsonArray = Buffer.from(JSON.stringify([1, 2, 3]), "utf8").toString("base64");
			const result = await decryptDatabasePassword(jsonArray);

			// Should return as-is since it's not a valid encrypted password structure
			expect(result).toBe(jsonArray);
		});

		it("should return plaintext for valid base64 JSON null", async () => {
			vi.spyOn(Config, "getConfig").mockReturnValue({
				DB_PASSWORD_ENCRYPTION_KEY: testKey,
			} as ReturnType<typeof Config.getConfig>);

			// Base64 encode JSON null
			const jsonNull = Buffer.from("null", "utf8").toString("base64");
			const result = await decryptDatabasePassword(jsonNull);

			// Should return as-is since it's not a valid encrypted password structure
			expect(result).toBe(jsonNull);
		});
	});
});
