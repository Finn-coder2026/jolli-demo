import { generateSubdomainSuggestion, sanitizeToSubdomain, validateSubdomain } from "./SubdomainValidator";
import { describe, expect, it } from "vitest";

describe("SubdomainValidator", () => {
	describe("validateSubdomain", () => {
		it("should accept valid subdomains", () => {
			expect(validateSubdomain("docs")).toEqual({ valid: true, sanitized: "docs" });
			expect(validateSubdomain("api-docs")).toEqual({ valid: true, sanitized: "api-docs" });
			expect(validateSubdomain("my-site-123")).toEqual({ valid: true, sanitized: "my-site-123" });
		});

		it("should convert to lowercase", () => {
			expect(validateSubdomain("DOCS")).toEqual({ valid: true, sanitized: "docs" });
			expect(validateSubdomain("Api-Docs")).toEqual({ valid: true, sanitized: "api-docs" });
		});

		it("should reject empty subdomain", () => {
			expect(validateSubdomain("")).toEqual({ valid: false, error: "Subdomain is required" });
		});

		it("should reject subdomain shorter than 3 characters", () => {
			expect(validateSubdomain("ab").valid).toBe(false);
			expect(validateSubdomain("ab").error).toContain("at least 3");
		});

		it("should reject subdomain longer than 63 characters", () => {
			const longSubdomain = "a".repeat(64);
			expect(validateSubdomain(longSubdomain).valid).toBe(false);
			expect(validateSubdomain(longSubdomain).error).toContain("at most 63");
		});

		it("should reject subdomain starting with hyphen", () => {
			expect(validateSubdomain("-docs").valid).toBe(false);
			expect(validateSubdomain("-docs").error).toContain("cannot start or end with");
		});

		it("should reject subdomain ending with hyphen", () => {
			expect(validateSubdomain("docs-").valid).toBe(false);
			expect(validateSubdomain("docs-").error).toContain("cannot start or end with");
		});

		it("should reject subdomain with consecutive hyphens", () => {
			expect(validateSubdomain("docs--api").valid).toBe(false);
			expect(validateSubdomain("docs--api").error).toContain("consecutive hyphens");
		});

		it("should reject subdomain with invalid characters", () => {
			expect(validateSubdomain("docs.api").valid).toBe(false);
			expect(validateSubdomain("docs_api").valid).toBe(false);
			expect(validateSubdomain("docs api").valid).toBe(false);
		});

		it("should accept exactly 3 characters", () => {
			expect(validateSubdomain("abc")).toEqual({ valid: true, sanitized: "abc" });
		});

		it("should accept exactly 63 characters", () => {
			const subdomain = "a".repeat(63);
			expect(validateSubdomain(subdomain)).toEqual({ valid: true, sanitized: subdomain });
		});

		it("should trim whitespace", () => {
			expect(validateSubdomain("  docs  ")).toEqual({ valid: true, sanitized: "docs" });
		});

		it("should accept numeric subdomains", () => {
			expect(validateSubdomain("123")).toEqual({ valid: true, sanitized: "123" });
			expect(validateSubdomain("1a2b3c")).toEqual({ valid: true, sanitized: "1a2b3c" });
		});
	});

	describe("sanitizeToSubdomain", () => {
		it("should convert to lowercase", () => {
			expect(sanitizeToSubdomain("MyDocs")).toBe("mydocs");
		});

		it("should replace spaces with hyphens", () => {
			expect(sanitizeToSubdomain("my docs")).toBe("my-docs");
		});

		it("should replace special characters with hyphens", () => {
			expect(sanitizeToSubdomain("my_docs!")).toBe("my-docs");
		});

		it("should collapse consecutive hyphens", () => {
			expect(sanitizeToSubdomain("my  docs")).toBe("my-docs");
			expect(sanitizeToSubdomain("my---docs")).toBe("my-docs");
		});

		it("should remove leading and trailing hyphens", () => {
			expect(sanitizeToSubdomain("-my-docs-")).toBe("my-docs");
		});

		it("should truncate to 63 characters", () => {
			const longInput = "a".repeat(100);
			expect(sanitizeToSubdomain(longInput).length).toBe(63);
		});

		it("should handle real site names", () => {
			expect(sanitizeToSubdomain("API Documentation")).toBe("api-documentation");
			expect(sanitizeToSubdomain("My Company's Docs")).toBe("my-company-s-docs");
		});

		it("should handle empty input", () => {
			expect(sanitizeToSubdomain("")).toBe("");
		});

		it("should handle input with only special characters", () => {
			expect(sanitizeToSubdomain("@#$%")).toBe("");
		});

		it("should handle input with unicode characters", () => {
			expect(sanitizeToSubdomain("café-docs")).toBe("caf-docs");
		});
	});

	describe("generateSubdomainSuggestion", () => {
		it("should append number to base", () => {
			expect(generateSubdomainSuggestion("docs", 1)).toBe("docs-1");
			expect(generateSubdomainSuggestion("docs", 2)).toBe("docs-2");
		});

		it("should truncate base to fit within max length", () => {
			const longBase = "a".repeat(63);
			const suggestion = generateSubdomainSuggestion(longBase, 1);
			expect(suggestion.length).toBeLessThanOrEqual(63);
			expect(suggestion).toMatch(/-1$/);
		});

		it("should handle higher attempt numbers", () => {
			expect(generateSubdomainSuggestion("docs", 99)).toBe("docs-99");
			expect(generateSubdomainSuggestion("docs", 100)).toBe("docs-100");
		});

		it("should sanitize the base before generating", () => {
			expect(generateSubdomainSuggestion("My Docs", 1)).toBe("my-docs-1");
		});

		it("should handle long base with large attempt number", () => {
			const longBase = "a".repeat(60);
			const suggestion = generateSubdomainSuggestion(longBase, 123);
			expect(suggestion.length).toBeLessThanOrEqual(63);
			expect(suggestion).toMatch(/-123$/);
		});
	});
});
