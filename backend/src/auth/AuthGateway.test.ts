import * as Config from "../config/Config";
import { isAuthGateway, isMultiTenantAuthEnabled } from "./AuthGateway";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("AuthGateway", () => {
	describe("isAuthGateway", () => {
		it("should return true for auth gateway domain", () => {
			expect(isAuthGateway("auth.jolli.ai", "jolli.ai")).toBe(true);
		});

		it("should return true for auth gateway domain with port", () => {
			expect(isAuthGateway("auth.jolli.ai:443", "jolli.ai")).toBe(true);
		});

		it("should return false for tenant subdomain", () => {
			expect(isAuthGateway("acme.jolli.ai", "jolli.ai")).toBe(false);
		});

		it("should return false for base domain", () => {
			expect(isAuthGateway("jolli.ai", "jolli.ai")).toBe(false);
		});

		it("should return false for unrelated domain", () => {
			expect(isAuthGateway("example.com", "jolli.ai")).toBe(false);
		});
	});

	describe("isMultiTenantAuthEnabled", () => {
		beforeEach(() => {
			vi.restoreAllMocks();
		});

		it("should return true when USE_MULTI_TENANT_AUTH is enabled", () => {
			vi.spyOn(Config, "getConfig").mockReturnValue({
				USE_MULTI_TENANT_AUTH: true,
			} as ReturnType<typeof Config.getConfig>);

			expect(isMultiTenantAuthEnabled()).toBe(true);
		});

		it("should return false when USE_MULTI_TENANT_AUTH is disabled", () => {
			vi.spyOn(Config, "getConfig").mockReturnValue({
				USE_MULTI_TENANT_AUTH: false,
			} as ReturnType<typeof Config.getConfig>);

			expect(isMultiTenantAuthEnabled()).toBe(false);
		});
	});
});
