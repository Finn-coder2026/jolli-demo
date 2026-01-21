import type { Client } from "jolli-common";
import { vi } from "vitest";

export function mockClient(partial?: Partial<Client>): Client {
	return {
		login: vi.fn().mockResolvedValue({ id: 1, email: "test@example.com" }),
		logout: vi.fn().mockResolvedValue(undefined),
		status: vi.fn().mockResolvedValue("ok"),
		visit: vi.fn().mockResolvedValue(undefined),
		sync: vi.fn().mockResolvedValue(undefined),
		auth: vi.fn().mockReturnValue({
			register: vi.fn().mockResolvedValue({ id: 1, email: "test@example.com" }),
			confirmEmail: vi.fn().mockResolvedValue(undefined),
			getUserInfo: vi.fn().mockResolvedValue({ id: 1, email: "test@example.com" }),
		}),
		chat: vi.fn().mockReturnValue({
			sendMessage: vi.fn(),
		}),
		convos: vi.fn().mockReturnValue({
			listConvos: vi.fn().mockResolvedValue([]),
			getConvo: vi.fn().mockResolvedValue(undefined),
			createConvo: vi.fn().mockResolvedValue({ id: 1, title: "Test Convo", messages: [] }),
			updateConvo: vi.fn().mockResolvedValue(undefined),
			deleteConvo: vi.fn().mockResolvedValue(undefined),
			addMessage: vi.fn().mockResolvedValue(undefined),
		}),
		devTools: vi.fn().mockReturnValue({
			clearDatabase: vi.fn().mockResolvedValue(undefined),
		}),
		docs: vi.fn().mockReturnValue({
			listDocs: vi.fn().mockResolvedValue([]),
			getDoc: vi.fn().mockResolvedValue(undefined),
			searchDocs: vi.fn().mockResolvedValue([]),
			ingest: vi.fn().mockResolvedValue(undefined),
		}),
		docDrafts: vi.fn().mockReturnValue({
			createDocDraft: vi.fn().mockResolvedValue({
				id: 1,
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			}),
			listDocDrafts: vi.fn().mockResolvedValue([]),
			getDocDraft: vi.fn().mockResolvedValue(undefined),
			updateDocDraft: vi.fn().mockResolvedValue({
				id: 1,
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			}),
			saveDocDraft: vi.fn().mockResolvedValue({ success: true }),
			deleteDocDraft: vi.fn().mockResolvedValue({ success: true }),
			undoDocDraft: vi
				.fn()
				.mockResolvedValue({ success: true, content: "Test content", canUndo: false, canRedo: true }),
			redoDocDraft: vi
				.fn()
				.mockResolvedValue({ success: true, content: "Test content", canUndo: true, canRedo: false }),
			getRevisions: vi.fn().mockResolvedValue({ revisions: [], currentIndex: 0, canUndo: false, canRedo: false }),
			streamDraftUpdates: vi.fn().mockReturnValue({} as EventSource),
		}),
		collabConvos: vi.fn().mockReturnValue({
			createCollabConvo: vi.fn().mockResolvedValue({
				id: 1,
				artifactType: "doc_draft",
				artifactId: 1,
				messages: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			}),
			getCollabConvo: vi.fn().mockResolvedValue(undefined),
			getCollabConvoByArtifact: vi.fn().mockResolvedValue(undefined),
			sendMessage: vi.fn().mockResolvedValue({
				success: true,
				message: { role: "user", content: "Test message", timestamp: new Date().toISOString() },
			}),
			streamConvo: vi.fn().mockReturnValue({} as EventSource),
		}),
		docsites: vi.fn().mockReturnValue({
			listDocsites: vi.fn().mockResolvedValue([]),
			getDocsite: vi.fn().mockResolvedValue(undefined),
			createDocsite: vi.fn().mockResolvedValue({ id: 1, name: "Test Docsite", url: "https://example.com" }),
			updateDocsite: vi.fn().mockResolvedValue(undefined),
			deleteDocsite: vi.fn().mockResolvedValue(undefined),
			syncDocsite: vi.fn().mockResolvedValue(undefined),
		}),
		sites: vi.fn().mockReturnValue({
			listSites: vi.fn().mockResolvedValue([]),
			getSite: vi.fn().mockResolvedValue(undefined),
			createSite: vi.fn().mockResolvedValue({ id: 1, name: "test-site", displayName: "Test Site" }),
			regenerateSite: vi.fn().mockResolvedValue({ id: 1, name: "test-site", displayName: "Test Site" }),
			checkUpdateStatus: vi.fn().mockResolvedValue({
				needsUpdate: false,
				lastGeneratedAt: undefined,
				latestArticleUpdate: new Date().toISOString(),
			}),
			deleteSite: vi.fn().mockResolvedValue(undefined),
		}),
		integrations: vi.fn().mockReturnValue({
			listIntegrations: vi.fn().mockResolvedValue([]),
			getIntegration: vi.fn().mockResolvedValue(undefined),
			createIntegration: vi.fn().mockResolvedValue({ id: 1, type: "github", name: "Test" }),
			updateIntegration: vi.fn().mockResolvedValue(undefined),
			deleteIntegration: vi.fn().mockResolvedValue(undefined),
			syncIntegration: vi.fn().mockResolvedValue(undefined),
		}),
		github: vi.fn().mockReturnValue({
			getInstallUrl: vi.fn().mockResolvedValue("https://example.com"),
			listOrgs: vi.fn().mockResolvedValue([]),
			listRepos: vi.fn().mockResolvedValue([]),
		}),
		jobs: vi.fn().mockReturnValue({
			listJobs: vi.fn().mockResolvedValue([]),
			queueJob: vi.fn().mockResolvedValue({ jobId: "test-id", name: "test-job", message: "Job queued" }),
			getJobHistory: vi.fn().mockResolvedValue([]),
			getJobExecution: vi.fn().mockResolvedValue(undefined),
			cancelJob: vi.fn().mockResolvedValue(undefined),
			retryJob: vi.fn().mockResolvedValue({ jobId: "test-id", name: "test-job", message: "Job queued" }),
		}),
		orgs: vi.fn().mockReturnValue({
			getCurrent: vi.fn().mockResolvedValue({
				tenant: null,
				org: null,
				availableOrgs: [],
			}),
			listOrgs: vi.fn().mockResolvedValue({
				orgs: [],
			}),
		}),
		...partial,
	};
}
