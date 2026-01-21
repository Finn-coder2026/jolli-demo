import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Derive a 32-byte key from the input string using SHA-256.
 * This allows using keys of any length while ensuring we have a proper 256-bit key.
 */
function deriveKey(key: string): Buffer {
	return createHash("sha256").update(key).digest();
}

/**
 * Encrypt a string using AES-256-GCM.
 * Returns a base64-encoded string containing: IV + ciphertext + auth tag.
 *
 * @param plaintext - The text to encrypt
 * @param key - The encryption key (will be derived to 32 bytes via SHA-256)
 * @returns Base64-encoded encrypted data
 */
export function encrypt(plaintext: string, key: string): string {
	const derivedKey = deriveKey(key);
	const iv = randomBytes(IV_LENGTH);

	const cipher = createCipheriv(ALGORITHM, derivedKey, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const authTag = cipher.getAuthTag();

	// Combine IV + ciphertext + auth tag
	const combined = Buffer.concat([iv, encrypted, authTag]);
	return combined.toString("base64");
}

/**
 * Decrypt a string that was encrypted with the encrypt function.
 *
 * @param encryptedData - Base64-encoded encrypted data (IV + ciphertext + auth tag)
 * @param key - The encryption key (will be derived to 32 bytes via SHA-256)
 * @returns The decrypted plaintext
 * @throws Error if decryption fails (wrong key or corrupted data)
 */
export function decrypt(encryptedData: string, key: string): string {
	const derivedKey = deriveKey(key);
	const combined = Buffer.from(encryptedData, "base64");

	// Extract IV, ciphertext, and auth tag
	const iv = combined.subarray(0, IV_LENGTH);
	const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
	const ciphertext = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);

	const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
	decipher.setAuthTag(authTag);

	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return decrypted.toString("utf8");
}

/**
 * Generate a random encryption key suitable for AES-256.
 * Returns a 64-character hex string (32 bytes).
 */
export function generateEncryptionKey(): string {
	return randomBytes(32).toString("hex");
}
