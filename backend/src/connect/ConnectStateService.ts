import { getConfig } from "../config/Config";
import { getLog } from "../util/Logger";
import type { ConnectStatePayload } from "./ConnectProvider";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const log = getLog(import.meta);

/**
 * Code payload structure for completing a connect flow.
 * Contains provider-specific data plus common fields.
 */
export interface ConnectCodePayload<T = unknown> {
	/** The provider name */
	provider: string;
	/** The tenant slug */
	tenantSlug: string;
	/** The org slug (optional) */
	orgSlug?: string;
	/** Provider-specific data */
	data: T;
	/** Timestamp when the code was issued (ms since epoch) */
	issuedAt: number;
	/** Timestamp when the code expires (ms since epoch) */
	expiresAt: number;
}

/**
 * Encrypted code structure (before base64url encoding).
 */
interface EncryptedPayload {
	/** Base64 encoded IV */
	iv: string;
	/** Base64 encoded ciphertext */
	ciphertext: string;
	/** Base64 encoded GCM auth tag */
	tag: string;
	/** Hex encoded HMAC signature */
	sig: string;
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits

/** Default expiry for state (5 minutes) */
const STATE_EXPIRY_MS = 5 * 60 * 1000;

/** Default expiry for code (5 minutes) */
const CODE_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Get encryption/signing keys for a provider.
 * Looks up {PROVIDER_UPPER}_CONNECT_ENCRYPTION_KEY and _SIGNING_KEY from config.
 *
 * @param provider - The provider name (e.g., "github")
 * @returns The encryption key buffer and signing key string, or null if not configured
 */
export function getProviderKeys(provider: string): { encryptionKey: Buffer; signingKey: string } | null {
	const config = getConfig();
	const providerUpper = provider.toUpperCase();

	// Dynamic key lookup based on provider name
	const encryptionKeyName = `${providerUpper}_CONNECT_ENCRYPTION_KEY` as keyof typeof config;
	const signingKeyName = `${providerUpper}_CONNECT_SIGNING_KEY` as keyof typeof config;

	const encryptionKeyBase64 = config[encryptionKeyName] as string | undefined;
	const signingKey = config[signingKeyName] as string | undefined;

	if (!encryptionKeyBase64 || !signingKey) {
		log.debug({ provider, encryptionKeyName, signingKeyName }, "Connect keys not configured for provider");
		return null;
	}

	const encryptionKey = Buffer.from(encryptionKeyBase64, "base64");
	if (encryptionKey.length !== 32) {
		log.error({ provider }, "Connect encryption key must be 32 bytes when decoded from base64");
		return null;
	}

	return { encryptionKey, signingKey };
}

/**
 * Encrypt a payload with AES-256-GCM and sign with HMAC-SHA256.
 */
function encryptAndSign(payload: unknown, encryptionKey: Buffer, signingKey: string): string {
	// Encrypt with AES-256-GCM
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, encryptionKey, iv, { authTagLength: TAG_LENGTH });

	const plaintext = JSON.stringify(payload);
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();

	// Sign the ciphertext with HMAC-SHA256
	const hmac = createHmac("sha256", signingKey);
	hmac.update(iv);
	hmac.update(encrypted);
	hmac.update(tag);
	const signature = hmac.digest("hex");

	const encryptedPayload: EncryptedPayload = {
		iv: iv.toString("base64"),
		ciphertext: encrypted.toString("base64"),
		tag: tag.toString("base64"),
		sig: signature,
	};

	// Base64url encode the JSON
	return Buffer.from(JSON.stringify(encryptedPayload), "utf8").toString("base64url");
}

/**
 * Verify signature and decrypt a payload.
 * Returns null if invalid, expired, or tampered.
 */
function verifyAndDecrypt<T>(encoded: string, encryptionKey: Buffer, signingKey: string): T | null {
	try {
		// Base64url decode
		const json = Buffer.from(encoded, "base64url").toString("utf8");
		const encryptedPayload = JSON.parse(json) as EncryptedPayload;

		const iv = Buffer.from(encryptedPayload.iv, "base64");
		const ciphertext = Buffer.from(encryptedPayload.ciphertext, "base64");
		const tag = Buffer.from(encryptedPayload.tag, "base64");

		// Verify signature first (before decryption)
		const hmac = createHmac("sha256", signingKey);
		hmac.update(iv);
		hmac.update(ciphertext);
		hmac.update(tag);
		const expectedSignature = hmac.digest("hex");

		if (!timingSafeEqual(Buffer.from(encryptedPayload.sig, "hex"), Buffer.from(expectedSignature, "hex"))) {
			log.warn("Connect payload validation failed: invalid signature");
			return null;
		}

		// Decrypt
		const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv, { authTagLength: TAG_LENGTH });
		decipher.setAuthTag(tag);

		const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		return JSON.parse(decrypted.toString("utf8")) as T;
	} catch (error) {
		log.warn(error, "Connect payload validation failed");
		return null;
	}
}

/**
 * Generate an encrypted state for starting a connect flow.
 * Uses provider-specific encryption keys.
 *
 * @param provider - The provider name (e.g., "github")
 * @param tenantSlug - The tenant's slug
 * @param orgSlug - The org's slug within the tenant (optional)
 * @param returnTo - The URL to redirect back to after completion
 * @returns Base64url encoded encrypted state
 * @throws Error if provider keys are not configured
 */
