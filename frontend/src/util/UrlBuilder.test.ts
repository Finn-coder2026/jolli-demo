import { createUrlBuilder, UrlBuilder, type UrlBuilderConfig } from "./UrlBuilder";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const originalLocation = window.location;

beforeEach(() => {
	Object.defineProperty(window, "location", {
		writable: true,
		value: {
			...originalLocation,
			hostname: "jolli.ai",
			pathname: "/",
			port: "",
			protocol: "https:",
			origin: "https://jolli.ai",
		},
	});
});

afterEach(() => {
	Object.defineProperty(window, "location", { writable: true, value: originalLocation });
});

function buildConfig(overrides: Partial<UrlBuilderConfig> = {}): UrlBuilderConfig {
	return {
		urlMode: "path",
		tenantSlug: "acme",
		baseDomain: "jolli.ai",
		isCustomDomain: false,
		isSubdomain: false,
		...overrides,
	};
}

describe("UrlBuilder", () => {
	describe("buildUrl", () => {
		it("prefixes tenant slug in path mode with a tenant slug", () => {
			const builder = new UrlBuilder(buildConfig({ urlMode: "path", tenantSlug: "acme" }));
			expect(builder.buildUrl("/dashboard")).toBe("/acme/dashboard");
		});

		it("normalizes paths without a leading slash in path mode", () => {
			const builder = new UrlBuilder(buildConfig({ urlMode: "path", tenantSlug: "acme" }));
			expect(builder.buildUrl("settings")).toBe("/acme/settings");
		});

		it("returns normalized path when urlMode is path but tenantSlug is null", () => {
			const builder = new UrlBuilder(buildConfig({ urlMode: "path", tenantSlug: null }));
			expect(builder.buildUrl("/dashboard")).toBe("/dashboard");
		});

		it("returns normalized path for subdomain mode", () => {
			const builder = new UrlBuilder(buildConfig({ urlMode: "subdomain", tenantSlug: "acme" }));
			expect(builder.buildUrl("/dashboard")).toBe("/dashboard");
		});

		it("returns normalized path for custom mode", () => {
			const builder = new UrlBuilder(buildConfig({ urlMode: "custom", tenantSlug: null }));
			expect(builder.buildUrl("/docs")).toBe("/docs");
		});

		it("normalizes paths without a leading slash in non-path modes", () => {
			const builder = new UrlBuilder(buildConfig({ urlMode: "subdomain", tenantSlug: "acme" }));
			expect(builder.buildUrl("articles")).toBe("/articles");
		});
	});

	describe("buildAbsoluteUrl", () => {
		it("combines origin and relative path for path mode", () => {
			const builder = new UrlBuilder(
				buildConfig({ urlMode: "path", tenantSlug: "acme", baseDomain: "jolli.ai" }),
			);
			expect(builder.buildAbsoluteUrl("/dashboard")).toBe("https://jolli.ai/acme/dashboard");
		});

		it("combines origin and relative path for subdomain mode", () => {
			const builder = new UrlBuilder(
				buildConfig({ urlMode: "subdomain", tenantSlug: "acme", baseDomain: "jolli.ai", isSubdomain: true }),
			);
			expect(builder.buildAbsoluteUrl("/dashboard")).toBe("https://acme.jolli.ai/dashboard");
		});

		it("combines origin and relative path for custom domain mode", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "docs.acme.com",
					protocol: "https:",
					port: "",
					origin: "https://docs.acme.com",
				},
			});
			const builder = new UrlBuilder(
				buildConfig({ urlMode: "custom", tenantSlug: null, baseDomain: null, isCustomDomain: true }),
			);
			expect(builder.buildAbsoluteUrl("/articles")).toBe("https://docs.acme.com/articles");
		});
	});

	describe("getOrigin (tested via buildAbsoluteUrl)", () => {
		it("returns protocol + hostname for custom domain", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "docs.acme.com",
					protocol: "https:",
					port: "",
					origin: "https://docs.acme.com",
				},
			});
			const builder = new UrlBuilder(buildConfig({ urlMode: "custom", tenantSlug: null, isCustomDomain: true }));
			// getOrigin returns "https://docs.acme.com"
			expect(builder.buildAbsoluteUrl("/")).toBe("https://docs.acme.com/");
		});

		it("returns subdomain origin with non-standard port", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "acme.jolli.ai",
					protocol: "https:",
					port: "8034",
					origin: "https://acme.jolli.ai:8034",
				},
			});
			const builder = new UrlBuilder(
				buildConfig({ urlMode: "subdomain", isSubdomain: true, tenantSlug: "acme", baseDomain: "jolli.ai" }),
			);
			expect(builder.buildAbsoluteUrl("/dashboard")).toBe("https://acme.jolli.ai:8034/dashboard");
		});

		it("returns subdomain origin without port suffix for port 80", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "acme.jolli.ai",
					protocol: "http:",
					port: "80",
					origin: "http://acme.jolli.ai",
				},
			});
			const builder = new UrlBuilder(
				buildConfig({ urlMode: "subdomain", isSubdomain: true, tenantSlug: "acme", baseDomain: "jolli.ai" }),
			);
			expect(builder.buildAbsoluteUrl("/dashboard")).toBe("http://acme.jolli.ai/dashboard");
		});

		it("returns subdomain origin without port suffix for port 443", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "acme.jolli.ai",
					protocol: "https:",
					port: "443",
					origin: "https://acme.jolli.ai",
				},
			});
			const builder = new UrlBuilder(
				buildConfig({ urlMode: "subdomain", isSubdomain: true, tenantSlug: "acme", baseDomain: "jolli.ai" }),
			);
			expect(builder.buildAbsoluteUrl("/dashboard")).toBe("https://acme.jolli.ai/dashboard");
		});

		it("returns subdomain origin without port suffix for empty port", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "acme.jolli.ai",
					protocol: "https:",
					port: "",
					origin: "https://acme.jolli.ai",
				},
			});
			const builder = new UrlBuilder(
				buildConfig({ urlMode: "subdomain", isSubdomain: true, tenantSlug: "acme", baseDomain: "jolli.ai" }),
			);
			expect(builder.buildAbsoluteUrl("/dashboard")).toBe("https://acme.jolli.ai/dashboard");
		});

		it("falls through subdomain branch when tenantSlug is null", () => {
			const builder = new UrlBuilder(
				buildConfig({ isSubdomain: true, tenantSlug: null, baseDomain: "jolli.ai" }),
			);
			// isSubdomain is true but tenantSlug is null, so it falls to baseDomain branch
			expect(builder.buildAbsoluteUrl("/dashboard")).toBe("https://jolli.ai/dashboard");
		});

		it("falls through subdomain branch when baseDomain is null", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "localhost",
					protocol: "http:",
					port: "",
					origin: "http://localhost",
				},
			});
			const builder = new UrlBuilder(
				buildConfig({ urlMode: "subdomain", isSubdomain: true, tenantSlug: "acme", baseDomain: null }),
			);
			// isSubdomain true but baseDomain is null, falls to fallback origin
			// buildUrl in subdomain mode doesn't add tenant prefix, so path stays as-is
			expect(builder.buildAbsoluteUrl("/dashboard")).toBe("http://localhost/dashboard");
		});

		it("returns path-based origin with baseDomain and non-standard port", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "jolli.ai",
					protocol: "https:",
					port: "8034",
					origin: "https://jolli.ai:8034",
				},
			});
			const builder = new UrlBuilder(
				buildConfig({ urlMode: "path", isSubdomain: false, tenantSlug: "acme", baseDomain: "jolli.ai" }),
			);
			expect(builder.buildAbsoluteUrl("/dashboard")).toBe("https://jolli.ai:8034/acme/dashboard");
		});

		it("returns path-based origin with baseDomain and standard port 80", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "jolli.ai",
					protocol: "http:",
					port: "80",
					origin: "http://jolli.ai",
				},
			});
			const builder = new UrlBuilder(
				buildConfig({ urlMode: "path", isSubdomain: false, tenantSlug: "acme", baseDomain: "jolli.ai" }),
			);
			expect(builder.buildAbsoluteUrl("/dashboard")).toBe("http://jolli.ai/acme/dashboard");
		});

		it("returns path-based origin with baseDomain and standard port 443", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "jolli.ai",
					protocol: "https:",
					port: "443",
					origin: "https://jolli.ai",
				},
			});
			const builder = new UrlBuilder(
				buildConfig({ urlMode: "path", isSubdomain: false, tenantSlug: "acme", baseDomain: "jolli.ai" }),
			);
			expect(builder.buildAbsoluteUrl("/dashboard")).toBe("https://jolli.ai/acme/dashboard");
		});

		it("returns path-based origin with baseDomain and empty port", () => {
			const builder = new UrlBuilder(
				buildConfig({ urlMode: "path", isSubdomain: false, tenantSlug: "acme", baseDomain: "jolli.ai" }),
			);
			expect(builder.buildAbsoluteUrl("/dashboard")).toBe("https://jolli.ai/acme/dashboard");
		});

		it("returns window.location.origin as fallback when baseDomain is null and not custom/subdomain", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "localhost",
					protocol: "http:",
					port: "3000",
					origin: "http://localhost:3000",
				},
			});
			const builder = new UrlBuilder(
				buildConfig({
					urlMode: "path",
					isSubdomain: false,
					isCustomDomain: false,
					tenantSlug: null,
					baseDomain: null,
				}),
			);
			expect(builder.buildAbsoluteUrl("/dashboard")).toBe("http://localhost:3000/dashboard");
		});
	});

	describe("buildTenantSwitchUrl", () => {
		it("uses baseDomain with default path", () => {
			const builder = new UrlBuilder(buildConfig({ baseDomain: "jolli.ai" }));
			expect(builder.buildTenantSwitchUrl("beta")).toBe("https://jolli.ai/beta/dashboard");
		});

		it("uses baseDomain with custom path", () => {
			const builder = new UrlBuilder(buildConfig({ baseDomain: "jolli.ai" }));
			expect(builder.buildTenantSwitchUrl("beta", "/settings")).toBe("https://jolli.ai/beta/settings");
		});

		it("normalizes path without leading slash with baseDomain", () => {
			const builder = new UrlBuilder(buildConfig({ baseDomain: "jolli.ai" }));
			expect(builder.buildTenantSwitchUrl("beta", "articles")).toBe("https://jolli.ai/beta/articles");
		});

		it("falls back to window.location.hostname when baseDomain is null", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "localhost",
					protocol: "http:",
					port: "",
					origin: "http://localhost",
				},
			});
			const builder = new UrlBuilder(buildConfig({ baseDomain: null }));
			expect(builder.buildTenantSwitchUrl("beta")).toBe("http://localhost/beta/dashboard");
		});

		it("falls back to window.location.hostname with custom path when baseDomain is null", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "localhost",
					protocol: "http:",
					port: "",
					origin: "http://localhost",
				},
			});
			const builder = new UrlBuilder(buildConfig({ baseDomain: null }));
			expect(builder.buildTenantSwitchUrl("beta", "/settings")).toBe("http://localhost/beta/settings");
		});

		it("normalizes path without leading slash in fallback mode", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "localhost",
					protocol: "http:",
					port: "",
					origin: "http://localhost",
				},
			});
			const builder = new UrlBuilder(buildConfig({ baseDomain: null }));
			expect(builder.buildTenantSwitchUrl("beta", "articles")).toBe("http://localhost/beta/articles");
		});

		it("includes non-standard port with baseDomain", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "jolli.ai",
					protocol: "https:",
					port: "8034",
					origin: "https://jolli.ai:8034",
				},
			});
			const builder = new UrlBuilder(buildConfig({ baseDomain: "jolli.ai" }));
			expect(builder.buildTenantSwitchUrl("beta")).toBe("https://jolli.ai:8034/beta/dashboard");
		});

		it("omits port suffix for standard port 80", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "jolli.ai",
					protocol: "http:",
					port: "80",
					origin: "http://jolli.ai",
				},
			});
			const builder = new UrlBuilder(buildConfig({ baseDomain: "jolli.ai" }));
			expect(builder.buildTenantSwitchUrl("beta")).toBe("http://jolli.ai/beta/dashboard");
		});

		it("omits port suffix for standard port 443", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "jolli.ai",
					protocol: "https:",
					port: "443",
					origin: "https://jolli.ai",
				},
			});
			const builder = new UrlBuilder(buildConfig({ baseDomain: "jolli.ai" }));
			expect(builder.buildTenantSwitchUrl("beta")).toBe("https://jolli.ai/beta/dashboard");
		});

		it("omits port suffix for empty port string", () => {
			const builder = new UrlBuilder(buildConfig({ baseDomain: "jolli.ai" }));
			expect(builder.buildTenantSwitchUrl("beta")).toBe("https://jolli.ai/beta/dashboard");
		});

		it("includes non-standard port in fallback mode", () => {
			Object.defineProperty(window, "location", {
				writable: true,
				value: {
					...originalLocation,
					hostname: "localhost",
					protocol: "http:",
					port: "3000",
					origin: "http://localhost:3000",
				},
			});
			const builder = new UrlBuilder(buildConfig({ baseDomain: null }));
			expect(builder.buildTenantSwitchUrl("beta")).toBe("http://localhost:3000/beta/dashboard");
		});
	});

	describe("createUrlBuilder", () => {
		it("returns a UrlBuilder instance", () => {
			const config = buildConfig();
			const builder = createUrlBuilder(config);
			expect(builder).toBeInstanceOf(UrlBuilder);
		});

		it("returned builder functions correctly", () => {
			const config = buildConfig({ urlMode: "path", tenantSlug: "acme" });
			const builder = createUrlBuilder(config);
			expect(builder.buildUrl("/dashboard")).toBe("/acme/dashboard");
		});
	});
});
