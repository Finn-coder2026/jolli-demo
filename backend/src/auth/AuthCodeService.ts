import { getConfig } from "../config/Config";
import { getLog } from "../util/Logger";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import ms from "ms";

const log = getLog(import.meta);

/**
 * User info from OAuth provider, included in auth code.
 */
export interface AuthUserInfo {
	email: string;
	name: string;
	picture?: string;
	provider: string;
	subject: string;
}

/**
 * Pending email selection info - used when user has multiple verified emails.
 */
export interface PendingEmailSelection {
	emails: Array<string>;
	authJson: Record<string, unknown>;
	providerName: string;
}

/**
 * Auth code payload - the data encrypted inside the auth code.
 */
export interface AuthCodePayload {
	userInfo: AuthUserInfo;
	tenantSlug: string;
	returnTo: string;
	issuedAt: number;
	expiresAt: number;
	/** Present when email selection is needed on the tenant */
	pendingEmailSelection?: PendingEmailSelection;
}

/**
 * Encrypted auth code structure (before base64url encoding).
 */
interface EncryptedAuthCode {
	iv: string; // Base64 encoded
	ciphertext: string; // Base64 encoded
	tag: string; // Base64 encoded (GCM auth tag)
	sig: string; // Hex encoded HMAC signature
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits

/**
 * Generate an encrypted, signed auth code.
 *
 * The auth code contains user info from OAuth and is cryptographically bound to a specific tenant.
 * It's encrypted with AES-256-GCM to protect PII and signed with HMAC-SHA256 to prevent tampering.
 *
 * @param userInfo - User info from OAuth provider
 * @param tenantSlug - The tenant this auth code is for
 * @param returnTo - The URL to redirect to after auth completes
 * @returns Base64url encoded encrypted auth code
 */
export function generateAuthCode(userInfo: AuthUserInfo, tenantSlug: string, returnTo: string): string {
	const config = getConfig();

	if (!config.AUTH_CODE_ENCRYPTION_KEY) {
		throw new Error("AUTH_CODE_ENCRYPTION_KEY is not configured");
	}
	if (!config.AUTH_CODE_SIGNING_KEY) {
		throw new Error("AUTH_CODE_SIGNING_KEY is not configured");
	}

	const encryptionKey = Buffer.from(config.AUTH_CODE_ENCRYPTION_KEY, "base64");
	if (encryptionKey.length !== 32) {
		throw new Error("AUTH_CODE_ENCRYPTION_KEY must be 32 bytes (256 bits) when decoded from base64");
	}

	const expiryMs = ms(config.AUTH_CODE_EXPIRY);
	const now = Date.now();

	const payload: AuthCodePayload = {
		userInfo,
		tenantSlug,
		returnTo,
		issuedAt: now,
		expiresAt: now + expiryMs,
	};

	// Encrypt with AES-256-GCM
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, encryptionKey, iv, { authTagLength: TAG_LENGTH });

	const plaintext = JSON.stringify(payload);
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();

	// Sign the ciphertext with HMAC-SHA256
	const hmac = createHmac("sha256", config.AUTH_CODE_SIGNING_KEY);
	hmac.update(iv);
	hmac.update(encrypted);
	hmac.update(tag);
	const signature = hmac.digest("hex");

	const encryptedCode: EncryptedAuthCode = {
		iv: iv.toString("base64"),
		ciphertext: encrypted.toString("base64"),
		tag: tag.toString("base64"),
		sig: signature,
	};

	// Base64url encode the JSON
	const json = JSON.stringify(encryptedCode);
	return base64UrlEncode(json);
}

/**
 * Validate and decrypt an auth code.
 *
 * Verifies the HMAC signature, decrypts the payload, and checks expiry.
 *
 * @param code - Base64url encoded encrypted auth code
 * @returns The decrypted payload, or null if invalid/expired
 */