export function generateConnectState(
	provider: string,
	tenantSlug: string,
	orgSlug: string | undefined,
	returnTo: string,
): string {
	const keys = getProviderKeys(provider);
	if (!keys) {
		throw new Error(`Connect keys not configured for provider: ${provider}`);
	}

	const now = Date.now();
	const payload: ConnectStatePayload = {
		provider,
		tenantSlug,
		...(orgSlug !== undefined && { orgSlug }),
		returnTo,
		issuedAt: now,
		expiresAt: now + STATE_EXPIRY_MS,
	};

	return encryptAndSign(payload, keys.encryptionKey, keys.signingKey);
}

/**
 * Validate and decrypt a connect state.
 * Automatically detects the provider from the payload.
 *
 * @param state - Base64url encoded encrypted state
 * @returns The decrypted state payload, or null if invalid/expired
 */
export function validateConnectState(state: string): ConnectStatePayload | null {
	// First, try to decode just enough to get the provider name
	// We need to try all configured providers since we don't know which one this is for
	const config = getConfig();

	// Build list of potentially configured providers
	const potentialProviders: Array<string> = [];

	// Check for known provider keys in config
	for (const key of Object.keys(config)) {
		const match = key.match(/^([A-Z]+)_CONNECT_ENCRYPTION_KEY$/);
		if (match) {
			potentialProviders.push(match[1].toLowerCase());
		}
	}

	// Try each provider until one works
	for (const provider of potentialProviders) {
		const keys = getProviderKeys(provider);
		if (!keys) {
			continue;
		}

		const payload = verifyAndDecrypt<ConnectStatePayload>(state, keys.encryptionKey, keys.signingKey);
		if (payload && payload.provider === provider) {
			// Check expiry
			if (Date.now() > payload.expiresAt) {
				log.debug({ provider }, "Connect state expired");
				return null;
			}
			return payload;
		}
	}

	log.debug("Connect state validation failed: no matching provider");
	return null;
}

/**
 * Generate an encrypted code for completing setup.
 * The code contains provider-specific data plus common fields.
 *
 * @param provider - The provider name
 * @param tenantSlug - The tenant's slug
 * @param orgSlug - The org's slug within the tenant (optional)
 * @param providerData - Provider-specific data to include
 * @returns Base64url encoded encrypted code
 * @throws Error if provider keys are not configured
 */
export function generateConnectCode<T extends object>(
	provider: string,
	tenantSlug: string,
	orgSlug: string | undefined,
	providerData: T,
): string {
	const keys = getProviderKeys(provider);
	if (!keys) {
		throw new Error(`Connect keys not configured for provider: ${provider}`);
	}

	const now = Date.now();
	const payload: ConnectCodePayload<T> = {
		provider,
		tenantSlug,
		...(orgSlug !== undefined && { orgSlug }),
		data: providerData,
		issuedAt: now,
		expiresAt: now + CODE_EXPIRY_MS,
	};

	return encryptAndSign(payload, keys.encryptionKey, keys.signingKey);
}

/**
 * Validate and decrypt a connect code.
 *
 * @param provider - The expected provider name
 * @param code - Base64url encoded encrypted code
 * @returns The decoded payload, or null if invalid/expired/wrong provider
 */
export function validateConnectCode<T>(
	provider: string,
	code: string,
): { tenantSlug: string; orgSlug?: string; data: T } | null {
	const keys = getProviderKeys(provider);
	if (!keys) {
		log.debug({ provider }, "Connect keys not configured for provider");
		return null;
	}

	const payload = verifyAndDecrypt<ConnectCodePayload<T>>(code, keys.encryptionKey, keys.signingKey);
	if (!payload) {
		return null;
	}

	// Verify provider matches
	if (payload.provider !== provider) {
		log.warn({ expected: provider, actual: payload.provider }, "Connect code provider mismatch");
		return null;
	}

	// Check expiry
	if (Date.now() > payload.expiresAt) {
		log.debug({ provider }, "Connect code expired");
		return null;
	}

	return {
		tenantSlug: payload.tenantSlug,
		...(payload.orgSlug !== undefined && { orgSlug: payload.orgSlug }),
		data: payload.data,
	};
}

/**
 * Check if a state string is encrypted (vs plain URL for backward compatibility).
 * Encrypted states are base64url encoded JSON with specific structure.
 *
 * @param state - The state string to check
 * @returns true if the state appears to be encrypted, false if it's a plain URL
 */
export function isEncryptedState(state: string): boolean {
	if (!state) {
		return false;
	}

	// Plain URLs start with http:// or https:// or are URL-encoded versions
	// After decodeURIComponent, they would start with http
	try {
		const decoded = decodeURIComponent(state);
		if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
			return false;
		}
	} catch {
		// decodeURIComponent failed, might be base64url
	}

	// Try to decode as base64url and check if it's valid JSON with expected structure
	try {
		const json = Buffer.from(state, "base64url").toString("utf8");
		const parsed = JSON.parse(json);
		// Check for encrypted payload structure
		return (
			typeof parsed === "object" && "iv" in parsed && "ciphertext" in parsed && "tag" in parsed && "sig" in parsed
		);
	} catch {
		return false;
	}
}

/**
 * Generate a new encryption key suitable for connect state/code encryption.
 * Returns a base64 encoded 32-byte key.
 *
 * @returns Base64 encoded 32-byte key
 */
export function generateEncryptionKey(): string {
	return randomBytes(32).toString("base64");
}

/**
 * Generate a new signing key suitable for connect state/code signing.
 * Returns a base64 encoded 32-byte key.
 *
 * @returns Base64 encoded 32-byte key
 */
export function generateSigningKey(): string {
	return randomBytes(32).toString("base64");
}
