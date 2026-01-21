import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypted password structure (JSON stringified, then base64 encoded).
 */
interface EncryptedPassword {
	iv: string; // Base64 encoded
	ciphertext: string; // Base64 encoded
	tag: string; // Base64 encoded (GCM auth tag)
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits

/**
 * Encrypt a password using AES-256-GCM.
 *
 * @param plaintext - The password to encrypt
 * @param key - Base64 encoded 32-byte encryption key
 * @returns Base64 encoded encrypted password (JSON structure with iv, ciphertext, tag)
 */
export function encryptPassword(plaintext: string, key: string): string {
	const encryptionKey = Buffer.from(key, "base64");
	if (encryptionKey.length !== 32) {
		throw new Error("Encryption key must be 32 bytes (256 bits) when decoded from base64");
	}

	// Generate random IV
	const iv = randomBytes(IV_LENGTH);

	// Encrypt with AES-256-GCM
	const cipher = createCipheriv(ALGORITHM, encryptionKey, iv, { authTagLength: TAG_LENGTH });
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();

	// Create the encrypted structure
	const encryptedPassword: EncryptedPassword = {
		iv: iv.toString("base64"),
		ciphertext: encrypted.toString("base64"),
		tag: tag.toString("base64"),
	};

	// Base64 encode the JSON
	return Buffer.from(JSON.stringify(encryptedPassword), "utf8").toString("base64");
}

/**
 * Decrypt a password encrypted with encryptPassword.
 *
 * @param encrypted - Base64 encoded encrypted password
 * @param key - Base64 encoded 32-byte encryption key
 * @returns The decrypted password
 * @throws Error if decryption fails (invalid key, tampered data, etc.)
 */
export function decryptPassword(encrypted: string, key: string): string {
	const encryptionKey = Buffer.from(key, "base64");
	if (encryptionKey.length !== 32) {
		throw new Error("Encryption key must be 32 bytes (256 bits) when decoded from base64");
	}

	// Base64 decode and parse JSON
	const json = Buffer.from(encrypted, "base64").toString("utf8");
	const encryptedPassword = JSON.parse(json) as EncryptedPassword;

	const iv = Buffer.from(encryptedPassword.iv, "base64");
	const ciphertext = Buffer.from(encryptedPassword.ciphertext, "base64");
	const tag = Buffer.from(encryptedPassword.tag, "base64");

	// Decrypt
	const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv, { authTagLength: TAG_LENGTH });
	decipher.setAuthTag(tag);

	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return decrypted.toString("utf8");
}

/**
 * Check if a value appears to be an encrypted password.
 * This is used to support the fallback for existing unencrypted passwords.
 *
 * @param value - The value to check
 * @returns True if the value looks like an encrypted password (base64 encoded JSON with iv/ciphertext/tag)
 */
export function isEncryptedPassword(value: string): boolean {
	try {
		// Try to base64 decode
		const json = Buffer.from(value, "base64").toString("utf8");

		// Try to parse as JSON
		const parsed = JSON.parse(json) as unknown;

		// Check if it has the expected structure
		if (typeof parsed !== "object" || parsed === null) {
			return false;
		}

		const obj = parsed as Record<string, unknown>;
		return (
			typeof obj.iv === "string" &&
			typeof obj.ciphertext === "string" &&
			typeof obj.tag === "string" &&
			Object.keys(obj).length === 3
		);
	} catch {
		return false;
	}
}

/**
 * Generate a random encryption key suitable for use with encryptPassword/decryptPassword.
 * Returns a base64 encoded 32-byte key.
 *
 * @returns Base64 encoded 32-byte key
 */
export function generatePasswordEncryptionKey(): string {
	return randomBytes(32).toString("base64");
}