export function validateAuthCode(code: string): AuthCodePayload | null {
	const config = getConfig();

	if (!config.AUTH_CODE_ENCRYPTION_KEY || !config.AUTH_CODE_SIGNING_KEY) {
		log.error("Auth code validation failed: encryption/signing keys not configured");
		return null;
	}

	try {
		// Base64url decode
		const json = base64UrlDecode(code);
		const encryptedCode = JSON.parse(json) as EncryptedAuthCode;

		const iv = Buffer.from(encryptedCode.iv, "base64");
		const ciphertext = Buffer.from(encryptedCode.ciphertext, "base64");
		const tag = Buffer.from(encryptedCode.tag, "base64");

		// Verify signature first (before decryption)
		const hmac = createHmac("sha256", config.AUTH_CODE_SIGNING_KEY);
		hmac.update(iv);
		hmac.update(ciphertext);
		hmac.update(tag);
		const expectedSignature = hmac.digest("hex");

		if (!timingSafeEqual(Buffer.from(encryptedCode.sig, "hex"), Buffer.from(expectedSignature, "hex"))) {
			log.warn("Auth code validation failed: invalid signature");
			return null;
		}

		// Decrypt
		const encryptionKey = Buffer.from(config.AUTH_CODE_ENCRYPTION_KEY, "base64");
		const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv, { authTagLength: TAG_LENGTH });
		decipher.setAuthTag(tag);

		const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		const payload = JSON.parse(decrypted.toString("utf8")) as AuthCodePayload;

		// Check expiry
		if (Date.now() > payload.expiresAt) {
			log.debug("Auth code validation failed: expired");
			return null;
		}

		return payload;
	} catch (error) {
		log.warn(error, "Auth code validation failed");
		return null;
	}
}

/**
 * Base64url encode a string.
 */
function base64UrlEncode(str: string): string {
	return Buffer.from(str, "utf8").toString("base64url");
}

/**
 * Base64url decode a string.
 */
function base64UrlDecode(str: string): string {
	return Buffer.from(str, "base64url").toString("utf8");
}

/**
 * Generate a random encryption key suitable for AUTH_CODE_ENCRYPTION_KEY.
 * Returns a base64 encoded 32-byte key.
 *
 * @returns Base64 encoded 32-byte key
 */
export function generateEncryptionKey(): string {
	return randomBytes(32).toString("base64");
}

/**
 * Generate a random signing key suitable for AUTH_CODE_SIGNING_KEY.
 * Returns a base64 encoded 32-byte key.
 *
 * @returns Base64 encoded 32-byte key
 */
export function generateSigningKey(): string {
	return randomBytes(32).toString("base64");
}

/**
 * Generate an auth code for pending email selection.
 * This is used when the OAuth provider returns multiple verified emails
 * and the user needs to select which one to use.
 *
 * @param emails - List of verified emails to choose from
 * @param authJson - The raw OAuth response data
 * @param providerName - The OAuth provider name (e.g., "github", "google")
 * @param tenantSlug - The tenant this auth code is for
 * @param returnTo - The URL to redirect to after auth completes
 * @returns Base64url encoded encrypted auth code
 */
export function generatePendingEmailAuthCode(
	emails: Array<string>,
	authJson: Record<string, unknown>,
	providerName: string,
	tenantSlug: string,
	returnTo: string,
): string {
	const config = getConfig();

	if (!config.AUTH_CODE_ENCRYPTION_KEY) {
		throw new Error("AUTH_CODE_ENCRYPTION_KEY is not configured");
	}
	if (!config.AUTH_CODE_SIGNING_KEY) {
		throw new Error("AUTH_CODE_SIGNING_KEY is not configured");
	}

	const encryptionKey = Buffer.from(config.AUTH_CODE_ENCRYPTION_KEY, "base64");
	if (encryptionKey.length !== 32) {
		throw new Error("AUTH_CODE_ENCRYPTION_KEY must be 32 bytes (256 bits) when decoded from base64");
	}

	// Use longer expiry for email selection (5 minutes)
	const expiryMs = ms("5m");
	const now = Date.now();

	// Use placeholder userInfo - will be replaced when email is selected
	const payload: AuthCodePayload = {
		userInfo: {
			email: "",
			name: "",
			provider: `jolli_${providerName}`,
			subject: "",
		},
		tenantSlug,
		returnTo,
		issuedAt: now,
		expiresAt: now + expiryMs,
		pendingEmailSelection: {
			emails,
			authJson,
			providerName,
		},
	};

	// Encrypt with AES-256-GCM
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, encryptionKey, iv, { authTagLength: TAG_LENGTH });

	const plaintext = JSON.stringify(payload);
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();

	// Sign the ciphertext with HMAC-SHA256
	const hmac = createHmac("sha256", config.AUTH_CODE_SIGNING_KEY);
	hmac.update(iv);
	hmac.update(encrypted);
	hmac.update(tag);
	const signature = hmac.digest("hex");

	const encryptedCode: EncryptedAuthCode = {
		iv: iv.toString("base64"),
		ciphertext: encrypted.toString("base64"),
		tag: tag.toString("base64"),
		sig: signature,
	};

	// Base64url encode the JSON
	const json = JSON.stringify(encryptedCode);
	return base64UrlEncode(json);
}
