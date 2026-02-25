/**
 * Source type — extensible for future integrations (e.g., "linear", "confluence").
 */
export type SourceKind = "git" | "file";

/**
 * A first-class source with its own identity and lifecycle.
 * Sources represent code repositories or file origins that spaces can watch.
 */
export interface Source {
	readonly id: number;
	/** Human-readable name, unique per org */
	readonly name: string;
	/** Source type — determines how change tracking works */
	readonly type: SourceKind;
	/** Go module style repo identifier (e.g., "github.com/org/backend") */
	readonly repo?: string;
	/** Branch to track */
	readonly branch?: string;
	/** FK to integrations — null for virtual sources */
	readonly integrationId?: number;
	/** Whether this source is globally enabled */
	readonly enabled: boolean;
	/** Change tracking cursor — optional, source-type-dependent */
	readonly cursor?: SourceCursor;
	readonly createdAt: string;
	readonly updatedAt: string;
}

/**
 * Opaque checkpoint for incremental change tracking.
 * The value's meaning depends on the source type:
 * - git (polling/catch-up): commit SHA
 * - Linear (future): sync timestamp
 */
export interface SourceCursor {
	/** Opaque value — commit SHA for git, timestamp for APIs */
	readonly value: string;
	/** ISO timestamp of last successful processing */
	readonly updatedAt: string;
}

/**
 * Junction table binding a source to a space.
 * A single source can be bound to multiple spaces.
 */
export interface SpaceSource {
	readonly spaceId: number;
	readonly sourceId: number;
	/** Space-specific JRN pattern override */
	readonly jrnPattern?: string;
	/** Space-level enabled toggle (independent of source.enabled) */
	readonly enabled: boolean;
	readonly createdAt: string;
}

export type NewSource = Omit<Source, "id" | "createdAt" | "updatedAt">;

/**
 * Request body for creating a new source via the API.
 */
export interface CreateSourceRequest {
	readonly name: string;
	readonly type: SourceKind;
	readonly repo?: string;
	readonly branch?: string;
	readonly integrationId?: number;
	readonly enabled?: boolean;
}

/**
 * Request body for binding a source to a space.
 */
export interface BindSourceRequest {
	readonly sourceId: number;
	readonly jrnPattern?: string;
	readonly enabled?: boolean;
}

/**
 * Request body for advancing a source cursor.
 */
export interface UpdateCursorRequest {
	readonly value: string;
}
