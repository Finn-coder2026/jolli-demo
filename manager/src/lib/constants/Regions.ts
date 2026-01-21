/**
 * Provider regions (used for both connection_string and neon providers).
 * Region slugs are stored WITHOUT the "aws-" prefix. For Neon API calls, prepend "aws-".
 */
export const PROVIDER_REGIONS = [
	{ slug: "us-east-1", name: "US East (N. Virginia)" },
	{ slug: "us-east-2", name: "US East (Ohio)" },
	{ slug: "us-west-2", name: "US West (Oregon)" },
	{ slug: "eu-central-1", name: "EU (Frankfurt)" },
	{ slug: "ap-southeast-1", name: "Asia Pacific (Singapore)" },
	{ slug: "ap-southeast-2", name: "Asia Pacific (Sydney)" },
] as const;

export type RegionSlug = (typeof PROVIDER_REGIONS)[number]["slug"];

/** Default region for new providers and migration of existing providers */
export const DEFAULT_REGION: RegionSlug = "us-west-2";

/** Check if a string is a valid region slug */
export function isValidRegion(region: string): region is RegionSlug {
	return PROVIDER_REGIONS.some(r => r.slug === region);
}

/** Get region display name from slug */
export function getRegionName(slug: string): string {
	const region = PROVIDER_REGIONS.find(r => r.slug === slug);
	return region?.name ?? slug;
}

/** Convert region slug to Neon API region ID (adds "aws-" prefix) */
export function toNeonRegionId(slug: string): string {
	return `aws-${slug}`;
}

/** Convert Neon API region ID to region slug (removes "aws-" prefix) */
export function fromNeonRegionId(neonRegionId: string): RegionSlug {
	return neonRegionId.replace(/^aws-/, "") as RegionSlug;
}
