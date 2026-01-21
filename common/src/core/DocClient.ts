import type { Doc, NewDoc } from "../types/Doc";
import type { DocDraft } from "../types/DocDraft";
import type { ClientAuth } from "./Client";

const BASE_PATH = "/api/docs";

export interface SearchRequest {
	query: string;
	limit?: number;
}

export interface SearchResult {
	chunks: Array<{
		id: number;
		docId: number;
		content: string;
		embedding: Array<number>;
		version: number;
	}>;
}

export interface ListDocsOptions {
	/** Optional JRN prefix to filter documents */
	startsWithJrn?: string;
	/** If true, includes /root documents; if false (default), excludes them */
	includeRoot?: boolean;
}

export interface DocClient {
	/**
	 * Creates a new document
	 */
	createDoc(data: NewDoc): Promise<Doc>;
	/**
	 * Get all documents
	 * @param options - Optional filtering options
	 */
	listDocs(options?: ListDocsOptions): Promise<Array<Doc>>;
	/**
	 * Gets a specific document by JRN
	 */
	findDoc(jrn: string): Promise<Doc | undefined>;
	/**
	 * Gets a specific document by ID
	 */
	getDocById(id: number): Promise<Doc | undefined>;
	/**
	 * Updates a document
	 */
	updateDoc(data: Doc): Promise<Doc>;
	/**
	 * Deletes a document
	 */
	deleteDoc(jrn: string): Promise<void>;
	/**
	 * Soft deletes a document and its descendants
	 */
	softDelete(id: number): Promise<void>;
	/**
	 * Restores a soft-deleted document and its descendants
	 */
	restore(id: number): Promise<void>;
	/**
	 * Renames a document by updating its title.
	 * Does not change the slug or path (SEO-friendly behavior).
	 */
	renameDoc(id: number, title: string): Promise<Doc>;
	/**
	 * Deletes all documents
	 */
	clearAll(): Promise<void>;
	/**
	 * Search documents using hybrid search
	 */
	search(request: SearchRequest): Promise<SearchResult>;
	/**
	 * Search documents by title
	 */
	searchByTitle(title: string): Promise<Array<Doc>>;
	/**
	 * Creates a draft from an existing article for editing
	 */
	createDraftFromArticle(jrn: string): Promise<DocDraft>;
}

export function createDocClient(baseUrl: string, auth: ClientAuth): DocClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	const { createRequest } = auth;
	return {
		createDoc,
		listDocs,
		findDoc,
		getDocById,
		updateDoc,
		deleteDoc,
		softDelete,
		restore,
		renameDoc,
		clearAll,
		search,
		searchByTitle,
		createDraftFromArticle,
	};

	async function createDoc(data: NewDoc): Promise<Doc> {
		const response = await fetch(basePath, createRequest("POST", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to create document: ${response.statusText}`);
		}

		return (await response.json()) as Doc;
	}

	async function listDocs(options?: ListDocsOptions): Promise<Array<Doc>> {
		const params = new URLSearchParams();
		if (options?.startsWithJrn) {
			params.set("startsWithJrn", options.startsWithJrn);
		}
		if (options?.includeRoot) {
			params.set("includeRoot", "true");
		}
		const queryString = params.toString();
		const url = queryString ? `${basePath}?${queryString}` : basePath;
		const response = await fetch(url, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to list documents: ${response.statusText}`);
		}

		return (await response.json()) as Array<Doc>;
	}

	async function findDoc(jrn: string): Promise<Doc | undefined> {
		const response = await fetch(`${basePath}/${encodeURIComponent(jrn)}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (response.status === 404) {
			return;
		}

		if (!response.ok) {
			throw new Error(`Failed to get document: ${response.statusText}`);
		}

		return (await response.json()) as Doc;
	}

	async function getDocById(id: number): Promise<Doc | undefined> {
		const response = await fetch(`${basePath}/id/${id}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (response.status === 404) {
			return;
		}

		if (!response.ok) {
			throw new Error(`Failed to get document by ID: ${response.statusText}`);
		}

		return (await response.json()) as Doc;
	}

	async function updateDoc(data: Doc): Promise<Doc> {
		const response = await fetch(`${basePath}/${encodeURIComponent(data.jrn)}`, createRequest("PUT", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to update document: ${response.statusText}`);
		}

		return (await response.json()) as Doc;
	}

	async function deleteDoc(jrn: string): Promise<void> {
		const response = await fetch(`${basePath}/${encodeURIComponent(jrn)}`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to delete document: ${response.statusText}`);
		}
	}

	async function softDelete(id: number): Promise<void> {
		const response = await fetch(`${basePath}/by-id/${id}/soft-delete`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to soft delete document: ${response.statusText}`);
		}
	}

	async function restore(id: number): Promise<void> {
		const response = await fetch(`${basePath}/by-id/${id}/restore`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to restore document: ${response.statusText}`);
		}
	}

	async function renameDoc(id: number, title: string): Promise<Doc> {
		const response = await fetch(`${basePath}/by-id/${id}/rename`, createRequest("POST", { title }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to rename document: ${response.statusText}`);
		}

		return (await response.json()) as Doc;
	}

	async function clearAll(): Promise<void> {
		const response = await fetch(`${basePath}/clearAll`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to clear all documents: ${response.statusText}`);
		}
	}

	async function search(request: SearchRequest): Promise<SearchResult> {
		const response = await fetch(`${basePath}/search`, createRequest("POST", request));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to search documents: ${response.statusText}`);
		}

		return (await response.json()) as SearchResult;
	}

	async function searchByTitle(title: string): Promise<Array<Doc>> {
		const response = await fetch(`${basePath}/search-by-title`, createRequest("POST", { title }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to search documents by title: ${response.statusText}`);
		}

		return (await response.json()) as Array<Doc>;
	}

	async function createDraftFromArticle(jrn: string): Promise<DocDraft> {
		const response = await fetch(`${basePath}/${encodeURIComponent(jrn)}/create-draft`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to create draft from article: ${response.statusText}`);
		}

		return (await response.json()) as DocDraft;
	}
}
