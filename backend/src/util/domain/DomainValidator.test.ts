import { validateCustomDomain } from "./DomainValidator";
import { describe, expect, it } from "vitest";

describe("DomainValidator", () => {
	describe("validateCustomDomain", () => {
		it("should accept valid domains", () => {
			expect(validateCustomDomain("docs.acme.com")).toEqual({ valid: true });
			expect(validateCustomDomain("api.example.org")).toEqual({ valid: true });
			expect(validateCustomDomain("my-company.io")).toEqual({ valid: true });
		});

		it("should accept domains with subdomains", () => {
			expect(validateCustomDomain("docs.api.example.com")).toEqual({ valid: true });
		});

		it("should accept domains with numbers", () => {
			expect(validateCustomDomain("site123.example.com")).toEqual({ valid: true });
			expect(validateCustomDomain("123.example.com")).toEqual({ valid: true });
		});

		it("should reject empty domain", () => {
			expect(validateCustomDomain("")).toEqual({ valid: false, error: "Domain is required" });
		});

		it("should reject invalid domain format", () => {
			expect(validateCustomDomain("notadomain").valid).toBe(false);
			expect(validateCustomDomain("http://example.com").valid).toBe(false);
			expect(validateCustomDomain("example").valid).toBe(false);
			expect(validateCustomDomain(".com").valid).toBe(false);
			expect(validateCustomDomain("example.").valid).toBe(false);
		});

		it("should reject jolli.site domains", () => {
			const result = validateCustomDomain("docs.jolli.site");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("jolli.site");
		});

		it("should reject jolli.site root domain", () => {
			const result = validateCustomDomain("jolli.site");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("jolli.site");
		});

		it("should reject jolli.site environment subdomains", () => {
			// Local environment subdomain
			const localResult = validateCustomDomain("docs-acme.local.jolli.site");
			expect(localResult.valid).toBe(false);
			expect(localResult.error).toContain("jolli.site");

			// Dev environment subdomain
			const devResult = validateCustomDomain("docs-acme.dev.jolli.site");
			expect(devResult.valid).toBe(false);
			expect(devResult.error).toContain("jolli.site");

			// Preview environment subdomain
			const previewResult = validateCustomDomain("docs-acme.preview.jolli.site");
			expect(previewResult.valid).toBe(false);
			expect(previewResult.error).toContain("jolli.site");
		});

		it("should reject vercel.app domains", () => {
			const result = validateCustomDomain("my-site.vercel.app");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("vercel.app");
		});

		it("should reject vercel.com domains", () => {
			const result = validateCustomDomain("my-site.vercel.com");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("vercel.com");
		});

		it("should reject jolli.ai domains", () => {
			const result = validateCustomDomain("docs.jolli.ai");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("jolli.ai");
		});

		it("should reject localhost", () => {
			const result = validateCustomDomain("app.localhost");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("localhost");
		});

		it("should reject domains that are too long", () => {
			const longDomain = `${"a".repeat(250)}.com`;
			expect(validateCustomDomain(longDomain).valid).toBe(false);
			expect(validateCustomDomain(longDomain).error).toContain("too long");
		});

		it("should be case-insensitive", () => {
			expect(validateCustomDomain("DOCS.EXAMPLE.COM")).toEqual({ valid: true });
			expect(validateCustomDomain("Docs.Example.Com")).toEqual({ valid: true });
		});

		it("should trim whitespace", () => {
			expect(validateCustomDomain("  docs.example.com  ")).toEqual({ valid: true });
		});

		it("should accept various TLDs", () => {
			expect(validateCustomDomain("example.co")).toEqual({ valid: true });
			expect(validateCustomDomain("example.co.uk")).toEqual({ valid: true });
			expect(validateCustomDomain("example.technology")).toEqual({ valid: true });
		});

		it("should reject domains with invalid characters", () => {
			expect(validateCustomDomain("docs_site.example.com").valid).toBe(false);
			expect(validateCustomDomain("docs site.example.com").valid).toBe(false);
		});
	});
});
