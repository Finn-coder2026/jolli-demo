import { createDomainVerificationService, type DomainVerificationService } from "./DomainVerificationService";
import * as dns from "node:dns/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the dns/promises module
vi.mock("node:dns/promises", () => ({
	resolveTxt: vi.fn(),
}));

describe("DomainVerificationService", () => {
	let service: DomainVerificationService;
	const mockResolveTxt = vi.mocked(dns.resolveTxt);

	beforeEach(() => {
		service = createDomainVerificationService();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("getVerificationRecordName", () => {
		it("returns correct record name for domain", () => {
			expect(service.getVerificationRecordName("docs.acme.com")).toBe("_jolli-verification.docs.acme.com");
		});

		it("handles root domains", () => {
			expect(service.getVerificationRecordName("acme.com")).toBe("_jolli-verification.acme.com");
		});

		it("handles subdomains", () => {
			expect(service.getVerificationRecordName("api.docs.acme.com")).toBe(
				"_jolli-verification.api.docs.acme.com",
			);
		});
	});

	describe("getExpectedRecordValue", () => {
		it("returns correctly formatted verification value", () => {
			expect(service.getExpectedRecordValue("abc123token")).toBe("jolli-verify=abc123token");
		});

		it("handles long tokens", () => {
			const longToken = "a".repeat(64);
			expect(service.getExpectedRecordValue(longToken)).toBe(`jolli-verify=${longToken}`);
		});
	});

	describe("verifyDomain", () => {
		it("returns verified=true when correct TXT record exists", async () => {
			mockResolveTxt.mockResolvedValue([["jolli-verify=abc123token"]]);

			const result = await service.verifyDomain("docs.acme.com", "abc123token");

			expect(result.verified).toBe(true);
			expect(result.foundRecords).toEqual(["jolli-verify=abc123token"]);
			expect(result.expectedRecord).toBe("jolli-verify=abc123token");
			expect(result.error).toBeUndefined();
			expect(mockResolveTxt).toHaveBeenCalledWith("_jolli-verification.docs.acme.com");
		});

		it("returns verified=true when TXT record contains the value among other content", async () => {
			mockResolveTxt.mockResolvedValue([["some-other-data jolli-verify=mytoken more-data"]]);

			const result = await service.verifyDomain("example.org", "mytoken");

			expect(result.verified).toBe(true);
		});

		it("handles multi-part TXT records (records > 255 chars)", async () => {
			// DNS returns long TXT records split into chunks
			mockResolveTxt.mockResolvedValue([["jolli-verify=", "verylongtoken123"]]);

			const result = await service.verifyDomain("example.org", "verylongtoken123");

			expect(result.verified).toBe(true);
			expect(result.foundRecords).toEqual(["jolli-verify=verylongtoken123"]);
		});

		it("returns verified=false when record has wrong token", async () => {
			mockResolveTxt.mockResolvedValue([["jolli-verify=wrongtoken"]]);

			const result = await service.verifyDomain("docs.acme.com", "correcttoken");

			expect(result.verified).toBe(false);
			expect(result.error).toBe('Expected TXT record "jolli-verify=correcttoken" not found');
			expect(result.foundRecords).toEqual(["jolli-verify=wrongtoken"]);
		});

		it("returns verified=false when no matching records exist", async () => {
			mockResolveTxt.mockResolvedValue([["unrelated-txt-record"], ["another-record"]]);

			const result = await service.verifyDomain("docs.acme.com", "mytoken");

			expect(result.verified).toBe(false);
			expect(result.foundRecords).toEqual(["unrelated-txt-record", "another-record"]);
		});

		it("handles ENOTFOUND DNS error (no records)", async () => {
			const error = new Error("getaddrinfo ENOTFOUND") as NodeJS.ErrnoException;
			error.code = "ENOTFOUND";
			mockResolveTxt.mockRejectedValue(error);

			const result = await service.verifyDomain("unknown.domain.com", "token123");

			expect(result.verified).toBe(false);
			expect(result.foundRecords).toEqual([]);
			expect(result.error).toBe("No TXT records found at _jolli-verification.unknown.domain.com");
		});

		it("handles ENODATA DNS error (domain exists but no TXT records)", async () => {
			const error = new Error("queryTxt ENODATA") as NodeJS.ErrnoException;
			error.code = "ENODATA";
			mockResolveTxt.mockRejectedValue(error);

			const result = await service.verifyDomain("nodns.example.com", "token123");

			expect(result.verified).toBe(false);
			expect(result.foundRecords).toEqual([]);
			expect(result.error).toBe("No TXT records found at _jolli-verification.nodns.example.com");
		});

		it("handles ETIMEOUT DNS error", async () => {
			const error = new Error("queryTxt ETIMEOUT") as NodeJS.ErrnoException;
			error.code = "ETIMEOUT";
			mockResolveTxt.mockRejectedValue(error);

			const result = await service.verifyDomain("slow.example.com", "token123");

			expect(result.verified).toBe(false);
			expect(result.error).toBe("DNS lookup failed: queryTxt ETIMEOUT");
		});

		it("handles ESERVFAIL DNS error", async () => {
			const error = new Error("queryTxt ESERVFAIL") as NodeJS.ErrnoException;
			error.code = "ESERVFAIL";
			mockResolveTxt.mockRejectedValue(error);

			const result = await service.verifyDomain("broken.example.com", "token123");

			expect(result.verified).toBe(false);
			expect(result.error).toBe("DNS lookup failed: queryTxt ESERVFAIL");
		});

		it("re-throws unexpected errors", async () => {
			const error = new Error("Unexpected error");
			mockResolveTxt.mockRejectedValue(error);

			await expect(service.verifyDomain("error.example.com", "token123")).rejects.toThrow("Unexpected error");
		});
	});

	describe("getVerificationInstructions", () => {
		it("returns formatted instructions with domain and token", () => {
			const instructions = service.getVerificationInstructions("docs.acme.com", "abc123token");

			expect(instructions).toContain("docs.acme.com");
			expect(instructions).toContain("_jolli-verification.docs.acme.com");
			expect(instructions).toContain("jolli-verify=abc123token");
			expect(instructions).toContain("TXT");
			expect(instructions).toContain("dig");
			expect(instructions).toContain("nslookup");
		});

		it("includes DNS propagation warning", () => {
			const instructions = service.getVerificationInstructions("example.org", "token");

			expect(instructions).toContain("propagation");
		});
	});

	describe("custom configuration", () => {
		it("allows custom verification prefix", async () => {
			const customService = createDomainVerificationService({
				verificationPrefix: "custom-prefix",
			});

			expect(customService.getExpectedRecordValue("mytoken")).toBe("custom-prefix=mytoken");

			mockResolveTxt.mockResolvedValue([["custom-prefix=mytoken"]]);
			const result = await customService.verifyDomain("example.com", "mytoken");
			expect(result.verified).toBe(true);
		});
	});
});
