import type { SiteDao } from "./SiteDao";
import { vi } from "vitest";

export function mockSiteDao(partial?: Partial<SiteDao>): SiteDao {
	return {
		createSite: vi.fn(),
		getSite: vi.fn(),
		getSiteByName: vi.fn(),
		listSites: vi.fn(),
		listSitesByUser: vi.fn(),
		listSitesByStatus: vi.fn(),
		updateSite: vi.fn(),
		deleteSite: vi.fn(),
		deleteAllSites: vi.fn(),
		checkIfNeedsUpdate: vi.fn(),
		getChangedArticles: vi.fn(),
		getArticlesForSite: vi.fn(),
		getSiteBySubdomain: vi.fn(),
		getSiteByCustomDomain: vi.fn(),
		getSitesForArticle: vi.fn(),
		...partial,
	};
}
