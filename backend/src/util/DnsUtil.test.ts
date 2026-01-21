import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted to declare mocks before vi.mock hoisting
const { mockResolveCname, mockResolve4 } = vi.hoisted(() => ({
	mockResolveCname: vi.fn(),
	mockResolve4: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
	default: {
		Resolver: class MockResolver {
			resolveCname = mockResolveCname;
			resolve4 = mockResolve4;
			setServers = vi.fn();
		},
	},
}));

import { checkDnsConfiguration } from "./DnsUtil";

describe("DnsUtil", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("checkDnsConfiguration", () => {
		describe("subdomain (CNAME check)", () => {
			it("should return configured=true when CNAME points to cname.vercel-dns.com", async () => {
				mockResolveCname.mockResolvedValue(["cname.vercel-dns.com"]);

				const result = await checkDnsConfiguration("docs.example.com");

				expect(result).toEqual({
					configured: true,
					recordType: "CNAME",
					actualValue: "cname.vercel-dns.com",
					expectedValue: "cname.vercel-dns.com",
				});
				expect(mockResolveCname).toHaveBeenCalledWith("docs.example.com");
			});

			it("should return configured=true for any vercel-dns.com subdomain", async () => {
				mockResolveCname.mockResolvedValue(["alias.vercel-dns.com"]);

				const result = await checkDnsConfiguration("docs.example.com");

				expect(result.configured).toBe(true);
				expect(result.recordType).toBe("CNAME");
			});

			it("should handle case-insensitive CNAME comparison", async () => {
				mockResolveCname.mockResolvedValue(["CNAME.VERCEL-DNS.COM"]);

				const result = await checkDnsConfiguration("docs.example.com");

				expect(result.configured).toBe(true);
			});

			it("should return configured=false when CNAME points elsewhere", async () => {
				mockResolveCname.mockResolvedValue(["other-host.example.net"]);

				const result = await checkDnsConfiguration("docs.example.com");

				expect(result).toEqual({
					configured: false,
					recordType: "CNAME",
					actualValue: "other-host.example.net",
					expectedValue: "cname.vercel-dns.com",
				});
			});

			it("should fall back to A record check when no CNAME exists (ENODATA)", async () => {
				const error = new Error("No CNAME record") as NodeJS.ErrnoException;
				error.code = "ENODATA";
				mockResolveCname.mockRejectedValue(error);
				mockResolve4.mockResolvedValue(["76.76.21.21"]);

				const result = await checkDnsConfiguration("docs.example.com");

				expect(result).toEqual({
					configured: true,
					recordType: "A",
					actualValue: "76.76.21.21",
					expectedValue: "76.76.21.21",
				});
			});

			it("should fall back to A record check when domain not found (ENOTFOUND)", async () => {
				const cnameError = new Error("Domain not found") as NodeJS.ErrnoException;
				cnameError.code = "ENOTFOUND";
				mockResolveCname.mockRejectedValue(cnameError);

				const aError = new Error("Domain not found") as NodeJS.ErrnoException;
				aError.code = "ENOTFOUND";
				mockResolve4.mockRejectedValue(aError);

				const result = await checkDnsConfiguration("docs.example.com");

				expect(result).toEqual({
					configured: false,
					recordType: null,
					actualValue: null,
					expectedValue: "76.76.21.21",
				});
			});

			it("should return error for other DNS failures", async () => {
				const error = new Error("Network error") as NodeJS.ErrnoException;
				error.code = "ETIMEOUT";
				mockResolveCname.mockRejectedValue(error);

				const result = await checkDnsConfiguration("docs.example.com");

				expect(result.configured).toBe(false);
				expect(result.recordType).toBeNull();
				expect(result.error).toContain("ETIMEOUT");
			});

			it("should return error message for DNS failures without error code", async () => {
				const error = new Error("Unknown DNS error");
				// Error without .code property
				mockResolveCname.mockRejectedValue(error);

				const result = await checkDnsConfiguration("docs.example.com");

				expect(result.configured).toBe(false);
				expect(result.recordType).toBeNull();
				expect(result.error).toContain("Unknown DNS error");
			});
		});

		describe("apex domain (A record check)", () => {
			it("should return configured=true when A record points to Vercel IP", async () => {
				mockResolve4.mockResolvedValue(["76.76.21.21"]);

				const result = await checkDnsConfiguration("example.com");

				expect(result).toEqual({
					configured: true,
					recordType: "A",
					actualValue: "76.76.21.21",
					expectedValue: "76.76.21.21",
				});
				expect(mockResolve4).toHaveBeenCalledWith("example.com");
				expect(mockResolveCname).not.toHaveBeenCalled();
			});

			it("should return configured=false when A record points elsewhere", async () => {
				mockResolve4.mockResolvedValue(["192.168.1.1"]);

				const result = await checkDnsConfiguration("example.com");

				expect(result).toEqual({
					configured: false,
					recordType: "A",
					actualValue: "192.168.1.1",
					expectedValue: "76.76.21.21",
				});
			});

			it("should handle multiple A records with one pointing to Vercel", async () => {
				mockResolve4.mockResolvedValue(["192.168.1.1", "76.76.21.21", "10.0.0.1"]);

				const result = await checkDnsConfiguration("example.com");

				expect(result.configured).toBe(true);
			});

			it("should return configured=false when no A record exists", async () => {
				const error = new Error("No A record") as NodeJS.ErrnoException;
				error.code = "ENODATA";
				mockResolve4.mockRejectedValue(error);

				const result = await checkDnsConfiguration("example.com");

				expect(result).toEqual({
					configured: false,
					recordType: null,
					actualValue: null,
					expectedValue: "76.76.21.21",
				});
			});

			it("should return error for DNS lookup failures", async () => {
				const error = new Error("Server failure") as NodeJS.ErrnoException;
				error.code = "ESERVFAIL";
				mockResolve4.mockRejectedValue(error);

				const result = await checkDnsConfiguration("example.com");

				expect(result.configured).toBe(false);
				expect(result.error).toContain("ESERVFAIL");
			});

			it("should return error message for A record failures without error code", async () => {
				const error = new Error("Unknown A record error");
				// Error without .code property
				mockResolve4.mockRejectedValue(error);

				const result = await checkDnsConfiguration("example.com");

				expect(result.configured).toBe(false);
				expect(result.recordType).toBeNull();
				expect(result.error).toContain("Unknown A record error");
			});
		});

		describe("edge cases", () => {
			it("should treat two-part domain as apex", async () => {
				mockResolve4.mockResolvedValue(["76.76.21.21"]);

				await checkDnsConfiguration("example.com");

				expect(mockResolve4).toHaveBeenCalledWith("example.com");
				expect(mockResolveCname).not.toHaveBeenCalled();
			});

			it("should treat three-part domain as subdomain", async () => {
				mockResolveCname.mockResolvedValue(["cname.vercel-dns.com"]);

				await checkDnsConfiguration("docs.example.com");

				expect(mockResolveCname).toHaveBeenCalledWith("docs.example.com");
			});

			it("should treat four-part domain as subdomain", async () => {
				mockResolveCname.mockResolvedValue(["cname.vercel-dns.com"]);

				await checkDnsConfiguration("api.docs.example.com");

				expect(mockResolveCname).toHaveBeenCalledWith("api.docs.example.com");
			});

			it("should handle empty CNAME response array", async () => {
				mockResolveCname.mockResolvedValue([]);

				const result = await checkDnsConfiguration("docs.example.com");

				expect(result.configured).toBe(false);
				expect(result.actualValue).toBeNull();
			});

			it("should handle empty A record response array", async () => {
				mockResolve4.mockResolvedValue([]);

				const result = await checkDnsConfiguration("example.com");

				expect(result.configured).toBe(false);
				expect(result.actualValue).toBeNull();
			});
		});
	});
});
