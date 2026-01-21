import { getConfig } from "../config/Config";
import type { AuditEventDao } from "../dao/AuditEventDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type {
	AuditAction,
	AuditActorType,
	AuditFieldChange,
	AuditMetadata,
	AuditResourceType,
	NewAuditEvent,
} from "../model/AuditEvent";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import { getAuditContext } from "./AuditContext";
import { isPiiField } from "./PiiDefinitions";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const log = getLog(import.meta);

/**
 * Fields that should never be logged in audit trails for security (completely redacted)
 */
const SENSITIVE_FIELDS = new Set([
	"password",
	"secret",
	"token",
	"apikey",
	"privatekey",
	"accesstoken",
	"refreshtoken",
	"clientsecret",
	"encryptionkey",
	"signingkey",
	"webhooksecret",
]);

/**
 * Maximum length for string values in audit logs
 */
const MAX_STRING_LENGTH = 1000;

/**
 * Encryption algorithm for PII
 */
const PII_ENCRYPTION_ALGORITHM = "aes-256-gcm";
const PII_IV_LENGTH = 12; // 96 bits for GCM
const PII_TAG_LENGTH = 16; // 128 bits

/**
 * Prefix to identify encrypted PII values
 */
const ENCRYPTED_PII_PREFIX = "enc:";

/**
 * Parameters for logging an audit event
 */
export interface AuditLogParams {
	/** The action that was performed */
	readonly action: AuditAction;
	/** Type of resource being acted upon */
	readonly resourceType: AuditResourceType;
	/** ID of the resource (will be converted to string) */
	readonly resourceId: string | number;
	/** Human-readable name of the resource */
	readonly resourceName?: string;
	/** Array of field changes (for update actions) */
	readonly changes?: Array<AuditFieldChange>;
	/** Additional metadata about the event */
	readonly metadata?: Record<string, unknown>;
	/** Override the actor type (defaults to context or 'user') */
	readonly actorType?: AuditActorType;
	/** Override the actor ID */
	readonly actorId?: number | null;
	/** Override the actor email */
	readonly actorEmail?: string | null;
}

/**
 * Service for logging audit events
 */
export interface AuditService {
	/**
	 * Log an audit event asynchronously (fire-and-forget)
	 * Use this for non-critical audit logs where you don't want to block the response
	 */
	log(params: AuditLogParams): void;

	/**
	 * Log an audit event synchronously (waits for DB write)
	 */
	logSync(params: AuditLogParams): Promise<void>;

	/**
	 * Compute the changes between two objects
	 * @param oldValue The original object
	 * @param newValue The new object
	 * @param resourceType The resource type (used to identify PII fields)
	 * @param trackedFields Optional list of fields to track (defaults to all fields in newValue)
	 * @returns Array of field changes with PII fields encrypted
	 */
	computeChanges<T extends Record<string, unknown>>(
		oldValue: T | null | undefined,
		newValue: T | null | undefined,
		resourceType: AuditResourceType,
		trackedFields?: Array<string>,
	): Array<AuditFieldChange>;

	/**
	 * Decrypt a PII value that was encrypted during audit logging
	 * @param encryptedValue The encrypted value (with enc: prefix)
	 * @returns The decrypted value, or the original if not encrypted or decryption fails
	 */
	decryptPii(encryptedValue: string): string;

	/**
	 * Decrypt all PII fields in an audit event's changes array
	 * @param changes The changes array from an audit event
	 * @param resourceType The resource type (used to identify PII fields)
	 * @returns A new changes array with PII values decrypted
	 */
	decryptChanges(
		changes: Array<AuditFieldChange> | null,
		resourceType: AuditResourceType,
	): Array<AuditFieldChange> | null;
}

/**
 * Encrypt a PII value using AES-256-GCM
 * Returns the encrypted value with enc: prefix, or original if encryption is not configured
 */
