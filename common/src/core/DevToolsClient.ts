import type { QueueJobResponse } from "../types/Job";
import type { ClientAuth } from "./Client";

export interface DevToolsInfoResponse {
	enabled: boolean;
	githubAppCreatorEnabled: boolean;
	jobTesterEnabled: boolean;
	dataClearerEnabled: boolean;
	draftGeneratorEnabled: boolean;
	githubApp?: {
		defaultOrg: string;
		defaultManifest: Record<string, unknown>;
	};
}

export interface GitHubAppCallbackResponse {
	success: boolean;
	config: string;
	appInfo: {
		name: string;
		htmlUrl: string;
	};
}

export type ClearDataType = "articles" | "sites" | "jobs" | "github" | "sync";

export interface ClearDataRequest {
	dataType: ClearDataType;
}

export interface ClearDataResponse {
	success: boolean;
	deletedCount: number;
	message: string;
}

export interface GenerateDraftRequest {
	docJrn: string;
	numEdits?: number;
}

export interface GenerateDraftResponse {
	success: boolean;
	draftId: number;
	message: string;
}

export interface ReloadConfigResponse {
	success: boolean;
	message: string;
}

export interface DevToolsClient {
	/**
	 * Gets developer tools configuration and status
	 * @throws Error if the API call fails
	 */
	getDevToolsInfo(): Promise<DevToolsInfoResponse>;
	/**
	 * Handles the GitHub App manifest callback and gets the app configuration
	 * @param code The code from GitHub's manifest flow
	 * @throws Error if the API call fails
	 */
	completeGitHubAppSetup(code: string): Promise<GitHubAppCallbackResponse>;
	/**
	 * Triggers a demo job for testing dashboard widgets
	 * @param jobName The name of the demo job to trigger
	 * @throws Error if the API call fails
	 */
	triggerDemoJob(jobName: string, params?: unknown): Promise<QueueJobResponse>;
	/**
	 * Clears data for development/testing purposes
	 * @param dataType The type of data to clear
	 * @throws Error if the API call fails
	 */
	clearData(dataType: ClearDataType): Promise<ClearDataResponse>;
	/**
	 * Generates a draft with mock section edit suggestions
	 * @param params Parameters for draft generation
	 * @throws Error if the API call fails
	 */
	generateDraftWithEdits(params: GenerateDraftRequest): Promise<GenerateDraftResponse>;
	/**
	 * Reloads configuration from all providers (AWS Parameter Store, Vercel, local env)
	 * and clears tenant-specific config caches
	 * @throws Error if the API call fails
	 */
	reloadConfig(): Promise<ReloadConfigResponse>;
}

export function createDevToolsClient(baseUrl: string, auth: ClientAuth): DevToolsClient {
	const { createRequest } = auth;
	return {
		getDevToolsInfo,
		completeGitHubAppSetup,
		triggerDemoJob,
		clearData,
		generateDraftWithEdits,
		reloadConfig,
	};

	async function getDevToolsInfo(): Promise<DevToolsInfoResponse> {
		const response = await fetch(`${baseUrl}/api/dev-tools/info`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get dev tools info: ${response.statusText}`);
		}

		return (await response.json()) as DevToolsInfoResponse;
	}

	async function completeGitHubAppSetup(code: string): Promise<GitHubAppCallbackResponse> {
		const response = await fetch(
			`${baseUrl}/api/dev-tools/github-app/callback?code=${encodeURIComponent(code)}`,
			createRequest("GET"),
		);
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to complete GitHub App setup: ${response.statusText}`);
		}

		return (await response.json()) as GitHubAppCallbackResponse;
	}

	async function triggerDemoJob(jobName: string, params?: unknown): Promise<QueueJobResponse> {
		const response = await fetch(
			`${baseUrl}/api/dev-tools/trigger-demo-job`,
			createRequest("POST", params !== undefined ? { jobName, params } : { jobName }),
		);
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to trigger demo job: ${response.statusText}`);
		}

		return (await response.json()) as QueueJobResponse;
	}

	async function clearData(dataType: ClearDataType): Promise<ClearDataResponse> {
		const response = await fetch(`${baseUrl}/api/dev-tools/clear-data`, createRequest("POST", { dataType }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			const message = (errorData as { message?: string }).message || response.statusText;
			throw new Error(`Failed to clear data: ${message}`);
		}

		return (await response.json()) as ClearDataResponse;
	}

	async function generateDraftWithEdits(params: GenerateDraftRequest): Promise<GenerateDraftResponse> {
		const response = await fetch(
			`${baseUrl}/api/dev-tools/generate-draft-with-edits`,
			createRequest("POST", params),
		);
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			const message = (errorData as { error?: string }).error || response.statusText;
			throw new Error(`Failed to generate draft: ${message}`);
		}

		return (await response.json()) as GenerateDraftResponse;
	}

	async function reloadConfig(): Promise<ReloadConfigResponse> {
		const response = await fetch(`${baseUrl}/api/dev-tools/reload-config`, createRequest("POST", {}));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			const message = (errorData as { error?: string }).error || response.statusText;
			throw new Error(`Failed to reload config: ${message}`);
		}

		return (await response.json()) as ReloadConfigResponse;
	}
}
