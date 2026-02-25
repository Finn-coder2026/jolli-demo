import type { ChangedArticle, SiteMetadata, SiteWithUpdate } from "jolli-common";

/** Default site metadata for tests. */
export const defaultSiteMetadata: SiteMetadata = {
	githubRepo: "owner/repo",
	githubUrl: "https://github.com/owner/repo",
	framework: "nextra",
	articleCount: 5,
	jolliSiteDomain: "test-site.jolli.site",
};

/** Creates a mock SiteWithUpdate with sensible defaults and optional overrides. */
export function createMockSite(
	overrides: Omit<Partial<SiteWithUpdate>, "metadata"> & { metadata?: Partial<SiteMetadata> | null } = {},
): SiteWithUpdate {
	const { metadata: metadataOverrides, ...rest } = overrides;
	return {
		id: 1,
		name: "test-site",
		displayName: "Test Site",
		status: "active",
		visibility: "external",
		framework: "nextra",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-02T00:00:00Z",
		lastGeneratedAt: "2024-01-03T00:00:00Z",
		needsUpdate: false,
		metadata: metadataOverrides === null ? undefined : { ...defaultSiteMetadata, ...metadataOverrides },
		...rest,
	} as SiteWithUpdate;
}

/** Creates a mock ChangedArticle with sensible defaults. */
export function createMockChangedArticle(overrides: Partial<ChangedArticle> = {}): ChangedArticle {
	return {
		id: 1,
		title: "Test Article",
		jrn: "jrn:doc:test",
		updatedAt: "2024-01-01T00:00:00Z",
		contentType: "text/markdown",
		changeType: "updated",
		...overrides,
	} as ChangedArticle;
}
