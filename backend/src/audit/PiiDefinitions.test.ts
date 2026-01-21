import type { AuditResourceType } from "../model/AuditEvent";
import { getRegisteredPiiFields } from "./PiiDecorators";
import {
	ACTOR_PII_FIELDS,
	GLOBAL_PII_FIELDS,
	getPiiFieldsForResource,
	isActorPiiField,
	isPiiField,
} from "./PiiDefinitions";
import { describe, expect, it } from "vitest";

describe("PiiDefinitions", () => {
	describe("Decorator-registered PII fields", () => {
		it("should have registered fields for user resource type from User model", () => {
			const userFields = getRegisteredPiiFields("user");
			expect(userFields.has("email")).toBe(true);
			expect(userFields.has("name")).toBe(true);
			expect(userFields.has("picture")).toBe(true);
		});

		it("should have registered fields for session resource type from Auth model", () => {
			const sessionFields = getRegisteredPiiFields("session");
			expect(sessionFields.has("email")).toBe(true);
			expect(sessionFields.has("ip")).toBe(true);
			expect(sessionFields.has("device")).toBe(true);
		});

		it("should have registered fields for doc resource type from Doc model", () => {
			const docFields = getRegisteredPiiFields("doc");
			expect(docFields.has("authorEmail")).toBe(true);
			expect(docFields.has("authorName")).toBe(true);
		});

		it("should have registered fields for site resource type from Site model", () => {
			const siteFields = getRegisteredPiiFields("site");
			expect(siteFields.has("ownerEmail")).toBe(true);
			expect(siteFields.has("contactEmail")).toBe(true);
		});

		it("should have registered fields for integration resource type from Integration model", () => {
			const integrationFields = getRegisteredPiiFields("integration");
			expect(integrationFields.has("accountEmail")).toBe(true);
			expect(integrationFields.has("accountName")).toBe(true);
		});

		it("should have registered fields for programmatically registered resource types", () => {
			// Space
			const spaceFields = getRegisteredPiiFields("space");
			expect(spaceFields.has("ownerEmail")).toBe(true);
			expect(spaceFields.has("memberEmails")).toBe(true);

			// Settings
			const settingsFields = getRegisteredPiiFields("settings");
			expect(settingsFields.has("email")).toBe(true);
			expect(settingsFields.has("notificationEmail")).toBe(true);

			// Tenant
			const tenantFields = getRegisteredPiiFields("tenant");
			expect(tenantFields.has("adminEmail")).toBe(true);
			expect(tenantFields.has("billingEmail")).toBe(true);

			// Org
			const orgFields = getRegisteredPiiFields("org");
			expect(orgFields.has("adminEmail")).toBe(true);
			expect(orgFields.has("memberEmails")).toBe(true);
		});
	});

	describe("GLOBAL_PII_FIELDS", () => {
		it("should contain common PII field names", () => {
			expect(GLOBAL_PII_FIELDS.has("email")).toBe(true);
			expect(GLOBAL_PII_FIELDS.has("name")).toBe(true);
			expect(GLOBAL_PII_FIELDS.has("phone")).toBe(true);
			expect(GLOBAL_PII_FIELDS.has("address")).toBe(true);
			expect(GLOBAL_PII_FIELDS.has("ip")).toBe(true);
		});

		it("should be case-sensitive", () => {
			expect(GLOBAL_PII_FIELDS.has("Email")).toBe(false);
			expect(GLOBAL_PII_FIELDS.has("EMAIL")).toBe(false);
		});
	});

	describe("ACTOR_PII_FIELDS", () => {
		it("should contain actor-specific PII fields", () => {
			expect(ACTOR_PII_FIELDS.has("actorEmail")).toBe(true);
			expect(ACTOR_PII_FIELDS.has("actorIp")).toBe(true);
			expect(ACTOR_PII_FIELDS.has("actorDevice")).toBe(true);
		});
	});

	describe("getPiiFieldsForResource", () => {
		it("should return PII fields for known resource type", () => {
			const userFields = getPiiFieldsForResource("user");
			expect(userFields.size).toBeGreaterThan(0);
			expect(userFields.has("email")).toBe(true);
		});

		it("should include global PII fields for any resource type", () => {
			const docFields = getPiiFieldsForResource("doc");
			// Should include global fields like email, name, etc.
			expect(docFields.has("email")).toBe(true);
			expect(docFields.has("name")).toBe(true);
		});

		it("should include decorator-registered fields", () => {
			const userFields = getPiiFieldsForResource("user");
			// Should include decorator-registered fields
			expect(userFields.has("picture")).toBe(true);
		});

		it("should return Set instance", () => {
			const fields = getPiiFieldsForResource("folder");
			expect(fields instanceof Set).toBe(true);
		});
	});

	describe("isPiiField", () => {
		it("should return true for decorator-registered PII fields", () => {
			expect(isPiiField("user", "email")).toBe(true);
			expect(isPiiField("user", "picture")).toBe(true);
			expect(isPiiField("session", "ip")).toBe(true);
		});

		it("should return true for programmatically registered PII fields", () => {
			expect(isPiiField("space", "memberEmails")).toBe(true);
			expect(isPiiField("tenant", "billingEmail")).toBe(true);
		});

		it("should return true for global PII fields", () => {
			expect(isPiiField("doc", "email")).toBe(true);
			expect(isPiiField("integration", "phone")).toBe(true);
		});

		it("should return false for non-PII fields", () => {
			expect(isPiiField("user", "id")).toBe(false);
			expect(isPiiField("doc", "content")).toBe(false);
			expect(isPiiField("integration", "status")).toBe(false);
		});

		it("should handle camelCase field names with global PII keywords", () => {
			// Fields containing "email" or "phone" in camelCase should be detected
			expect(isPiiField("user", "emailAddress")).toBe(true);
			expect(isPiiField("user", "phoneNumber")).toBe(true);
			expect(isPiiField("user", "ipAddress")).toBe(true);
		});

		it("should be case-insensitive for decorator-registered fields", () => {
			expect(isPiiField("user", "EMAIL")).toBe(true);
			expect(isPiiField("user", "Email")).toBe(true);
			expect(isPiiField("session", "IP")).toBe(true);
		});
	});

	describe("isActorPiiField", () => {
		it("should return true for actor PII fields", () => {
			expect(isActorPiiField("actorEmail")).toBe(true);
			expect(isActorPiiField("actorIp")).toBe(true);
			expect(isActorPiiField("actorDevice")).toBe(true);
		});

		it("should return false for non-actor fields", () => {
			expect(isActorPiiField("email")).toBe(false);
			expect(isActorPiiField("userId")).toBe(false);
			expect(isActorPiiField("resourceId")).toBe(false);
		});
	});

	describe("Coverage for all resource types", () => {
		it("should have PII fields registered for all resource types", () => {
			const resourceTypes: Array<AuditResourceType> = [
				"user",
				"session",
				"site",
				"space",
				"folder",
				"doc",
				"integration",
				"settings",
				"tenant",
				"org",
			];

			for (const resourceType of resourceTypes) {
				// All resource types should be able to call getPiiFieldsForResource
				const fields = getPiiFieldsForResource(resourceType);
				expect(fields instanceof Set).toBe(true);
				// At minimum, should have global PII fields
				expect(fields.size).toBeGreaterThan(0);
			}
		});
	});
});
