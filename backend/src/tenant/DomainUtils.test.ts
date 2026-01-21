import { getHostname, getTenantOrigin, isSubdomainOf, resolveCustomDomain, resolveSubdomain } from "./DomainUtils";
import { describe, expect, it } from "vitest";

interface MockRequest {
	headers: Record<string, string | Array<string> | undefined>;
	hostname?: string;
}

function createMockRequest(headers: Record<string, string> = {}, hostname?: string): MockRequest {
	const request: MockRequest = { headers };
	if (hostname !== undefined) {
		request.hostname = hostname;
	}
	return request;
}

describe("DomainUtils", () => {
	describe("getHostname", () => {
		it("returns req.hostname when available", () => {
			const req = createMockRequest({}, "acme.jolli.app");
			expect(getHostname(req as never)).toBe("acme.jolli.app");
		});

		it("falls back to host header when hostname not available", () => {
			const req = createMockRequest({ host: "acme.jolli.app:3000" });
			expect(getHostname(req as never)).toBe("acme.jolli.app");
		});

		it("strips port from host header", () => {
			const req = createMockRequest({ host: "localhost:8034" });
			expect(getHostname(req as never)).toBe("localhost");
		});

		it("returns undefined when no hostname or host header", () => {
			const req = createMockRequest({});
			expect(getHostname(req as never)).toBeUndefined();
		});

		it("prefers hostname over host header", () => {
			const req = createMockRequest({ host: "from-header.com" }, "from-hostname.com");
			expect(getHostname(req as never)).toBe("from-hostname.com");
		});
	});

	describe("resolveCustomDomain", () => {
		it("returns undefined when baseDomain is not configured", () => {
			const req = createMockRequest({}, "custom.example.com");
			expect(resolveCustomDomain(req as never, undefined)).toBeUndefined();
		});

		it("returns undefined when host matches baseDomain exactly", () => {
			const req = createMockRequest({}, "jolli.app");
			expect(resolveCustomDomain(req as never, "jolli.app")).toBeUndefined();
		});

		it("returns undefined when host is a subdomain of baseDomain", () => {
			const req = createMockRequest({}, "acme.jolli.app");
			expect(resolveCustomDomain(req as never, "jolli.app")).toBeUndefined();
		});

		it("returns undefined when host is a nested subdomain of baseDomain", () => {
			const req = createMockRequest({}, "engineering.acme.jolli.app");
			expect(resolveCustomDomain(req as never, "jolli.app")).toBeUndefined();
		});

		it("returns custom domain when host does not match baseDomain pattern", () => {
			const req = createMockRequest({}, "docs.acme.com");
			const result = resolveCustomDomain(req as never, "jolli.app");
			expect(result).toEqual({ domain: "docs.acme.com" });
		});

		it("lowercases custom domain", () => {
			const req = createMockRequest({}, "DOCS.ACME.COM");
			const result = resolveCustomDomain(req as never, "jolli.app");
			expect(result).toEqual({ domain: "docs.acme.com" });
		});

		it("returns undefined when no host available", () => {
			const req = createMockRequest({});
			expect(resolveCustomDomain(req as never, "jolli.app")).toBeUndefined();
		});

		it("uses host header when hostname not available", () => {
			const req = createMockRequest({ host: "docs.acme.com:3000" });
			const result = resolveCustomDomain(req as never, "jolli.app");
			expect(result).toEqual({ domain: "docs.acme.com" });
		});
	});

	describe("resolveSubdomain", () => {
		it("returns undefined when baseDomain is not configured", () => {
			const req = createMockRequest({}, "acme.jolli.app");
			expect(resolveSubdomain(req as never, undefined)).toBeUndefined();
		});

		it("returns undefined when no host available", () => {
			const req = createMockRequest({});
			expect(resolveSubdomain(req as never, "jolli.app")).toBeUndefined();
		});

		it("returns 'jolli' tenant for bare baseDomain", () => {
			const req = createMockRequest({}, "jolli.app");
			const result = resolveSubdomain(req as never, "jolli.app");
			expect(result).toEqual({ tenantSlug: "jolli", orgSlug: undefined });
		});

		it("extracts tenant from single-level subdomain", () => {
			const req = createMockRequest({}, "acme.jolli.app");
			const result = resolveSubdomain(req as never, "jolli.app");
			expect(result).toEqual({ tenantSlug: "acme", orgSlug: undefined });
		});

		it("extracts tenant and org from two-level subdomain", () => {
			const req = createMockRequest({}, "engineering.acme.jolli.app");
			const result = resolveSubdomain(req as never, "jolli.app");
			expect(result).toEqual({ tenantSlug: "acme", orgSlug: "engineering" });
		});

		it("handles deeply nested subdomains (uses last two parts)", () => {
			const req = createMockRequest({}, "a.b.c.jolli.app");
			const result = resolveSubdomain(req as never, "jolli.app");
			expect(result).toEqual({ tenantSlug: "c", orgSlug: "b" });
		});

		it("lowercases tenant and org slugs", () => {
			const req = createMockRequest({}, "ENGINEERING.ACME.jolli.app");
			const result = resolveSubdomain(req as never, "jolli.app");
			expect(result).toEqual({ tenantSlug: "acme", orgSlug: "engineering" });
		});

		it("returns undefined when host is not a subdomain of baseDomain", () => {
			const req = createMockRequest({}, "docs.acme.com");
			expect(resolveSubdomain(req as never, "jolli.app")).toBeUndefined();
		});

		it("uses host header when hostname not available", () => {
			const req = createMockRequest({ host: "acme.jolli.app:3000" });
			const result = resolveSubdomain(req as never, "jolli.app");
			expect(result).toEqual({ tenantSlug: "acme", orgSlug: undefined });
		});

		it("handles case-insensitive baseDomain matching", () => {
			const req = createMockRequest({}, "acme.JOLLI.APP");
			const result = resolveSubdomain(req as never, "jolli.app");
			expect(result).toEqual({ tenantSlug: "acme", orgSlug: undefined });
		});
	});

	describe("isSubdomainOf", () => {
		it("returns true when hostname equals baseDomain", () => {
			expect(isSubdomainOf("jolli.app", "jolli.app")).toBe(true);
		});

		it("returns true when hostname is a subdomain of baseDomain", () => {
			expect(isSubdomainOf("acme.jolli.app", "jolli.app")).toBe(true);
		});

		it("returns true when hostname is a nested subdomain", () => {
			expect(isSubdomainOf("engineering.acme.jolli.app", "jolli.app")).toBe(true);
		});

		it("returns false when hostname does not match baseDomain", () => {
			expect(isSubdomainOf("example.com", "jolli.app")).toBe(false);
		});

		it("returns false when baseDomain is a suffix but not a subdomain", () => {
			// "fakejolli.app" should not match "jolli.app"
			expect(isSubdomainOf("fakejolli.app", "jolli.app")).toBe(false);
		});

		it("handles admin subdomain correctly", () => {
			expect(isSubdomainOf("admin.jolli.app", "jolli.app")).toBe(true);
		});
	});

	describe("getTenantOrigin", () => {
		it("uses primary domain with HTTPS when available", () => {
			const result = getTenantOrigin({
				primaryDomain: "docs.acme.com",
				tenantSlug: "acme",
				baseDomain: "jolli.app",
				useHttps: true,
				port: "8034",
				fallbackOrigin: "http://localhost:8034",
			});
			expect(result).toBe("https://docs.acme.com");
		});

		it("uses primary domain even when useHttps is false", () => {
			const result = getTenantOrigin({
				primaryDomain: "docs.acme.com",
				tenantSlug: "acme",
				baseDomain: "jolli.app",
				useHttps: false,
				port: "8034",
				fallbackOrigin: "http://localhost:8034",
			});
			expect(result).toBe("https://docs.acme.com");
		});

		it("constructs HTTPS subdomain URL when useHttps is true", () => {
			const result = getTenantOrigin({
				primaryDomain: null,
				tenantSlug: "acme",
				baseDomain: "jolli.app",
				useHttps: true,
				port: "8034",
				fallbackOrigin: "http://localhost:8034",
			});
			expect(result).toBe("https://acme.jolli.app");
		});

		it("constructs HTTP subdomain URL with port when useHttps is false", () => {
			const result = getTenantOrigin({
				primaryDomain: null,
				tenantSlug: "acme",
				baseDomain: "jolli.app",
				useHttps: false,
				port: "8034",
				fallbackOrigin: "http://localhost:8034",
			});
			expect(result).toBe("http://acme.jolli.app:8034");
		});

		it("omits port when undefined and useHttps is false", () => {
			const result = getTenantOrigin({
				primaryDomain: null,
				tenantSlug: "acme",
				baseDomain: "jolli.app",
				useHttps: false,
				port: undefined,
				fallbackOrigin: "http://localhost:8034",
			});
			expect(result).toBe("http://acme.jolli.app");
		});

		it("falls back to fallbackOrigin when no baseDomain", () => {
			const result = getTenantOrigin({
				primaryDomain: null,
				tenantSlug: "acme",
				baseDomain: undefined,
				useHttps: true,
				port: "8034",
				fallbackOrigin: "http://localhost:8034",
			});
			expect(result).toBe("http://localhost:8034");
		});

		it("falls back to fallbackOrigin when baseDomain is empty", () => {
			const result = getTenantOrigin({
				primaryDomain: null,
				tenantSlug: "acme",
				baseDomain: "",
				useHttps: true,
				port: "8034",
				fallbackOrigin: "http://localhost:8034",
			});
			expect(result).toBe("http://localhost:8034");
		});
	});
});
