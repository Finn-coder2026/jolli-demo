import {
	decryptPassword,
	encryptPassword,
	generatePasswordEncryptionKey,
	generateSlug,
	isEncryptedPassword,
	isValidSlug,
} from "./server";
import { describe, expect, it } from "vitest";

describe("server exports", () => {
	it("should export password crypto functions", () => {
		// Verify all expected functions are exported
		expect(typeof encryptPassword).toBe("function");
		expect(typeof decryptPassword).toBe("function");
		expect(typeof isEncryptedPassword).toBe("function");
		expect(typeof generatePasswordEncryptionKey).toBe("function");
	});

	it("should encrypt and decrypt passwords correctly", () => {
		const key = generatePasswordEncryptionKey();
		const password = "test-password";
		const encrypted = encryptPassword(password, key);
		const decrypted = decryptPassword(encrypted, key);
		expect(decrypted).toBe(password);
	});

	it("should export slug utility functions", () => {
		expect(typeof generateSlug).toBe("function");
		expect(typeof isValidSlug).toBe("function");
	});
});
