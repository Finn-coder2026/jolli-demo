import type { AuditResourceType } from "../model/AuditEvent";

/**
 * Options for the @PIIField decorator
 */
export interface PIIFieldOptions {
	/** Optional description of why this field is PII */
	readonly description?: string;
}

/**
 * Registry that stores PII field metadata collected from decorators.
 * Key: resource type (e.g., "user", "session")
 * Value: Map of field name to PIIFieldOptions
 */
const piiFieldRegistry = new Map<AuditResourceType, Map<string, PIIFieldOptions>>();

/**
 * Property decorator to mark a field as containing PII.
 * When applied to a property in a PII schema class, the field will be
 * encrypted in audit logs.
 *
 * @example
 * ```typescript
 * @PIISchema("user")
 * class UserPII {
 *   @PIIField({ description: "User email address" })
 *   email!: string;
 *
 *   @PIIField({ description: "User display name" })
 *   name!: string;
 * }
 * ```
 */
export function PIIField(options: PIIFieldOptions = {}): PropertyDecorator {
	return (target: object, propertyKey: string | symbol): void => {
		const fieldName = String(propertyKey);
		// Store temporarily on the prototype - will be collected by @PIISchema
		const proto = target as PIISchemaPrototype;
		if (!proto.__piiFields) {
			proto.__piiFields = new Map();
		}
		proto.__piiFields.set(fieldName, options);
	};
}

/**
 * Internal interface for PII schema prototype with temporary field storage
 */
interface PIISchemaPrototype {
	__piiFields?: Map<string, PIIFieldOptions>;
}

/**
 * Class decorator to register a class as a PII schema for a resource type.
 * Must be applied to a class that has @PIIField decorated properties.
 *
 * @param resourceType The audit resource type this schema applies to
 *
 * @example
 * ```typescript
 * @PIISchema("user")
 * class UserPII {
 *   @PIIField({ description: "User email address" })
 *   email!: string;
 * }
 * ```
 */
export function PIISchema(resourceType: AuditResourceType): ClassDecorator {
	// biome-ignore lint/complexity/noBannedTypes: ClassDecorator requires Function type
	return <TFunction extends Function>(target: TFunction): TFunction => {
		// Collect PII fields from prototype
		const proto = target.prototype as PIISchemaPrototype;
		const fields = proto.__piiFields;

		if (fields && fields.size > 0) {
			// Merge with existing fields for this resource type (if any)
			const existing = piiFieldRegistry.get(resourceType);
			if (existing) {
				for (const [fieldName, options] of fields) {
					existing.set(fieldName, options);
				}
			} else {
				piiFieldRegistry.set(resourceType, new Map(fields));
			}
		}

		// Clean up temporary storage
		delete proto.__piiFields;

		return target;
	};
}

/**
 * Get all registered PII fields for a resource type.
 * Returns a Map of field names to their options.
 */
export function getRegisteredPiiFields(resourceType: AuditResourceType): Map<string, PIIFieldOptions> {
	return piiFieldRegistry.get(resourceType) ?? new Map();
}

/**
 * Check if a field is registered as PII for a resource type.
 */
export function isRegisteredPiiField(resourceType: AuditResourceType, fieldName: string): boolean {
	const fields = piiFieldRegistry.get(resourceType);
	if (!fields) {
		return false;
	}
	// Case-insensitive check
	const lowerFieldName = fieldName.toLowerCase();
	for (const registeredField of fields.keys()) {
		if (registeredField.toLowerCase() === lowerFieldName) {
			return true;
		}
	}
	return false;
}

/**
 * Get all resource types that have registered PII fields.
 */
export function getRegisteredResourceTypes(): Array<AuditResourceType> {
	return Array.from(piiFieldRegistry.keys());
}

/**
 * Clear all registered PII fields (useful for testing).
 */
export function clearPiiRegistry(): void {
	piiFieldRegistry.clear();
}

/**
 * Register PII fields programmatically (for cases where decorators can't be used).
 * This is useful for resources that don't have a corresponding model class.
 */
export function registerPiiFields(resourceType: AuditResourceType, fields: Record<string, PIIFieldOptions>): void {
	const existing = piiFieldRegistry.get(resourceType) ?? new Map<string, PIIFieldOptions>();
	for (const [fieldName, options] of Object.entries(fields)) {
		existing.set(fieldName, options);
	}
	piiFieldRegistry.set(resourceType, existing);
}
