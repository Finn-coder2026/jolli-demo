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
		updateRepositoryFile: async () => {
			// Mock implementation - no-op
		},
		checkUpdateStatus: async () => ({
			needsUpdate: false,
			lastGeneratedAt: undefined,
			latestArticleUpdate: new Date().toISOString(),
			changedArticles: [],
		}),
		toggleProtection: () => {
			throw new Error("Not implemented");
		},
		refreshProtectionStatus: () => {
			throw new Error("Not implemented");
		},
		publishSite: () => {
			throw new Error("Not implemented");
		},
		unpublishSite: () => {
			throw new Error("Not implemented");
		},
		deleteSite: async () => {
			// Mock implementation - no-op
		},
		updateSiteArticles: () => {
			throw new Error("Not implemented");
		},
		cancelBuild: () => {
			throw new Error("Not implemented");
		},
		getChangedConfigFiles: async () => [],
		formatCode: async () => ({ formatted: "" }),
		createFolder: async () => ({ success: true, path: "" }),
		deleteFolder: async () => ({ success: true }),
		renameFolder: async () => ({ success: true, newPath: "" }),
		moveFile: async () => ({ success: true, newPath: "" }),
		listFolderContents: async () => ({ files: [] }),
		checkSubdomainAvailability: async () => ({ available: true }),
		addCustomDomain: () => {
			throw new Error("Not implemented");
		},
		removeCustomDomain: async () => {
			// Mock implementation - no-op
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
		getRepositoryTree: async () => ({
			sha: "mock-sha",
			tree: [],
			truncated: false,
		}),
		getFileContent: async () => ({
			name: "mock-file",
			path: "mock-path",
			sha: "mock-sha",
			type: "file" as const,
			content: "",
			encoding: "base64" as const,
		}),
		...partial,
	};
}
