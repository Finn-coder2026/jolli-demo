import type { Doc } from "../types/Doc";
import type {
	CreateSpaceRequest,
	NewSpace,
	Space,
	UpdateUserSpacePreferenceRequest,
	UserSpacePreferenceResponse,
} from "../types/Space";
import type { SpaceSearchResponse } from "../types/SpaceSearch";
import type { ClientAuth } from "./Client";

const BASE_PATH = "/api/spaces";

export interface SpaceClient {
	/**
	 * Lists all spaces for the current user
	 */
	listSpaces(): Promise<Array<Space>>;

	/**
	 * Gets the default space without creating it.
	 * Returns undefined if no space exists.
	 */
	getDefaultSpace(): Promise<Space | undefined>;

	/**
	 * Gets or creates the current user's personal space.
	 */
	getPersonalSpace(): Promise<Space>;

	/**
	 * Gets a space by ID
	 */
	getSpace(id: number): Promise<Space | undefined>;

	/**
	 * Gets a space by slug
	 */
	getSpaceBySlug(slug: string): Promise<Space | undefined>;

	/**
	 * Creates a new space.
	 * Only name and optional description are required; backend generates slug, jrn, etc.
	 */
	createSpace(data: CreateSpaceRequest): Promise<Space>;

	/**
	 * Updates a space
	 */
	updateSpace(id: number, data: Partial<NewSpace>): Promise<Space | undefined>;

	/**
	 * Soft deletes a space.
	 * @param id the space ID to delete.
	 * @param deleteContent if true, also soft delete all documents in the space.
	 */
	deleteSpace(id: number, deleteContent?: boolean): Promise<void>;

	/**
	 * Migrates all content from one space to another.
	 * Content is moved to the root level of the target space.
	 * @param sourceSpaceId the space to migrate content from.
	 * @param targetSpaceId the space to migrate content to.
	 */
	migrateContent(sourceSpaceId: number, targetSpaceId: number): Promise<void>;

	/**
	 * Gets the tree content for a space (non-deleted documents)
	 */
	getTreeContent(spaceId: number): Promise<Array<Doc>>;

	/**
	 * Gets the trash content for a space (deleted documents)
	 */
	getTrashContent(spaceId: number): Promise<Array<Doc>>;

	/**
	 * Checks if a space has any deleted documents
	 */
	hasTrash(spaceId: number): Promise<boolean>;

	/**
	 * Searches for documents in a space by title and content.
	 * Returns up to SPACE_SEARCH_MAX_RESULTS results.
	 * @param spaceId the space ID to search in.
	 * @param query the search query string.
	 */
	searchInSpace(spaceId: number, query: string): Promise<SpaceSearchResponse>;

	/**
	 * Gets the current user's preferences for a space.
	 * @param spaceId the space ID.
	 */
	getPreferences(spaceId: number): Promise<UserSpacePreferenceResponse>;

	/**
	 * Updates the current user's preferences for a space.
	 * @param spaceId the space ID.
	 * @param updates the preference updates to apply.
	 */
	updatePreferences(spaceId: number, updates: UpdateUserSpacePreferenceRequest): Promise<UserSpacePreferenceResponse>;
}

