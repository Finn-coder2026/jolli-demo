import type { DevToolsClient } from "./DevToolsClient";

export function mockDevToolsClient(): DevToolsClient {
	return {
		getDevToolsInfo: async () => ({
			enabled: false,
			githubAppCreatorEnabled: false,
			jobTesterEnabled: false,
			dataClearerEnabled: false,
			draftGeneratorEnabled: false,
		}),
		completeGitHubAppSetup: async () => ({
			success: true,
			config: "{}",
			appInfo: { name: "Test App", htmlUrl: "https://github.com/apps/test-app" },
		}),
		triggerDemoJob: async () => ({
			jobId: "mock-job-id",
			name: "demo:test",
			message: "Job queued successfully",
		}),
		clearData: async () => ({
			success: true,
			deletedCount: 0,
			message: "Data cleared successfully",
		}),
		generateDraftWithEdits: async () => ({
			success: true,
			draftId: 123,
			message: "Draft created with 2 section edit suggestions",
		}),
		reloadConfig: async () => ({
			success: true,
			message: "Configuration reloaded successfully",
		}),
	};
}