function encryptPii(value: string, encryptionKey: Buffer | null): string {
	if (!encryptionKey || !value) {
		return value;
	}

	try {
		const iv = randomBytes(PII_IV_LENGTH);
		const cipher = createCipheriv(PII_ENCRYPTION_ALGORITHM, encryptionKey, iv, { authTagLength: PII_TAG_LENGTH });

		const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
		const tag = cipher.getAuthTag();

		// Format: enc:base64(iv):base64(tag):base64(ciphertext)
		return `${ENCRYPTED_PII_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
	} /* v8 ignore next 3 */ catch (error) {
		log.warn(error, "Failed to encrypt PII value, storing as-is");
		return value;
	}
}

/**
 * Decrypt a PII value that was encrypted with encryptPii
 */
function decryptPiiValue(encryptedValue: string, encryptionKey: Buffer | null): string {
	if (!encryptionKey || !encryptedValue.startsWith(ENCRYPTED_PII_PREFIX)) {
		return encryptedValue;
	}

	try {
		const parts = encryptedValue.slice(ENCRYPTED_PII_PREFIX.length).split(":");
		if (parts.length !== 3) {
			return encryptedValue;
		}

		const [ivBase64, tagBase64, ciphertextBase64] = parts;
		const iv = Buffer.from(ivBase64, "base64");
		const tag = Buffer.from(tagBase64, "base64");
		const ciphertext = Buffer.from(ciphertextBase64, "base64");

		const decipher = createDecipheriv(PII_ENCRYPTION_ALGORITHM, encryptionKey, iv, {
			authTagLength: PII_TAG_LENGTH,
		});
		decipher.setAuthTag(tag);

		const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		return decrypted.toString("utf8");
	} catch (error) {
		log.warn(error, "Failed to decrypt PII value");
		return encryptedValue;
	}
}

/**
 * Get the PII encryption key from config, or null if not configured
 */
function getPiiEncryptionKey(): Buffer | null {
	const config = getConfig();
	const keyBase64 = config.AUDIT_PII_ENCRYPTION_KEY;

	if (!keyBase64) {
		return null;
	}

	try {
		const key = Buffer.from(keyBase64, "base64");
		if (key.length !== 32) {
			log.warn("AUDIT_PII_ENCRYPTION_KEY must be 32 bytes (256 bits), PII encryption disabled");
			return null;
		}
		return key;
	} catch {
		log.warn("Invalid AUDIT_PII_ENCRYPTION_KEY format, PII encryption disabled");
		return null;
	}
}

/**
 * Check if a field is a sensitive field that should be completely redacted
 */
function isSensitiveField(fieldName: string): boolean {
	return SENSITIVE_FIELDS.has(fieldName.toLowerCase());
}

/**
 * Encrypt a value if the field is a PII field
 */
function encryptIfPii(
	value: unknown,
	fieldName: string,
	resourceType: AuditResourceType,
	encryptionKey: Buffer | null,
): unknown {
	if (value === null || value === undefined) {
		return value;
	}

	// Check if this field is PII for this resource type
	if (isPiiField(resourceType, fieldName) && typeof value === "string" && encryptionKey) {
		return encryptPii(value, encryptionKey);
	}

	return value;
}

/**
 * Sanitize a value for audit logging
 * - Truncates long strings
 * - Removes sensitive data
 * - Handles null/undefined
 * - Encrypts PII fields
 */
function sanitizeValue(
	value: unknown,
	fieldName: string | undefined,
	resourceType: AuditResourceType,
	encryptionKey: Buffer | null,
): unknown {
	// Check if field is sensitive (completely redact)
	if (fieldName && isSensitiveField(fieldName)) {
		return "[REDACTED]";
	}

	if (value === null || value === undefined) {
		return value;
	}

	if (typeof value === "string") {
		// Truncate long strings first
		let processedValue = value;
		if (value.length > MAX_STRING_LENGTH) {
			processedValue = `[${value.length} characters]`;
		}

		// Encrypt if this is a PII field
		if (fieldName && isPiiField(resourceType, fieldName) && encryptionKey) {
			return encryptPii(processedValue, encryptionKey);
		}

		return processedValue;
	}

	if (Array.isArray(value)) {
		if (value.length > 100) {
			return `[Array of ${value.length} items]`;
		}
		// For arrays of PII values (like email lists), encrypt each item
		if (fieldName && isPiiField(resourceType, fieldName) && encryptionKey) {
			return value.map(item => (typeof item === "string" ? encryptPii(item, encryptionKey) : item));
		}
		return value.map(item => sanitizeValue(item, undefined, resourceType, encryptionKey));
	}

	if (typeof value === "object") {
		const sanitized: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(value)) {
			sanitized[key] = sanitizeValue(val, key, resourceType, encryptionKey);
		}
		return sanitized;
	}

	return value;
}

/**
 * Deep equality check for two values
 */
function deepEquals(a: unknown, b: unknown): boolean {
	if (a === b) {
		return true;
	}

	if (a === null || b === null || a === undefined || b === undefined) {
		return a === b;
	}

	if (typeof a !== typeof b) {
		return false;
	}

	if (typeof a !== "object") {
		return a === b;
	}

	if (Array.isArray(a) !== Array.isArray(b)) {
		return false;
	}

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) {
			return false;
		}
		return a.every((item, index) => deepEquals(item, b[index]));
	}

	// Handle Date objects
	if (a instanceof Date && b instanceof Date) {
		return a.getTime() === b.getTime();
	}

	const aObj = a as Record<string, unknown>;
	const bObj = b as Record<string, unknown>;
	const aKeys = Object.keys(aObj);
	const bKeys = Object.keys(bObj);

	if (aKeys.length !== bKeys.length) {
		return false;
	}

	return aKeys.every(key => deepEquals(aObj[key], bObj[key]));
}

/**
 * Create an AuditService instance
 */
export function createAuditService(auditEventDaoProvider: DaoProvider<AuditEventDao>): AuditService {
	return {
		log: logAsync,
		logSync: logAuditEvent,
		computeChanges,
		decryptPii: decryptPiiPublic,
		decryptChanges,
	};

	async function logAuditEvent(params: AuditLogParams): Promise<void> {
		const context = getAuditContext();
		const tenantContext = getTenantContext();
		const auditEventDao = auditEventDaoProvider.getDao(tenantContext);
		const encryptionKey = getPiiEncryptionKey();

		// Encrypt PII fields in actor info
		const actorEmail = params.actorEmail ?? context?.actorEmail ?? null;
		const actorIp = context?.actorIp ?? null;
		const actorDevice = context?.actorDevice ?? null;

		// Encrypt PII fields in changes if provided
		const encryptedChanges = params.changes
			? params.changes.map(change => ({
					field: change.field,
					old: encryptIfPii(change.old, change.field, params.resourceType, encryptionKey),
					new: encryptIfPii(change.new, change.field, params.resourceType, encryptionKey),
				}))
			: null;

		const event: NewAuditEvent = {
			timestamp: new Date(),
			actorId: params.actorId ?? context?.actorId ?? null,
			actorType: params.actorType ?? context?.actorType ?? "user",
			actorEmail: actorEmail ? encryptPii(actorEmail, encryptionKey) : null,
			actorIp: actorIp ? encryptPii(actorIp, encryptionKey) : null,
			actorDevice: actorDevice ? encryptPii(actorDevice, encryptionKey) : null,
			action: params.action,
			resourceType: params.resourceType,
			resourceId: String(params.resourceId),
			resourceName: params.resourceName ?? null,
			changes: encryptedChanges,
			metadata: buildMetadata(context, params.metadata),
		};

		try {
			await auditEventDao.create(event);
		} catch (error) {
			// Log the error but don't fail the request
			log.error(
				error,
				"Failed to create audit event for %s %s:%s",
				params.action,
				params.resourceType,
				params.resourceId,
			);
		}
	}

	function logAsync(params: AuditLogParams): void {
		// Fire and forget - errors are logged but not propagated
		/* v8 ignore next 8 */
		logAuditEvent(params).catch(error => {
			log.error(
				error,
				"Async audit log failed for %s %s:%s",
				params.action,
				params.resourceType,
				params.resourceId,
			);
		});
	}

	function computeChanges<T extends Record<string, unknown>>(
		oldValue: T | null | undefined,
		newValue: T | null | undefined,
		resourceType: AuditResourceType,
		trackedFields?: Array<string>,
	): Array<AuditFieldChange> {
		const encryptionKey = getPiiEncryptionKey();

		if (!oldValue && !newValue) {
			return [];
		}

		// For create operations (no old value), return all fields as changes
		if (!oldValue && newValue) {
			const fields = trackedFields ?? Object.keys(newValue);
			return fields
				.map(field => processFieldForCreate(field, newValue[field], resourceType, encryptionKey))
				.filter((change): change is AuditFieldChange => change !== null);
		}

		// For delete operations (no new value), return all old fields
		if (oldValue && !newValue) {
			const fields = trackedFields ?? Object.keys(oldValue);
			return fields
				.map(field => processFieldForDelete(field, oldValue[field], resourceType, encryptionKey))
				.filter((change): change is AuditFieldChange => change !== null);
		}

		// For update operations, compare fields
		// Note: oldValue and newValue are guaranteed to be truthy here due to checks above
		// The ?? {} fallbacks are for TypeScript's type system only
		/* v8 ignore next */
		const fields = trackedFields ?? [...new Set([...Object.keys(oldValue ?? {}), ...Object.keys(newValue ?? {})])];
		return fields
			.map(field =>
				processFieldForUpdate(field, oldValue?.[field], newValue?.[field], resourceType, encryptionKey),
			)
			.filter((change): change is AuditFieldChange => change !== null);
	}

	function processFieldForCreate(
		field: string,
		value: unknown,
		resourceType: AuditResourceType,
		encryptionKey: Buffer | null,
	): AuditFieldChange | null {
		if (isSensitiveField(field) || value === undefined || typeof value === "function") {
			return null;
		}
		return {
			field,
			old: null,
			new: sanitizeValue(value, field, resourceType, encryptionKey),
		};
	}

	function processFieldForDelete(
		field: string,
		value: unknown,
		resourceType: AuditResourceType,
		encryptionKey: Buffer | null,
	): AuditFieldChange | null {
		if (isSensitiveField(field) || value === undefined || typeof value === "function") {
			return null;
		}
		return {
			field,
			old: sanitizeValue(value, field, resourceType, encryptionKey),
			new: null,
		};
	}

	function processFieldForUpdate(
		field: string,
		oldVal: unknown,
		newVal: unknown,
		resourceType: AuditResourceType,
		encryptionKey: Buffer | null,
	): AuditFieldChange | null {
		if (isSensitiveField(field)) {
			return null;
		}
		if (typeof oldVal === "function" || typeof newVal === "function") {
			return null;
		}
		if (deepEquals(oldVal, newVal)) {
			return null;
		}
		return {
			field,
			old: sanitizeValue(oldVal, field, resourceType, encryptionKey),
			new: sanitizeValue(newVal, field, resourceType, encryptionKey),
		};
	}

	function decryptPiiPublic(encryptedValue: string): string {
		const encryptionKey = getPiiEncryptionKey();
		return decryptPiiValue(encryptedValue, encryptionKey);
	}

	function decryptChanges(
		changes: Array<AuditFieldChange> | null,
		resourceType: AuditResourceType,
	): Array<AuditFieldChange> | null {
		if (!changes) {
			return null;
		}

		const encryptionKey = getPiiEncryptionKey();
		if (!encryptionKey) {
			return changes;
		}

		return changes.map(change => {
			// Only decrypt if the field is a PII field
			if (!isPiiField(resourceType, change.field)) {
				return change;
			}

			return {
				field: change.field,
				old: decryptChangeValue(change.old, encryptionKey),
				new: decryptChangeValue(change.new, encryptionKey),
			};
		});
	}

	function decryptChangeValue(value: unknown, encryptionKey: Buffer): unknown {
		if (typeof value === "string" && value.startsWith(ENCRYPTED_PII_PREFIX)) {
			return decryptPiiValue(value, encryptionKey);
		}
		if (Array.isArray(value)) {
			return value.map(item =>
				typeof item === "string" && item.startsWith(ENCRYPTED_PII_PREFIX)
					? decryptPiiValue(item, encryptionKey)
					: item,
			);
		}
		return value;
	}

	function buildMetadata(
		context: ReturnType<typeof getAuditContext>,
		additionalMetadata?: Record<string, unknown>,
	): AuditMetadata | null {
		if (!context && !additionalMetadata) {
			return null;
		}

		const metadata: Record<string, unknown> = {};

		if (context) {
			if (context.httpMethod) {
				metadata.httpMethod = context.httpMethod;
			}
			if (context.endpoint) {
				metadata.endpoint = context.endpoint;
			}
			if (context.requestId) {
				metadata.requestId = context.requestId;
			}
		}

		if (additionalMetadata) {
			for (const [key, value] of Object.entries(additionalMetadata)) {
				// Don't encrypt metadata fields - they shouldn't contain PII
				// If they do, the caller should encrypt them before passing
				if (isSensitiveField(key)) {
					metadata[key] = "[REDACTED]";
				} else {
					metadata[key] = value;
				}
			}
		}

		return Object.keys(metadata).length > 0 ? (metadata as AuditMetadata) : null;
	}
}

/**
 * Global audit service instance (lazy initialized)
 */
let globalAuditService: AuditService | null = null;

/**
 * Set the global audit service instance.
 * This should be called during app initialization.
 */
export function setGlobalAuditService(service: AuditService): void {
	globalAuditService = service;
}

/**
 * Get the global audit service instance.
 * Throws if not initialized.
 */
export function getAuditService(): AuditService {
	if (!globalAuditService) {
		throw new Error("Audit service not initialized. Call setGlobalAuditService() during app startup.");
	}
	return globalAuditService;
}

/**
 * Get the global audit service instance, or null if not initialized.
 * Use this when audit logging is optional.
 */
export function getAuditServiceOrNull(): AuditService | null {
	return globalAuditService;
}

/**
 * Convenience function to log an audit event asynchronously (fire-and-forget) using the global service.
 * Use this in routers and other places where you don't want to block the response.
 * Silently returns if audit service is not initialized.
 */
export function auditLog(params: AuditLogParams): void {
	const service = getAuditServiceOrNull();
	if (!service) {
		return;
	}
	service.log(params);
}

/**
 * Convenience function to log an audit event synchronously using the global service.
 * Returns immediately if audit service is not initialized.
 */
export function auditLogSync(params: AuditLogParams): Promise<void> {
	const service = getAuditServiceOrNull();
	if (!service) {
		return Promise.resolve();
	}
	return service.logSync(params);
}

/**
 * Convenience function to compute changes using the global service.
 * Returns an empty array if audit service is not initialized.
 */
export function computeAuditChanges<T extends Record<string, unknown>>(
	oldValue: T | null | undefined,
	newValue: T | null | undefined,
	resourceType: AuditResourceType,
	trackedFields?: Array<string>,
): Array<AuditFieldChange> {
	const service = getAuditServiceOrNull();
	if (!service) {
		return [];
	}
	return service.computeChanges(oldValue, newValue, resourceType, trackedFields);
}

/**
 * Generate a random encryption key suitable for AUDIT_PII_ENCRYPTION_KEY.
 * Returns a base64 encoded 32-byte key.
 */
export function generateAuditPiiEncryptionKey(): string {
	return randomBytes(32).toString("base64");
}
