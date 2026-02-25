import type { TenantFeatureFlags } from "../../../../lib/types/Tenant";
import {
	computeFeatureFlagsForTier,
	FEATURE_DEFINITIONS,
	getDefaultFeatureFlags,
	getTierLevel,
	isFeatureAvailableForTier,
	TIER_DESCRIPTIONS,
	TIER_OPTIONS,
} from "./FeatureFlagsUtils";
import { describe, expect, it } from "vitest";

describe("FeatureFlagsUtils", () => {
	describe("TIER_OPTIONS", () => {
		it("should be ordered from lowest to highest tier", () => {
			expect(TIER_OPTIONS).toEqual(["free", "pro", "enterprise"]);
		});

		it("should have descriptions for every tier", () => {
			for (const tier of TIER_OPTIONS) {
				expect(TIER_DESCRIPTIONS[tier]).toBeDefined();
				expect(typeof TIER_DESCRIPTIONS[tier]).toBe("string");
			}
		});
	});

	describe("FEATURE_DEFINITIONS", () => {
		it("should define all expected feature flags", () => {
			const keys = FEATURE_DEFINITIONS.map(d => d.key);
			expect(keys).toContain("subdomain");
			expect(keys).toContain("customDomain");
			expect(keys).toContain("advancedAnalytics");
			expect(keys).toContain("sso");
			expect(keys).toContain("dedicatedSupport");
		});

		it("should have valid requiredTier values", () => {
			for (const def of FEATURE_DEFINITIONS) {
				expect(TIER_OPTIONS).toContain(def.requiredTier);
			}
		});

		it("should have labels and descriptions for each feature", () => {
			for (const def of FEATURE_DEFINITIONS) {
				expect(def.label.length).toBeGreaterThan(0);
				expect(def.description.length).toBeGreaterThan(0);
			}
		});
	});

	describe("getTierLevel", () => {
		it("should return 0 for free", () => {
			expect(getTierLevel("free")).toBe(0);
		});

		it("should return 1 for pro", () => {
			expect(getTierLevel("pro")).toBe(1);
		});

		it("should return 2 for enterprise", () => {
			expect(getTierLevel("enterprise")).toBe(2);
		});
	});

	describe("isFeatureAvailableForTier", () => {
		it("should return false for pro features on free tier", () => {
			expect(isFeatureAvailableForTier("subdomain", "free")).toBe(false);
			expect(isFeatureAvailableForTier("advancedAnalytics", "free")).toBe(false);
		});

		it("should return true for pro features on pro tier", () => {
			expect(isFeatureAvailableForTier("subdomain", "pro")).toBe(true);
			expect(isFeatureAvailableForTier("advancedAnalytics", "pro")).toBe(true);
		});

		it("should return true for pro features on enterprise tier", () => {
			expect(isFeatureAvailableForTier("subdomain", "enterprise")).toBe(true);
			expect(isFeatureAvailableForTier("advancedAnalytics", "enterprise")).toBe(true);
		});

		it("should return false for enterprise features on free tier", () => {
			expect(isFeatureAvailableForTier("customDomain", "free")).toBe(false);
			expect(isFeatureAvailableForTier("sso", "free")).toBe(false);
			expect(isFeatureAvailableForTier("dedicatedSupport", "free")).toBe(false);
		});

		it("should return false for enterprise features on pro tier", () => {
			expect(isFeatureAvailableForTier("customDomain", "pro")).toBe(false);
			expect(isFeatureAvailableForTier("sso", "pro")).toBe(false);
			expect(isFeatureAvailableForTier("dedicatedSupport", "pro")).toBe(false);
		});

		it("should return true for enterprise features on enterprise tier", () => {
			expect(isFeatureAvailableForTier("customDomain", "enterprise")).toBe(true);
			expect(isFeatureAvailableForTier("sso", "enterprise")).toBe(true);
			expect(isFeatureAvailableForTier("dedicatedSupport", "enterprise")).toBe(true);
		});

		it("should return false for unknown feature keys", () => {
			// Using a type assertion since we're testing an invalid key
			expect(
				isFeatureAvailableForTier("nonexistent" as keyof Omit<TenantFeatureFlags, "tier">, "enterprise"),
			).toBe(false);
		});
	});

	describe("getDefaultFeatureFlags", () => {
		it("should fill in defaults for empty feature flags", () => {
			const result = getDefaultFeatureFlags({});
			expect(result).toEqual({
				tier: "free",
				subdomain: false,
				customDomain: false,
				advancedAnalytics: false,
				sso: false,
				dedicatedSupport: false,
			});
		});

		it("should preserve existing values", () => {
			const input: TenantFeatureFlags = {
				tier: "enterprise",
				subdomain: true,
				customDomain: true,
				advancedAnalytics: true,
				sso: true,
				dedicatedSupport: true,
			};
			const result = getDefaultFeatureFlags(input);
			expect(result).toEqual(input);
		});

		it("should fill missing fields while preserving set fields", () => {
			const result = getDefaultFeatureFlags({
				tier: "pro",
				subdomain: true,
			});
			expect(result).toEqual({
				tier: "pro",
				subdomain: true,
				customDomain: false,
				advancedAnalytics: false,
				sso: false,
				dedicatedSupport: false,
			});
		});

		it("should default undefined tier to free", () => {
			const result = getDefaultFeatureFlags({ tier: undefined });
			expect(result.tier).toBe("free");
		});
	});

	describe("computeFeatureFlagsForTier", () => {
		it("should disable pro features when downgrading from pro to free", () => {
			const current: TenantFeatureFlags = {
				tier: "pro",
				subdomain: true,
				advancedAnalytics: true,
				customDomain: false,
				sso: false,
				dedicatedSupport: false,
			};

			const result = computeFeatureFlagsForTier(current, "free");

			expect(result.tier).toBe("free");
			expect(result.subdomain).toBe(false);
			expect(result.advancedAnalytics).toBe(false);
		});

		it("should disable all features when downgrading from enterprise to free", () => {
			const current: TenantFeatureFlags = {
				tier: "enterprise",
				subdomain: true,
				customDomain: true,
				advancedAnalytics: true,
				sso: true,
				dedicatedSupport: true,
			};

			const result = computeFeatureFlagsForTier(current, "free");

			expect(result.tier).toBe("free");
			expect(result.subdomain).toBe(false);
			expect(result.customDomain).toBe(false);
			expect(result.advancedAnalytics).toBe(false);
			expect(result.sso).toBe(false);
			expect(result.dedicatedSupport).toBe(false);
		});

		it("should disable enterprise features when downgrading from enterprise to pro", () => {
			const current: TenantFeatureFlags = {
				tier: "enterprise",
				subdomain: true,
				customDomain: true,
				advancedAnalytics: true,
				sso: true,
				dedicatedSupport: true,
			};

			const result = computeFeatureFlagsForTier(current, "pro");

			expect(result.tier).toBe("pro");
			// Pro features should remain enabled
			expect(result.subdomain).toBe(true);
			expect(result.advancedAnalytics).toBe(true);
			// Enterprise features should be disabled
			expect(result.customDomain).toBe(false);
			expect(result.sso).toBe(false);
			expect(result.dedicatedSupport).toBe(false);
		});

		it("should preserve already-disabled features when upgrading", () => {
			const current: TenantFeatureFlags = {
				tier: "free",
				subdomain: false,
				customDomain: false,
				advancedAnalytics: false,
				sso: false,
				dedicatedSupport: false,
			};

			const result = computeFeatureFlagsForTier(current, "enterprise");

			expect(result.tier).toBe("enterprise");
			// Features should remain disabled (upgrade doesn't auto-enable)
			expect(result.subdomain).toBe(false);
			expect(result.customDomain).toBe(false);
			expect(result.advancedAnalytics).toBe(false);
			expect(result.sso).toBe(false);
			expect(result.dedicatedSupport).toBe(false);
		});

		it("should not change anything when staying on the same tier", () => {
			const current: TenantFeatureFlags = {
				tier: "pro",
				subdomain: true,
				customDomain: false,
				advancedAnalytics: true,
				sso: false,
				dedicatedSupport: false,
			};

			const result = computeFeatureFlagsForTier(current, "pro");

			expect(result).toEqual(current);
		});

		it("should handle upgrading with some features already enabled", () => {
			const current: TenantFeatureFlags = {
				tier: "pro",
				subdomain: true,
				advancedAnalytics: false,
				customDomain: false,
				sso: false,
				dedicatedSupport: false,
			};

			const result = computeFeatureFlagsForTier(current, "enterprise");

			expect(result.tier).toBe("enterprise");
			// Existing enabled feature stays enabled
			expect(result.subdomain).toBe(true);
			// Existing disabled features stay disabled (user must opt-in)
			expect(result.advancedAnalytics).toBe(false);
			expect(result.customDomain).toBe(false);
		});
	});
});
