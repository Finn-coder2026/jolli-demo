import type { SiteClient } from "./SiteClient";

export function mockSiteClient(partial?: Partial<SiteClient>): SiteClient {
	return {
		listSites: async () => [],
		getSite: () => Promise.resolve(undefined),
		createSite: () => {
			throw new Error("Not implemented");
		},
		regenerateSite: () => {
			throw new Error("Not implemented");
		},
		deleteSite: async () => {
			// No-op for mock
		},
		updateSiteArticles: () => {
			throw new Error("Not implemented");
		},
		cancelBuild: () => {
			throw new Error("Not implemented");
		},
		getChangedConfigFiles: async () => [],
		formatCode: async () => ({ formatted: "" }),
		listFolderContents: async () => ({ files: [] }),
		checkSubdomainAvailability: async () => ({ available: true }),
		addCustomDomain: () => {
			throw new Error("Not implemented");
		},
		removeCustomDomain: async () => {
			// No-op for mock
		},
		getCustomDomainStatus: () => {
			throw new Error("Not implemented");
		},
		verifyCustomDomain: () => {
			throw new Error("Not implemented");
		},
		refreshDomainStatuses: async () => ({ domains: [] }),
		updateJwtAuthConfig: () => {
			throw new Error("Not implemented");
		},
		updateBranding: () => {
			throw new Error("Not implemented");
		},
		updateFolderStructure: () => {
			throw new Error("Not implemented");
		},
		getRepositoryTree: async () => ({
			sha: "mock-sha",
			tree: [],
			truncated: false,
		}),
		getFileContent: async () => ({
			name: "mock-file",
			path: "mock-path",
			sha: "mock-sha",
			type: "file",
			content: "",
			encoding: "base64",
		}),
		syncTree: async () => ({
			success: true,
			commitSha: "mock-commit-sha",
		}),
		getSitesForArticle: async () => [],
		...partial,
	};
}
