import type { Doc } from "../types/Doc";
import type { NewSpace, Space } from "../types/Space";
import type { ClientAuth } from "./Client";

const BASE_PATH = "/api/spaces";

export interface SpaceClient {
	/**
	 * Lists all spaces for the current user
	 */
	listSpaces(): Promise<Array<Space>>;

	/**
	 * Gets the default space, creating it if it doesn't exist
	 */
	getDefaultSpace(): Promise<Space>;

	/**
	 * Gets a space by ID
	 */
	getSpace(id: number): Promise<Space | undefined>;

	/**
	 * Creates a new space
	 */
	createSpace(data: NewSpace): Promise<Space>;

	/**
	 * Updates a space
	 */
	updateSpace(id: number, data: Partial<NewSpace>): Promise<Space | undefined>;

	/**
	 * Deletes a space
	 */
	deleteSpace(id: number): Promise<void>;

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
}

export function createSpaceClient(baseUrl: string, auth: ClientAuth): SpaceClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	const { createRequest } = auth;

	return {
		listSpaces,
		getDefaultSpace,
		getSpace,
		createSpace,
		updateSpace,
		deleteSpace,
		getTreeContent,
		getTrashContent,
		hasTrash,
	};

	async function listSpaces(): Promise<Array<Space>> {
		const response = await fetch(basePath, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to list spaces: ${response.statusText}`);
		}

		return (await response.json()) as Array<Space>;
	}

	async function getDefaultSpace(): Promise<Space> {
		const response = await fetch(`${basePath}/default`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get default space: ${response.statusText}`);
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

	async function createSpace(data: NewSpace): Promise<Space> {
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

	async function deleteSpace(id: number): Promise<void> {
		const response = await fetch(`${basePath}/${id}`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to delete space: ${response.statusText}`);
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
}
