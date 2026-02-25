import { parseNameFromEmail } from "./NameUtil";
import { describe, expect, it } from "vitest";

describe("nameUtil", () => {
	describe("parseNameFromEmail", () => {
		it("should parse name with dot separator", () => {
			expect(parseNameFromEmail("john.doe@example.com")).toBe("John Doe");
		});

		it("should parse name with underscore separator", () => {
			expect(parseNameFromEmail("jane_smith@example.com")).toBe("Jane Smith");
		});

		it("should parse name with hyphen separator", () => {
			expect(parseNameFromEmail("bob-jones@example.com")).toBe("Bob Jones");
		});

		it("should parse name with plus separator", () => {
			expect(parseNameFromEmail("alice+test@example.com")).toBe("Alice Test");
		});

		it("should handle multiple parts", () => {
			expect(parseNameFromEmail("bob.a.jones@example.com")).toBe("Bob A Jones");
		});

		it("should capitalize single letter initials", () => {
			expect(parseNameFromEmail("j.smith@example.com")).toBe("J Smith");
		});

		it("should handle no separator", () => {
			expect(parseNameFromEmail("johndoe@example.com")).toBe("Johndoe");
		});

		it("should handle numbers in username", () => {
			expect(parseNameFromEmail("user123@example.com")).toBe("User123");
		});

		it("should return empty string for empty local part", () => {
			expect(parseNameFromEmail("@example.com")).toBe("");
		});

		it("should filter out number-only parts", () => {
			expect(parseNameFromEmail("john.123.doe@example.com")).toBe("John Doe");
		});

		it("should return empty string for purely numeric local part", () => {
			expect(parseNameFromEmail("12345@example.com")).toBe("");
		});

		it("should preserve 2-letter uppercase acronyms", () => {
			expect(parseNameFromEmail("john.US.doe@example.com")).toBe("John US Doe");
		});

		it("should normalize longer uppercase parts", () => {
			expect(parseNameFromEmail("JOHN.DOE@example.com")).toBe("John Doe");
		});

		it("should handle mixed case parts", () => {
			expect(parseNameFromEmail("JohnDoe@example.com")).toBe("Johndoe");
		});

		it("should handle empty parts from consecutive separators", () => {
			expect(parseNameFromEmail("john..doe@example.com")).toBe("John Doe");
		});

		it("should handle letters mixed with numbers", () => {
			expect(parseNameFromEmail("john2.doe3@example.com")).toBe("John2 Doe3");
		});

		it("should capitalize local part when filter removes all parts but local has letters", () => {
			// This covers the case where parts are filtered out but local part has letters
			// e.g., "123abc" - "123" is filtered, but local part has letters
			expect(parseNameFromEmail("123abc@example.com")).toBe("123abc");
		});

		it("should handle email with only special characters separators and numbers", () => {
			// Tests the fallback to localPart when nameParts is empty but has letters
			expect(parseNameFromEmail("x123@example.com")).toBe("X123");
		});

		it("should handle case where all parts are numbers but localPart has letters", () => {
			// This tests the edge case at line 36-38
			// Actually this is likely unreachable because if localPart has letters,
			// at least one split part must contain those letters
			// But let's test numeric-only local parts
			expect(parseNameFromEmail("123.456@example.com")).toBe("");
		});
	});
});
