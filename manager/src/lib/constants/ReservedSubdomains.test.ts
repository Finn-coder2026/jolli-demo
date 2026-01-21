import { isReservedSubdomain, RESERVED_SUBDOMAINS } from "./ReservedSubdomains";
import { describe, expect, it } from "vitest";

describe("ReservedSubdomains", () => {
	describe("RESERVED_SUBDOMAINS", () => {
		it("should be a non-empty array", () => {
			expect(Array.isArray(RESERVED_SUBDOMAINS)).toBe(true);
			expect(RESERVED_SUBDOMAINS.length).toBeGreaterThan(0);
		});

		it("should contain essential system subdomains", () => {
			expect(RESERVED_SUBDOMAINS).toContain("auth");
			expect(RESERVED_SUBDOMAINS).toContain("api");
			expect(RESERVED_SUBDOMAINS).toContain("www");
			expect(RESERVED_SUBDOMAINS).toContain("manager");
			expect(RESERVED_SUBDOMAINS).toContain("admin");
		});

		it("should contain infrastructure subdomains", () => {
			expect(RESERVED_SUBDOMAINS).toContain("cdn");
			expect(RESERVED_SUBDOMAINS).toContain("static");
			expect(RESERVED_SUBDOMAINS).toContain("mail");
			expect(RESERVED_SUBDOMAINS).toContain("smtp");
		});

		it("should contain environment subdomains", () => {
			expect(RESERVED_SUBDOMAINS).toContain("staging");
			expect(RESERVED_SUBDOMAINS).toContain("dev");
			expect(RESERVED_SUBDOMAINS).toContain("test");
			expect(RESERVED_SUBDOMAINS).toContain("demo");
		});
	});

	describe("isReservedSubdomain", () => {
		it("should return true for reserved subdomains", () => {
			expect(isReservedSubdomain("auth")).toBe(true);
			expect(isReservedSubdomain("api")).toBe(true);
			expect(isReservedSubdomain("www")).toBe(true);
			expect(isReservedSubdomain("manager")).toBe(true);
		});

		it("should return true for reserved subdomains regardless of case", () => {
			expect(isReservedSubdomain("AUTH")).toBe(true);
			expect(isReservedSubdomain("Auth")).toBe(true);
			expect(isReservedSubdomain("API")).toBe(true);
			expect(isReservedSubdomain("WWW")).toBe(true);
			expect(isReservedSubdomain("Manager")).toBe(true);
		});

		it("should return false for non-reserved subdomains", () => {
			expect(isReservedSubdomain("acme")).toBe(false);
			expect(isReservedSubdomain("mycompany")).toBe(false);
			expect(isReservedSubdomain("customer123")).toBe(false);
			expect(isReservedSubdomain("tenant-slug")).toBe(false);
		});

		it("should return false for empty string", () => {
			expect(isReservedSubdomain("")).toBe(false);
		});

		it("should handle subdomains with mixed case correctly", () => {
			expect(isReservedSubdomain("StAtUs")).toBe(true);
			expect(isReservedSubdomain("BILLING")).toBe(true);
			expect(isReservedSubdomain("DoCs")).toBe(true);
		});
	});
});
