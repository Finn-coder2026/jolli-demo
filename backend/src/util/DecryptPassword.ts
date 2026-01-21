import { getConfig } from "../config/Config";
import { decryptPassword, isEncryptedPassword } from "jolli-common/server";

/**
 * Decrypts a database password using the configured encryption key.
 *
 * This function supports a fallback for existing unencrypted passwords:
 * - If DB_PASSWORD_ENCRYPTION_KEY is not configured, returns the input as-is
 * - If the input is not an encrypted password (detected by isEncryptedPassword), returns as-is
 * - Otherwise, decrypts using AES-256-GCM
 *
 * Returns a Promise to match the expected type signature for multi-tenant infrastructure.
 *
 * @param encrypted - The encrypted (or plaintext) password
 * @returns Promise that resolves to the decrypted password, or the original value if not encrypted
 */
export function decryptDatabasePassword(encrypted: string): Promise<string> {
	const config = getConfig();

	// Fallback: if no encryption key configured, return as-is
	if (!config.DB_PASSWORD_ENCRYPTION_KEY) {
		return Promise.resolve(encrypted);
	}

	// Fallback: if value doesn't look like an encrypted password, return as-is
	// This supports existing unencrypted passwords during migration
	if (!isEncryptedPassword(encrypted)) {
		return Promise.resolve(encrypted);
	}

	// Decrypt the password
	return Promise.resolve(decryptPassword(encrypted, config.DB_PASSWORD_ENCRYPTION_KEY));
}
