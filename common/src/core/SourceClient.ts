import type { BindSourceRequest, CreateSourceRequest, Source, SpaceSource, UpdateCursorRequest } from "../types/Source";
import type { ClientAuth } from "./Client";

const BASE_PATH = "/api/v1/sources";

export interface SourceClient {
	/** Lists all sources in the current org. */
	listSources(): Promise<Array<Source>>;
	/** Creates a new source. */
	createSource(data: CreateSourceRequest): Promise<Source>;
	/** Gets a source by ID. */
	getSource(id: number): Promise<Source | undefined>;
	/** Updates a source by ID. */
	updateSource(id: number, data: Partial<CreateSourceRequest>): Promise<Source | undefined>;
	/** Deletes a source by ID. */
	deleteSource(id: number): Promise<void>;
	/** Advances the cursor for a source. */
	updateCursor(id: number, data: UpdateCursorRequest): Promise<Source | undefined>;
	/** Lists sources bound to a space. */
	listSpaceSources(spaceId: number): Promise<Array<Source & { binding: SpaceSource }>>;
	/** Binds a source to a space. */
	bindSource(spaceId: number, data: BindSourceRequest): Promise<SpaceSource>;
	/** Unbinds a source from a space. */
	unbindSource(spaceId: number, sourceId: number): Promise<void>;
}

export function createSourceClient(baseUrl: string, auth: ClientAuth): SourceClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	const spaceBasePath = `${baseUrl}/api/v1/spaces`;
	const { createRequest } = auth;

	return {
		listSources,
		createSource,
		getSource,
		updateSource,
		deleteSource,
		updateCursor,
		listSpaceSources,
		bindSource,
		unbindSource,
	};

	async function listSources(): Promise<Array<Source>> {
		const response = await fetch(basePath, createRequest("GET"));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error(`Failed to list sources: ${response.statusText}`);
		}
		return (await response.json()) as Array<Source>;
	}

	async function createSource(data: CreateSourceRequest): Promise<Source> {
		const response = await fetch(basePath, createRequest("POST", data));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error(`Failed to create source: ${response.statusText}`);
		}
		return (await response.json()) as Source;
	}

	async function getSource(id: number): Promise<Source | undefined> {
		const response = await fetch(`${basePath}/${id}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);
		if (response.status === 404) {
			return;
		}
		if (!response.ok) {
			throw new Error(`Failed to get source: ${response.statusText}`);
		}
		return (await response.json()) as Source;
	}

	async function updateSource(id: number, data: Partial<CreateSourceRequest>): Promise<Source | undefined> {
		const response = await fetch(`${basePath}/${id}`, createRequest("PATCH", data));
		auth.checkUnauthorized?.(response);
		if (response.status === 404) {
			return;
		}
		if (!response.ok) {
			throw new Error(`Failed to update source: ${response.statusText}`);
		}
		return (await response.json()) as Source;
	}

	async function deleteSource(id: number): Promise<void> {
		const response = await fetch(`${basePath}/${id}`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error(`Failed to delete source: ${response.statusText}`);
		}
	}

	async function updateCursor(id: number, data: UpdateCursorRequest): Promise<Source | undefined> {
		const response = await fetch(`${basePath}/${id}/cursor`, createRequest("PATCH", data));
		auth.checkUnauthorized?.(response);
		if (response.status === 404) {
			return;
		}
		if (!response.ok) {
			throw new Error(`Failed to update cursor: ${response.statusText}`);
		}
		return (await response.json()) as Source;
	}

	async function listSpaceSources(spaceId: number): Promise<Array<Source & { binding: SpaceSource }>> {
		const response = await fetch(`${spaceBasePath}/${spaceId}/sources`, createRequest("GET"));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error(`Failed to list space sources: ${response.statusText}`);
		}
		return (await response.json()) as Array<Source & { binding: SpaceSource }>;
	}

	async function bindSource(spaceId: number, data: BindSourceRequest): Promise<SpaceSource> {
		const response = await fetch(`${spaceBasePath}/${spaceId}/sources`, createRequest("POST", data));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error(`Failed to bind source: ${response.statusText}`);
		}
		return (await response.json()) as SpaceSource;
	}

	async function unbindSource(spaceId: number, sourceId: number): Promise<void> {
		const response = await fetch(`${spaceBasePath}/${spaceId}/sources/${sourceId}`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error(`Failed to unbind source: ${response.statusText}`);
		}
	}
}
