/**
 * Sort options for spaces and user preferences.
 * - default: Manual ordering (sortOrder field)
 * - alphabetical_asc/desc: Sort by title
 * - updatedAt_asc/desc: Sort by last update time
 * - createdAt_asc/desc: Sort by creation time
 */
export type SpaceSortOption =
	| "default"
	| "alphabetical_asc"
	| "alphabetical_desc"
	| "updatedAt_asc"
	| "updatedAt_desc"
	| "createdAt_asc"
	| "createdAt_desc";

export interface Space {
	readonly id: number;
	readonly name: string;
	readonly slug: string;
	readonly jrn: string;
	readonly description: string | undefined;
	readonly ownerId: number;
	readonly defaultSort: SpaceSortOption;
	readonly defaultFilters: Record<string, unknown>;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export type NewSpace = Omit<Space, "id" | "createdAt" | "updatedAt" | "jrn">;

export interface UserSpacePreference {
	readonly id: number;
	readonly spaceId: number;
	readonly userId: number;
	readonly sort: SpaceSortOption | undefined;
	readonly filters: Record<string, unknown>;
	readonly expandedFolders: Array<number>;
	readonly createdAt: string;
	readonly updatedAt: string;
}
