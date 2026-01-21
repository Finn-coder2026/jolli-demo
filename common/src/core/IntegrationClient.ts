import type { Integration, NewIntegration } from "../types/Integration";
import type { ClientAuth } from "./Client";

const BASE_PATH = "/api/integrations";

export interface CheckAccessResponse {
	hasAccess: boolean;
	status: "active" | "needs_repo_access" | "error";
}

export interface UploadFileRequest {
	filename: string;
	content: string;
	contentType?: string;
}

export interface UploadFileResponse {
	doc: {
		id: number;
		jrn: string;
		content: string;
		contentType: string;
	};
	created: boolean;
}

export interface IntegrationClient {
	/**
	 * Creates a new integration
	 */
	createIntegration(data: NewIntegration): Promise<Integration>;
	/**
	 * Get all integrations
	 */
	listIntegrations(): Promise<Array<Integration>>;
	/**
	 * Gets a specific integration by ID
	 */
	getIntegration(id: number): Promise<Integration | undefined>;
	/**
	 * Updates an integration
	 */
	updateIntegration(data: Integration): Promise<Integration>;
	/**
	 * Deletes an integration
	 */
	deleteIntegration(id: number): Promise<void>;
	/**
	 * Checks if the GitHub App has access to the integration's repository
	 * @param id The integration ID
	 * @throws Error if the API call fails
	 */
	checkAccess(id: number): Promise<CheckAccessResponse>;
	/**
	 * Uploads a file to a static_file integration
	 * @param id The integration ID
	 * @param data The file data (filename, content, optional contentType)
	 * @throws Error if the API call fails or integration is not a static_file type
	 */
	uploadFile(id: number, data: UploadFileRequest): Promise<UploadFileResponse>;
}

export function createIntegrationClient(baseUrl: string, auth: ClientAuth): IntegrationClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	const { createRequest } = auth;
	return {
		createIntegration,
		listIntegrations,
		getIntegration,
		updateIntegration,
		deleteIntegration,
		checkAccess,
		uploadFile,
	};

	async function createIntegration(data: NewIntegration): Promise<Integration> {
		const response = await fetch(basePath, createRequest("POST", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to create integration: ${response.statusText}`);
		}

		return (await response.json()) as Integration;
	}

	async function listIntegrations(): Promise<Array<Integration>> {
		const response = await fetch(basePath, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to list integrations: ${response.statusText}`);
		}

		return (await response.json()) as Array<Integration>;
	}

	async function getIntegration(id: number): Promise<Integration | undefined> {
		const response = await fetch(`${basePath}/${id}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (response.status === 404) {
			return;
		}

		if (!response.ok) {
			throw new Error(`Failed to get integration: ${response.statusText}`);
		}

		return (await response.json()) as Integration;
	}

	async function updateIntegration(data: Integration): Promise<Integration> {
		const response = await fetch(`${basePath}/${data.id}`, createRequest("PUT", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to update integration: ${response.statusText}`);
		}

		return (await response.json()) as Integration;
	}

	async function deleteIntegration(id: number): Promise<void> {
		const response = await fetch(`${basePath}/${id}`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to delete integration: ${response.statusText}`);
		}
	}

	async function checkAccess(id: number): Promise<CheckAccessResponse> {
		const response = await fetch(`${basePath}/${id}/check-access`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to check access: ${response.statusText}`);
		}

		return (await response.json()) as CheckAccessResponse;
	}

	async function uploadFile(id: number, data: UploadFileRequest): Promise<UploadFileResponse> {
		const response = await fetch(`${basePath}/${id}/upload`, createRequest("POST", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to upload file: ${response.statusText}`);
		}

		return (await response.json()) as UploadFileResponse;
	}
}
