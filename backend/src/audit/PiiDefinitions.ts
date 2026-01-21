import type { AuditResourceType } from "../model/AuditEvent";
import { getRegisteredPiiFields, isRegisteredPiiField, registerPiiFields } from "./PiiDecorators";

// Import models to trigger decorator registration
import "../model/User";
import "../model/Auth";
import "../model/Doc";
import "../model/Site";
import "../model/Integration";

/**
 * Register PII fields for resource types that don't have dedicated model files.
 * These are registered programmatically since there's no class to decorate.
 */
function registerAdditionalPiiFields(): void {
	// Space resource type
	registerPiiFields("space", {
		ownerEmail: { description: "Space owner email" },
		memberEmails: { description: "Space member emails" },
	});

	// Folder resource type - typically no PII fields
	registerPiiFields("folder", {});

	// Settings resource type
	registerPiiFields("settings", {
		email: { description: "Email settings" },
		notificationEmail: { description: "Notification email" },
		contactEmail: { description: "Contact email" },
	});

	// Tenant resource type
	registerPiiFields("tenant", {
		adminEmail: { description: "Tenant admin email" },
		contactEmail: { description: "Tenant contact email" },
		billingEmail: { description: "Billing email" },
	});

	// Org resource type
	registerPiiFields("org", {
		adminEmail: { description: "Org admin email" },
		ownerEmail: { description: "Org owner email" },
		memberEmails: { description: "Org member emails" },
	});
}

// Register additional PII fields on module load
registerAdditionalPiiFields();

/**
 * Actor-level PII fields that are always encrypted regardless of resource type.
 * These are the fields in the audit event itself, not in the changes.
 */
export const ACTOR_PII_FIELDS = new Set(["actorEmail", "actorIp", "actorDevice"]);

/**
 * Global PII fields that should be encrypted for any resource type.
 * These are common field names that typically contain PII.
 */
export const GLOBAL_PII_FIELDS = new Set([
	// Email-related
	"email",
	"emailAddress",
	"userEmail",
	"ownerEmail",
	"authorEmail",
	"memberEmail",
	"contactEmail",
	"notificationEmail",
	"billingEmail",
	"adminEmail",
	// Name-related
	"name",
	"fullName",
	"firstName",
	"lastName",
	"displayName",
	"userName",
	"authorName",
	"ownerName",
	// Contact info
	"phone",
	"phoneNumber",
	"mobile",
	"address",
	"streetAddress",
	"city",
	"zipCode",
	"postalCode",
	// Network identifiers
	"ip",
	"ipAddress",
	"clientIp",
	"remoteAddress",
	// Device info
	"userAgent",
	"device",
	"deviceId",
	// Profile
	"picture",
	"avatar",
	"profileUrl",
	"profilePicture",
]);

/**
 * Check if a field is a PII field for a given resource type.
 * Checks decorator-registered fields, then global PII fields.
 */
export function isPiiField(resourceType: AuditResourceType, fieldName: string): boolean {
	// Check decorator-registered PII fields first
	if (isRegisteredPiiField(resourceType, fieldName)) {
		return true;
	}

	// Check global PII fields (case-insensitive)
	const lowerFieldName = fieldName.toLowerCase();
	for (const globalField of GLOBAL_PII_FIELDS) {
		if (globalField.toLowerCase() === lowerFieldName) {
			return true;
		}
	}

	return false;
}

/**
 * Get all PII field names for a resource type (including global fields).
 */
export function getPiiFieldsForResource(resourceType: AuditResourceType): Set<string> {
	const fields = new Set<string>(GLOBAL_PII_FIELDS);

	// Add decorator-registered fields
	const registeredFields = getRegisteredPiiFields(resourceType);
	for (const fieldName of registeredFields.keys()) {
		fields.add(fieldName);
	}

	return fields;
}

/**
 * Check if a field is an actor-level PII field.
 */
export function isActorPiiField(fieldName: string): boolean {
	return ACTOR_PII_FIELDS.has(fieldName);
}