export function createSpaceClient(baseUrl: string, auth: ClientAuth): SpaceClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	const { createRequest } = auth;

	return {
		listSpaces,
		getDefaultSpace,
		getPersonalSpace,
		getSpace,
		getSpaceBySlug,
		createSpace,
		updateSpace,
		deleteSpace,
		migrateContent,
		getTreeContent,
		getTrashContent,
		hasTrash,
		searchInSpace,
		getPreferences,
		updatePreferences,
	};

	async function listSpaces(): Promise<Array<Space>> {
		const response = await fetch(basePath, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to list spaces: ${response.statusText}`);
		}

		return (await response.json()) as Array<Space>;
	}

	async function getDefaultSpace(): Promise<Space | undefined> {
		const response = await fetch(`${basePath}/default`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (response.status === 404) {
			return;
		}

		if (!response.ok) {
			throw new Error(`Failed to get default space: ${response.statusText}`);
		}

		return (await response.json()) as Space;
	}

	async function getPersonalSpace(): Promise<Space> {
		const response = await fetch(`${basePath}/personal`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get personal space: ${response.statusText}`);
		}

		return (await response.json()) as Space;
	}

	async function getSpace(id: number): Promise<Space | undefined> {
		const response = await fetch(`${basePath}/${id}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (response.status === 404) {
			return;
		}

		if (!response.ok) {
			throw new Error(`Failed to get space: ${response.statusText}`);
		}

		return (await response.json()) as Space;
	}

	async function getSpaceBySlug(slug: string): Promise<Space | undefined> {
		const response = await fetch(`${basePath}/slug/${encodeURIComponent(slug)}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (response.status === 404) {
			return;
		}

		if (!response.ok) {
			throw new Error(`Failed to get space by slug: ${response.statusText}`);
		}

		return (await response.json()) as Space;
	}

	async function createSpace(data: CreateSpaceRequest): Promise<Space> {
		const response = await fetch(basePath, createRequest("POST", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to create space: ${response.statusText}`);
		}

		return (await response.json()) as Space;
	}

	async function updateSpace(id: number, data: Partial<NewSpace>): Promise<Space | undefined> {
		const response = await fetch(`${basePath}/${id}`, createRequest("PUT", data));
		auth.checkUnauthorized?.(response);

		if (response.status === 404) {
			return;
		}

		if (!response.ok) {
			throw new Error(`Failed to update space: ${response.statusText}`);
		}

		return (await response.json()) as Space;
	}

	async function deleteSpace(id: number, deleteContent = false): Promise<void> {
		const url = deleteContent ? `${basePath}/${id}?deleteContent=true` : `${basePath}/${id}`;
		const response = await fetch(url, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to delete space: ${response.statusText}`);
		}
	}

	async function migrateContent(sourceSpaceId: number, targetSpaceId: number): Promise<void> {
		const response = await fetch(
			`${basePath}/${sourceSpaceId}/migrate-content`,
			createRequest("POST", { targetSpaceId }),
		);
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to migrate content: ${response.statusText}`);
		}
	}

	async function getTreeContent(spaceId: number): Promise<Array<Doc>> {
		const response = await fetch(`${basePath}/${spaceId}/tree`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get tree content: ${response.statusText}`);
		}

		return (await response.json()) as Array<Doc>;
	}

	async function getTrashContent(spaceId: number): Promise<Array<Doc>> {
		const response = await fetch(`${basePath}/${spaceId}/trash`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get trash content: ${response.statusText}`);
		}

		return (await response.json()) as Array<Doc>;
	}

	async function hasTrash(spaceId: number): Promise<boolean> {
		const response = await fetch(`${basePath}/${spaceId}/has-trash`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to check trash: ${response.statusText}`);
		}

		const result = (await response.json()) as { hasTrash: boolean };
		return result.hasTrash;
	}

	async function searchInSpace(spaceId: number, query: string): Promise<SpaceSearchResponse> {
		const response = await fetch(`${basePath}/${spaceId}/search`, createRequest("POST", { query }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to search in space: ${response.statusText}`);
		}

		return (await response.json()) as SpaceSearchResponse;
	}

	async function getPreferences(spaceId: number): Promise<UserSpacePreferenceResponse> {
		const response = await fetch(`${basePath}/${spaceId}/preferences`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get preferences: ${response.statusText}`);
		}

		return (await response.json()) as UserSpacePreferenceResponse;
	}

	async function updatePreferences(
		spaceId: number,
		updates: UpdateUserSpacePreferenceRequest,
	): Promise<UserSpacePreferenceResponse> {
		const response = await fetch(`${basePath}/${spaceId}/preferences`, createRequest("PUT", updates));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to update preferences: ${response.statusText}`);
		}

		return (await response.json()) as UserSpacePreferenceResponse;
	}
}
