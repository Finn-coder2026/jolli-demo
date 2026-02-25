import { parseNameFromEmail } from "./NameUtil";
import { describe, expect, it } from "vitest";

describe("parseNameFromEmail", () => {
	it("should parse firstname.lastname format", () => {
		expect(parseNameFromEmail("john.doe@example.com")).toBe("John Doe");
		expect(parseNameFromEmail("jane.smith@company.org")).toBe("Jane Smith");
	});

	it("should parse firstname_lastname format", () => {
		expect(parseNameFromEmail("john_doe@example.com")).toBe("John Doe");
		expect(parseNameFromEmail("jane_smith@company.org")).toBe("Jane Smith");
	});

	it("should parse firstname-lastname format", () => {
		expect(parseNameFromEmail("john-doe@example.com")).toBe("John Doe");
		expect(parseNameFromEmail("jane-smith@company.org")).toBe("Jane Smith");
	});

	it("should handle multiple separators", () => {
		expect(parseNameFromEmail("bob.a.jones@example.com")).toBe("Bob A Jones");
		expect(parseNameFromEmail("mary-jane_watson@example.com")).toBe("Mary Jane Watson");
	});

	it("should handle single name", () => {
		expect(parseNameFromEmail("johndoe@example.com")).toBe("Johndoe");
		expect(parseNameFromEmail("alice@example.com")).toBe("Alice");
	});

	it("should handle initials", () => {
		expect(parseNameFromEmail("j.doe@example.com")).toBe("J Doe");
		expect(parseNameFromEmail("a.b.smith@example.com")).toBe("A B Smith");
	});

	it("should filter out numbers-only parts", () => {
		expect(parseNameFromEmail("john.123@example.com")).toBe("John");
		expect(parseNameFromEmail("john.doe.456@example.com")).toBe("John Doe");
	});

	it("should keep parts with letters and numbers", () => {
		expect(parseNameFromEmail("john2.doe@example.com")).toBe("John2 Doe");
		expect(parseNameFromEmail("user42.smith@example.com")).toBe("User42 Smith");
	});

	it("should handle plus addressing", () => {
		expect(parseNameFromEmail("john.doe+work@example.com")).toBe("John Doe Work");
		expect(parseNameFromEmail("user+spam@example.com")).toBe("User Spam");
	});

	it("should handle all uppercase parts", () => {
		expect(parseNameFromEmail("john.DOE@example.com")).toBe("John Doe");
		expect(parseNameFromEmail("BOB.SMITH@example.com")).toBe("Bob Smith");
	});

	it("should keep short uppercase acronyms", () => {
		expect(parseNameFromEmail("john.IT@example.com")).toBe("John IT");
		expect(parseNameFromEmail("bob.US@example.com")).toBe("Bob US");
	});

	it("should handle mixed case intelligently", () => {
		expect(parseNameFromEmail("JohnDoe@example.com")).toBe("Johndoe");
		expect(parseNameFromEmail("john.DOE@example.com")).toBe("John Doe");
	});

	it("should handle empty local part gracefully", () => {
		expect(parseNameFromEmail("@example.com")).toBe("User");
	});

	it("should handle complex real-world examples", () => {
		expect(parseNameFromEmail("sarah-jane.parker@example.com")).toBe("Sarah Jane Parker");
		expect(parseNameFromEmail("dr_house@example.com")).toBe("Dr House");
		expect(parseNameFromEmail("admin123@example.com")).toBe("Admin123");
		expect(parseNameFromEmail("jolli.user9@yopmail.com")).toBe("Jolli User9");
	});

	it("should handle edge cases", () => {
		expect(parseNameFromEmail("...@example.com")).toBe("User");
		expect(parseNameFromEmail("___@example.com")).toBe("User");
		expect(parseNameFromEmail("123@example.com")).toBe("User");
		expect(parseNameFromEmail("user123@example.com")).toBe("User123");
		expect(parseNameFromEmail("abc@example.com")).toBe("Abc");
		expect(parseNameFromEmail("@")).toBe("User");
	});
});
