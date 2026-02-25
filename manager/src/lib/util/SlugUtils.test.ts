import { generateProviderSlug, isValidProviderSlug, slugToPostgresIdentifier } from "./SlugUtils";
import { describe, expect, it } from "vitest";

describe("SlugUtils", () => {
	describe("generateProviderSlug", () => {
		it("converts spaces to underscores", () => {
			expect(generateProviderSlug("my provider")).toBe("my_provider");
			expect(generateProviderSlug("a b c")).toBe("a_b_c");
		});

		it("converts to lowercase", () => {
			expect(generateProviderSlug("MyProvider")).toBe("myprovider");
			expect(generateProviderSlug("LOUD")).toBe("loud");
		});

		it("removes special characters", () => {
			expect(generateProviderSlug("my-provider!")).toBe("myprovider");
			expect(generateProviderSlug("provider@123#")).toBe("provider123");
		});

		it("handles mixed cases", () => {
			expect(generateProviderSlug("My Provider 123!")).toBe("my_provider_123");
		});

		it("truncates to max length", () => {
			const longName = "a".repeat(60);
			expect(generateProviderSlug(longName)).toHaveLength(50);
		});

		it("uses custom max length", () => {
			const longName = "a".repeat(30);
			expect(generateProviderSlug(longName, 20)).toHaveLength(20);
		});

		it("handles empty string", () => {
			expect(generateProviderSlug("")).toBe("");
		});

		it("handles multiple consecutive spaces as single underscore", () => {
			expect(generateProviderSlug("my    provider")).toBe("my_provider");
		});
	});

	describe("isValidProviderSlug", () => {
		it("returns true for valid slugs", () => {
			expect(isValidProviderSlug("myprovider")).toBe(true);
			expect(isValidProviderSlug("my_provider")).toBe(true);
			expect(isValidProviderSlug("provider123")).toBe(true);
			expect(isValidProviderSlug("my_provider_123")).toBe(true);
		});

		it("returns false for empty string", () => {
			expect(isValidProviderSlug("")).toBe(false);
		});

		it("returns false for uppercase letters", () => {
			expect(isValidProviderSlug("MyProvider")).toBe(false);
		});

		it("returns false for hyphens", () => {
			expect(isValidProviderSlug("my-provider")).toBe(false);
		});

		it("returns false for special characters", () => {
			expect(isValidProviderSlug("my!provider")).toBe(false);
			expect(isValidProviderSlug("provider@123")).toBe(false);
		});

		it("returns false for slugs exceeding max length", () => {
			const longSlug = "a".repeat(51);
			expect(isValidProviderSlug(longSlug)).toBe(false);
		});

		it("returns true for exactly max length", () => {
			const maxSlug = "a".repeat(50);
			expect(isValidProviderSlug(maxSlug)).toBe(true);
		});
	});

	describe("slugToPostgresIdentifier", () => {
		it("converts hyphens to underscores", () => {
			expect(slugToPostgresIdentifier("pie-project")).toBe("pie_project");
			expect(slugToPostgresIdentifier("my-tenant-name")).toBe("my_tenant_name");
		});

		it("handles slugs without hyphens unchanged", () => {
			expect(slugToPostgresIdentifier("project")).toBe("project");
			expect(slugToPostgresIdentifier("myproject123")).toBe("myproject123");
		});

		it("handles multiple consecutive hyphens", () => {
			expect(slugToPostgresIdentifier("my--project")).toBe("my__project");
		});

		it("handles empty string", () => {
			expect(slugToPostgresIdentifier("")).toBe("");
		});

		it("handles single character slug", () => {
			expect(slugToPostgresIdentifier("a")).toBe("a");
		});

		it("handles slug with hyphen at multiple positions", () => {
			expect(slugToPostgresIdentifier("a-b-c-d")).toBe("a_b_c_d");
		});
	});
});
