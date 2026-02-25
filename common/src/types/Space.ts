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

/**
 * Preset options for the Updated filter.
 * - any_time: No time filtering (default)
 * - today: Updated today
 * - last_7_days: Updated in the last 7 days
 * - last_30_days: Updated in the last 30 days
 * - last_3_months: Updated in the last 3 months
 */
export type UpdatedFilterPreset = "any_time" | "today" | "last_7_days" | "last_30_days" | "last_3_months";

/**
 * Updated filter value - either a preset or a custom date.
 * For custom dates, use { type: "after_date", date: "YYYY-MM-DD" }
 */
export type UpdatedFilter = UpdatedFilterPreset | { readonly type: "after_date"; readonly date: string };

/**
 * Filter options for spaces and user preferences.
 * - updated: Filter by last update time
 * - creator: Filter by document creator (matches Doc.createdBy field, empty string means no filter)
 *
 * TODO: Currently filtering is applied on the frontend (useSpaceTree.ts).
 * When member/permission features are implemented, consider:
 * 1. Moving filter logic to backend for better performance with large document sets
 * 2. The 'creator' field should filter by Doc.createdBy (user ID string)
 * 3. May need to join with users/members table to support filtering by display name
 */
export interface SpaceFilters {
	readonly updated: UpdatedFilter;
	readonly creator: string;
}

/**
 * Default filter values (no filtering applied).
 */
export const DEFAULT_SPACE_FILTERS: SpaceFilters = {
	updated: "any_time",
	creator: "",
};

/**
 * Normalize partial or incomplete filter data to a complete SpaceFilters object.
 * Handles cases where backend returns {} (empty object) or fields are missing.
 */
export function normalizeFilters(filters: Partial<SpaceFilters> | undefined | null): SpaceFilters {
	if (!filters) {
		return { ...DEFAULT_SPACE_FILTERS };
	}
	return {
		updated: filters.updated ?? "any_time",
		creator: filters.creator ?? "",
	};
}

/**
 * Helper function to check if filters are equal.
 */
export function areFiltersEqual(a: SpaceFilters, b: SpaceFilters): boolean {
	// Compare updated filter
	if (typeof a.updated === "string" && typeof b.updated === "string") {
		if (a.updated !== b.updated) {
			return false;
		}
	} else if (typeof a.updated === "object" && typeof b.updated === "object") {
		if (a.updated.type !== b.updated.type || a.updated.date !== b.updated.date) {
			return false;
		}
	} else {
		return false;
	}

	// Compare creator strings (handle undefined as empty string)
	const aCreator = a.creator ?? "";
	const bCreator = b.creator ?? "";
	return aCreator === bCreator;
}

export interface Space {
	readonly id: number;
	readonly name: string;
	readonly slug: string;
	readonly jrn: string;
	/** Space description. null/undefined means no description. */
	readonly description: string | null | undefined;
	readonly ownerId: number;
	/** Whether this is a personal space (private to the owner). */
	readonly isPersonal: boolean;
	readonly defaultSort: SpaceSortOption;
	readonly defaultFilters: SpaceFilters;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export type NewSpace = Omit<Space, "id" | "createdAt" | "updatedAt" | "jrn">;

/**
 * Request body for creating a new space via the API.
 * Only name is required; slug, jrn, and defaults are generated server-side.
 */
export interface CreateSpaceRequest {
	readonly name: string;
	readonly description?: string;
}

export interface UserSpacePreference {
	readonly id: number;
	readonly spaceId: number;
	readonly userId: number;
	readonly sort: SpaceSortOption | undefined;
	readonly filters: SpaceFilters;
	readonly expandedFolders: Array<number>;
	readonly createdAt: string;
	readonly updatedAt: string;
}

/**
 * Response type for user space preference API endpoints.
 * Returns null instead of undefined for optional fields to match JSON semantics.
 */
export interface UserSpacePreferenceResponse {
	readonly sort: SpaceSortOption | null;
	readonly filters: SpaceFilters;
	readonly expandedFolders: Array<number>;
}

/**
 * Request body for updating user space preferences.
 * All fields are optional to allow partial updates.
 */
export interface UpdateUserSpacePreferenceRequest {
	readonly sort?: SpaceSortOption | null;
	readonly filters?: SpaceFilters;
	readonly expandedFolders?: Array<number>;
}
