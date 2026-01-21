import {
	clearPiiRegistry,
	getRegisteredPiiFields,
	getRegisteredResourceTypes,
	isRegisteredPiiField,
	PIIField,
	PIISchema,
	registerPiiFields,
} from "./PiiDecorators";
import { beforeEach, describe, expect, it } from "vitest";

describe("PiiDecorators", () => {
	beforeEach(() => {
		clearPiiRegistry();
	});

	describe("@PIIField and @PIISchema decorators", () => {
		it("should register PII fields from decorated class", () => {
			@PIISchema("user")
			class TestUserPII {
				@PIIField({ description: "Test email" })
				email!: string;

				@PIIField({ description: "Test name" })
				name!: string;
			}
			void TestUserPII;

			const fields = getRegisteredPiiFields("user");
			expect(fields.size).toBe(2);
			expect(fields.has("email")).toBe(true);
			expect(fields.has("name")).toBe(true);
			expect(fields.get("email")?.description).toBe("Test email");
		});

		it("should register fields without description", () => {
			@PIISchema("doc")
			class TestDocPII {
				@PIIField()
				authorEmail!: string;
			}
			void TestDocPII;

			const fields = getRegisteredPiiFields("doc");
			expect(fields.has("authorEmail")).toBe(true);
			expect(fields.get("authorEmail")?.description).toBeUndefined();
		});

		it("should merge fields when multiple classes register for same resource", () => {
			@PIISchema("site")
			class TestSitePII1 {
				@PIIField({ description: "Owner email" })
				ownerEmail!: string;
			}
			void TestSitePII1;

			@PIISchema("site")
			class TestSitePII2 {
				@PIIField({ description: "Contact email" })
				contactEmail!: string;
			}
			void TestSitePII2;

			const fields = getRegisteredPiiFields("site");
			expect(fields.size).toBe(2);
			expect(fields.has("ownerEmail")).toBe(true);
			expect(fields.has("contactEmail")).toBe(true);
		});
	});

	describe("isRegisteredPiiField", () => {
		beforeEach(() => {
			@PIISchema("user")
			class TestPII {
				@PIIField()
				email!: string;

				@PIIField()
				userName!: string;
			}
			void TestPII;
		});

		it("should return true for registered PII field", () => {
			expect(isRegisteredPiiField("user", "email")).toBe(true);
			expect(isRegisteredPiiField("user", "userName")).toBe(true);
		});

		it("should return false for unregistered field", () => {
			expect(isRegisteredPiiField("user", "id")).toBe(false);
			expect(isRegisteredPiiField("user", "createdAt")).toBe(false);
		});

		it("should return false for unregistered resource type", () => {
			expect(isRegisteredPiiField("folder", "email")).toBe(false);
		});

		it("should be case-insensitive", () => {
			expect(isRegisteredPiiField("user", "EMAIL")).toBe(true);
			expect(isRegisteredPiiField("user", "Email")).toBe(true);
			expect(isRegisteredPiiField("user", "USERNAME")).toBe(true);
		});
	});

	describe("getRegisteredResourceTypes", () => {
		it("should return empty array when no resources registered", () => {
			expect(getRegisteredResourceTypes()).toEqual([]);
		});

		it("should return all registered resource types", () => {
			@PIISchema("user")
			class UserPII {
				@PIIField()
				email!: string;
			}
			void UserPII;

			@PIISchema("session")
			class SessionPII {
				@PIIField()
				ip!: string;
			}
			void SessionPII;

			const types = getRegisteredResourceTypes();
			expect(types).toContain("user");
			expect(types).toContain("session");
			expect(types.length).toBe(2);
		});
	});

	describe("registerPiiFields", () => {
		it("should register fields programmatically", () => {
			registerPiiFields("space", {
				ownerEmail: { description: "Space owner" },
				memberEmails: { description: "Space members" },
			});

			const fields = getRegisteredPiiFields("space");
			expect(fields.size).toBe(2);
			expect(fields.has("ownerEmail")).toBe(true);
			expect(fields.get("ownerEmail")?.description).toBe("Space owner");
		});

		it("should merge with existing fields", () => {
			registerPiiFields("tenant", {
				adminEmail: { description: "Admin" },
			});
			registerPiiFields("tenant", {
				billingEmail: { description: "Billing" },
			});

			const fields = getRegisteredPiiFields("tenant");
			expect(fields.size).toBe(2);
			expect(fields.has("adminEmail")).toBe(true);
			expect(fields.has("billingEmail")).toBe(true);
		});
	});

	describe("clearPiiRegistry", () => {
		it("should clear all registered fields", () => {
			registerPiiFields("user", { email: {} });
			registerPiiFields("session", { ip: {} });

			expect(getRegisteredResourceTypes().length).toBe(2);

			clearPiiRegistry();

			expect(getRegisteredResourceTypes().length).toBe(0);
			expect(getRegisteredPiiFields("user").size).toBe(0);
		});
	});
});
