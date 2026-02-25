/**
 * Pure utility functions for feature flag business logic.
 * Extracted from FeatureFlagsForm for testability.
 */

import type { PricingTier, TenantFeatureFlags } from "../../../../lib/types/Tenant";

/** Ordered list of pricing tiers from lowest to highest */
export const TIER_OPTIONS: Array<PricingTier> = ["free", "pro", "enterprise"];

/** Human-readable descriptions for each pricing tier */
export const TIER_DESCRIPTIONS: Record<PricingTier, string> = {
	free: "Basic features with path-based URLs (jolli.ai/tenant/...)",
	pro: "Enhanced features with subdomain access",
	enterprise: "Full feature set with custom domains and dedicated support",
};

/** Definition of each feature flag with its display info and required tier */
export interface FeatureDefinition {
	key: keyof Omit<TenantFeatureFlags, "tier">;
	label: string;
	description: string;
	requiredTier: PricingTier;
}

export const FEATURE_DEFINITIONS: ReadonlyArray<FeatureDefinition> = [
	{
		key: "subdomain",
		label: "Subdomain Access",
		description: "Enable subdomain URLs (e.g., tenant.jolli.ai/dashboard). Available for Pro and Enterprise tiers.",
		requiredTier: "pro",
	},
	{
		key: "customDomain",
		label: "Custom Domain",
		description: "Enable custom domain configuration (e.g., docs.acme.com). Enterprise tier only.",
		requiredTier: "enterprise",
	},
	{
		key: "advancedAnalytics",
		label: "Advanced Analytics",
		description: "Access to advanced analytics and reporting features.",
		requiredTier: "pro",
	},
	{
		key: "sso",
		label: "SSO Integration",
		description: "Single Sign-On integration with SAML and OAuth providers.",
		requiredTier: "enterprise",
	},
	{
		key: "dedicatedSupport",
		label: "Dedicated Support",
		description: "Priority support with dedicated account manager.",
		requiredTier: "enterprise",
	},
];

/**
 * Get the numeric index of a tier in the TIER_OPTIONS array.
 * Higher index = higher tier level.
 */
export function getTierLevel(tier: PricingTier): number {
	return TIER_OPTIONS.indexOf(tier);
}

/**
 * Check if a feature is available for a given pricing tier.
 * A feature is available when the tier level meets or exceeds the feature's required tier.
 */
export function isFeatureAvailableForTier(
	featureKey: keyof Omit<TenantFeatureFlags, "tier">,
	tier: PricingTier,
): boolean {
	const def = FEATURE_DEFINITIONS.find(d => d.key === featureKey);
	if (!def) {
		return false;
	}
	return getTierLevel(tier) >= getTierLevel(def.requiredTier);
}

/**
 * Build the default/initial feature flags state from raw feature flags.
 * Fills in missing values with safe defaults.
 */
export function getDefaultFeatureFlags(featureFlags: TenantFeatureFlags): TenantFeatureFlags {
	return {
		tier: featureFlags.tier ?? "free",
		subdomain: featureFlags.subdomain ?? false,
		customDomain: featureFlags.customDomain ?? false,
		advancedAnalytics: featureFlags.advancedAnalytics ?? false,
		sso: featureFlags.sso ?? false,
		dedicatedSupport: featureFlags.dedicatedSupport ?? false,
	};
}

/**
 * Compute new feature flags after a tier change.
 * When tier is downgraded, features that require higher tiers are automatically disabled.
 * When tier is upgraded, existing enabled features remain enabled (new features stay off).
 */
export function computeFeatureFlagsForTier(currentFlags: TenantFeatureFlags, newTier: PricingTier): TenantFeatureFlags {
	const newValues: TenantFeatureFlags = {
		...currentFlags,
		tier: newTier,
	};

	const newTierLevel = getTierLevel(newTier);

	for (const def of FEATURE_DEFINITIONS) {
		const requiredTierLevel = getTierLevel(def.requiredTier);
		if (newTierLevel < requiredTierLevel) {
			newValues[def.key] = false;
		}
	}

	return newValues;
}
