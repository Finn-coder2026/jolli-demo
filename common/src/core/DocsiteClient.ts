import type {
	CreateDocsiteRequest,
	Docsite,
	GenerateDocsiteFromReposRequest,
	GenerateDocsiteRequest,
	UpdateDocsiteRequest,
} from "../types/Docsite";
import type { ClientAuth } from "./Client";

const BASE_PATH = "/api/docsites";

export interface DocsiteClient {
	/**
	 * Lists all docsites for the current user
	 */
	listDocsites(): Promise<Array<Docsite>>;
	/**
	 * Gets a specific docsite by ID
	 */
	getDocsite(id: number): Promise<Docsite | undefined>;
	/**
	 * Creates a site
	 */
	createDocsite(data: CreateDocsiteRequest): Promise<Docsite>;
	/**
	 * Updates an existing docsite
	 */
	updateDocsite(id: number, data: UpdateDocsiteRequest): Promise<Docsite>;
	/**
	 * Deletes a docsite
	 */
	deleteDocsite(id: number): Promise<void>;
	/**
	 * Generates a docsite from a GitHub integration
	 */
	generateDocsite(data: GenerateDocsiteRequest): Promise<Docsite>;
	/**
	 * Atomically enables repositories and generates a docsite in a single transaction
	 */
	generateDocsiteFromRepos(data: GenerateDocsiteFromReposRequest): Promise<Docsite>;
}

export function createDocsiteClient(baseUrl: string, auth: ClientAuth): DocsiteClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	const { createRequest } = auth;

	return {
		listDocsites,
		getDocsite,
		createDocsite,
		updateDocsite,
		deleteDocsite,
		generateDocsite,
		generateDocsiteFromRepos,
	};

	async function listDocsites(): Promise<Array<Docsite>> {
		const response = await fetch(basePath, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error: string;
			};
			throw new Error(errorData.error);
		}

		return (await response.json()) as Array<Docsite>;
	}

	async function getDocsite(id: number): Promise<Docsite | undefined> {
		const response = await fetch(`${basePath}/${id}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (response.status === 404) {
			return;
		}

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error: string;
			};
			throw new Error(errorData.error);
		}

		return (await response.json()) as Docsite;
	}

	async function createDocsite(data: CreateDocsiteRequest): Promise<Docsite> {
		const response = await fetch(basePath, createRequest("POST", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error: string;
			};
			throw new Error(errorData.error);
		}

		return (await response.json()) as Docsite;
	}

	async function updateDocsite(id: number, data: UpdateDocsiteRequest): Promise<Docsite> {
		const response = await fetch(`${basePath}/${id}`, createRequest("PUT", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error: string;
			};
			throw new Error(errorData.error);
		}

		return (await response.json()) as Docsite;
	}

	async function deleteDocsite(id: number): Promise<void> {
		const response = await fetch(`${basePath}/${id}`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error: string;
			};
			throw new Error(errorData.error);
		}
	}

	async function generateDocsite(data: GenerateDocsiteRequest): Promise<Docsite> {
		const response = await fetch(`${basePath}/generate`, createRequest("POST", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error: string;
			};
			throw new Error(errorData.error);
		}

		return (await response.json()) as Docsite;
	}

	async function generateDocsiteFromRepos(data: GenerateDocsiteFromReposRequest): Promise<Docsite> {
		const response = await fetch(`${basePath}/generate-from-repos`, createRequest("POST", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error: string;
			};
			throw new Error(errorData.error);
		}

		return (await response.json()) as Docsite;
	}
}
