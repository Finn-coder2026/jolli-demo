import { shouldBypassTenantMiddleware } from "./AppFactory";
import { describe, expect, it } from "vitest";

describe("shouldBypassTenantMiddleware", () => {
	const baseDomain = "jolli.dev";

	describe("status endpoints", () => {
		it("bypasses /status", () => {
			expect(shouldBypassTenantMiddleware("/status", undefined, undefined, "production")).toBe(true);
		});

		it("bypasses /status/check", () => {
			expect(shouldBypassTenantMiddleware("/status/check", undefined, undefined, "production")).toBe(true);
		});

		it("bypasses /status/health", () => {
			expect(shouldBypassTenantMiddleware("/status/health", undefined, undefined, "production")).toBe(true);
		});

		it("bypasses status endpoints regardless of hostname or baseDomain", () => {
			expect(shouldBypassTenantMiddleware("/status", "tenant.jolli.dev", baseDomain, "production")).toBe(true);
			expect(shouldBypassTenantMiddleware("/status/health", undefined, undefined, "development")).toBe(true);
		});
	});

	describe("cron endpoints", () => {
		it("bypasses /cron/heartbeat", () => {
			expect(shouldBypassTenantMiddleware("/cron/heartbeat", undefined, undefined, "production")).toBe(true);
		});

		it("bypasses any /cron/* path", () => {
			expect(shouldBypassTenantMiddleware("/cron/some-job", undefined, undefined, "production")).toBe(true);
			expect(shouldBypassTenantMiddleware("/cron/nested/path", undefined, undefined, "production")).toBe(true);
		});

		it("does not bypass /cron without trailing slash", () => {
			// /cron by itself is not a valid endpoint pattern
			expect(shouldBypassTenantMiddleware("/cron", undefined, undefined, "production")).toBe(false);
		});
	});

	describe("dev-tools redirect", () => {
		it("bypasses /dev-tools/redirect in non-production", () => {
			expect(shouldBypassTenantMiddleware("/dev-tools/redirect", undefined, undefined, "development")).toBe(true);
			expect(shouldBypassTenantMiddleware("/dev-tools/redirect", undefined, undefined, "test")).toBe(true);
		});

		it("does not bypass /dev-tools/redirect in production", () => {
			expect(shouldBypassTenantMiddleware("/dev-tools/redirect", undefined, undefined, "production")).toBe(false);
		});

		it("does not bypass other dev-tools paths", () => {
			expect(shouldBypassTenantMiddleware("/dev-tools/other", undefined, undefined, "development")).toBe(false);
		});
	});

	describe("api subdomain admin routes", () => {
		it("bypasses /admin/* on api.{baseDomain}", () => {
			expect(
				shouldBypassTenantMiddleware("/admin/bootstrap", `api.${baseDomain}`, baseDomain, "production"),
			).toBe(true);
			expect(
				shouldBypassTenantMiddleware("/admin/tenants/create", `api.${baseDomain}`, baseDomain, "production"),
			).toBe(true);
		});

		it("does not bypass /admin/* on other subdomains", () => {
			expect(
				shouldBypassTenantMiddleware("/admin/bootstrap", `tenant.${baseDomain}`, baseDomain, "production"),
			).toBe(false);
		});

		it("does not bypass non-admin paths on api subdomain", () => {
			expect(shouldBypassTenantMiddleware("/other", `api.${baseDomain}`, baseDomain, "production")).toBe(false);
		});
	});

	describe("auth paths (better-auth)", () => {
		it("bypasses all /auth/* paths regardless of subdomain when baseDomain is configured", () => {
			const authPaths = ["/auth/callback", "/auth/gateway-info", "/auth/login"];
			for (const path of authPaths) {
				// Auth paths bypass on any subdomain (when baseDomain is configured)
				expect(shouldBypassTenantMiddleware(path, `auth.${baseDomain}`, baseDomain, "production")).toBe(true);
				expect(shouldBypassTenantMiddleware(path, `tenant.${baseDomain}`, baseDomain, "production")).toBe(true);
			}
		});

		it("does not bypass /auth/* without baseDomain configured", () => {
			// Auth bypass requires baseDomain to be configured (checked before auth path check)
			expect(
				shouldBypassTenantMiddleware("/auth/callback", "somehost.example.com", undefined, "production"),
			).toBe(false);
		});
	});

	describe("invitation paths", () => {
		it("bypasses /invitation/* paths when baseDomain is configured", () => {
			const invitationPaths = [
				"/invitation/validate",
				"/invitation/accept-password",
				"/invitation/accept-social",
			];
			for (const path of invitationPaths) {
				expect(shouldBypassTenantMiddleware(path, `tenant.${baseDomain}`, baseDomain, "production")).toBe(true);
			}
		});

		it("bypasses /invitation/* paths in path-based mode (hostname = baseDomain)", () => {
			expect(shouldBypassTenantMiddleware("/invitation/validate", baseDomain, baseDomain, "production")).toBe(
				true,
			);
		});

		it("does not bypass /invitation/* without baseDomain configured", () => {
			expect(
				shouldBypassTenantMiddleware("/invitation/validate", "somehost.example.com", undefined, "production"),
			).toBe(false);
		});

		it("bypasses /owner-invitation/* paths when baseDomain is configured", () => {
			const ownerInvitationPaths = [
				"/owner-invitation/validate",
				"/owner-invitation/accept-password",
				"/owner-invitation/accept-social",
				"/owner-invitation/accept-existing-password",
				"/owner-invitation/decline",
			];
			for (const path of ownerInvitationPaths) {
				expect(shouldBypassTenantMiddleware(path, `tenant.${baseDomain}`, baseDomain, "production")).toBe(true);
			}
		});

		it("bypasses /owner-invitation/* in path-based mode (hostname = baseDomain)", () => {
			expect(
				shouldBypassTenantMiddleware("/owner-invitation/validate", baseDomain, baseDomain, "production"),
			).toBe(true);
		});
	});

	describe("connect subdomain callbacks and webhooks", () => {
		it("bypasses connect callbacks on connect.{baseDomain}", () => {
			expect(
				shouldBypassTenantMiddleware(
					"/connect/github/callback",
					`connect.${baseDomain}`,
					baseDomain,
					"production",
				),
			).toBe(true);
		});

		it("bypasses connect webhooks on connect.{baseDomain}", () => {
			expect(
				shouldBypassTenantMiddleware(
					"/connect/github/webhook",
					`connect.${baseDomain}`,
					baseDomain,
					"production",
				),
			).toBe(true);
		});

		it("does not bypass other connect paths", () => {
			expect(
				shouldBypassTenantMiddleware(
					"/connect/github/other",
					`connect.${baseDomain}`,
					baseDomain,
					"production",
				),
			).toBe(false);
		});

		it("does not bypass connect paths on other subdomains", () => {
			expect(
				shouldBypassTenantMiddleware(
					"/connect/github/callback",
					`tenant.${baseDomain}`,
					baseDomain,
					"production",
				),
			).toBe(false);
		});
	});

	describe("default behavior", () => {
		it("does not bypass arbitrary paths", () => {
			expect(shouldBypassTenantMiddleware("/api/docs", `tenant.${baseDomain}`, baseDomain, "production")).toBe(
				false,
			);
			expect(shouldBypassTenantMiddleware("/random", undefined, undefined, "production")).toBe(false);
		});

		it("does not bypass when baseDomain is not configured", () => {
			expect(shouldBypassTenantMiddleware("/admin/bootstrap", "api.jolli.dev", undefined, "production")).toBe(
				false,
			);
		});

		it("does not bypass when hostname is not provided", () => {
			expect(shouldBypassTenantMiddleware("/admin/bootstrap", undefined, baseDomain, "production")).toBe(false);
		});
	});
});
