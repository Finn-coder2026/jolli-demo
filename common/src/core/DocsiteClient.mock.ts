import type { Docsite } from "../types/Docsite";
import type { DocsiteClient } from "./DocsiteClient";

export function mockDocsiteClient(partial?: Partial<DocsiteClient>): DocsiteClient {
	return {
		listDocsites: async () => [],
		getDocsite: async (_id: number) => undefined as Docsite | undefined,
		createDocsite: async () => ({
			id: 1,
			name: "test-docs",
			displayName: "Test Documentation",
			userId: 1,
			visibility: "internal",
			status: "pending",
			metadata: undefined,
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T00:00:00Z",
		}),
		updateDocsite: async () => ({
			id: 1,
			name: "test-docs",
			displayName: "Test Documentation",
			userId: 1,
			visibility: "internal",
			status: "active",
			metadata: undefined,
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T00:00:00Z",
		}),
		deleteDocsite: async () => void 0,
		generateDocsite: async () => ({
			id: 1,
			name: "generated-docs",
			displayName: "Generated Documentation",
			userId: 1,
			visibility: "external",
			status: "building",
			metadata: {
				repos: [{ repo: "owner/repo", branch: "main", integrationId: 1 }],
				deployments: [
					{
						environment: "production",
						url: "https://generated-docs.vercel.app",
						deploymentId: "dpl_123",
						deployedAt: new Date().toISOString(),
						status: "ready",
					},
				],
				framework: "docusaurus-2",
				buildCommand: "npm run build",
				outputDirectory: "build",
				lastBuildAt: new Date().toISOString(),
				lastDeployedAt: new Date().toISOString(),
			},
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T00:00:00Z",
		}),
		generateDocsiteFromRepos: async () => ({
			id: 1,
			name: "generated-docs",
			displayName: "Generated Documentation",
			userId: 1,
			visibility: "external",
			status: "building",
			metadata: {
				repos: [{ repo: "owner/repo", branch: "main", integrationId: 1 }],
				deployments: [
					{
						environment: "production",
						url: "https://generated-docs.vercel.app",
						deploymentId: "dpl_123",
						deployedAt: new Date().toISOString(),
						status: "ready",
					},
				],
				framework: "docusaurus-2",
				buildCommand: "npm run build",
				outputDirectory: "build",
				lastBuildAt: new Date().toISOString(),
				lastDeployedAt: new Date().toISOString(),
			},
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T00:00:00Z",
		}),
		...partial,
	};
}
