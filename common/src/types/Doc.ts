/**
 * Document type enumeration.
 * - document: Regular document with content
 * - folder: Container for organizing documents
 * Future extensions: template, link, etc.
 */
export type DocType = "document" | "folder";

export interface Doc {
	readonly id: number;
	readonly jrn: string;
	readonly slug: string;
	readonly path: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly updatedBy: string;
	readonly source: unknown | undefined;
	readonly sourceMetadata: unknown | undefined;
	readonly content: string;
	readonly contentType: string;
	readonly contentMetadata: DocContentMetadata | undefined;
	readonly version: number;
	// Space hierarchy fields
	readonly spaceId: number | undefined;
	readonly parentId: number | undefined;
	readonly docType: DocType;
	readonly sortOrder: number;
	readonly createdBy: string | undefined;
	readonly deletedAt: string | undefined;
	readonly explicitlyDeleted: boolean;
}

/**
 * New document type for creation.
 * - slug: Auto-generated from title if not provided
 * - path: Auto-generated based on parent hierarchy if not provided
 * - jrn: Auto-generated if not provided
 * - sortOrder: Auto-calculated based on siblings if not provided
 */
export type NewDoc = Omit<
	Doc,
	| "id"
	| "createdAt"
	| "updatedAt"
	| "version"
	| "deletedAt"
	| "explicitlyDeleted"
	| "slug"
	| "path"
	| "jrn"
	| "sortOrder"
	| "createdBy"
	| "updatedBy"
> & {
	slug?: string;
	path?: string;
	jrn?: string;
	sortOrder?: number;
	/** Optional: set by backend from JWT if not provided */
	createdBy?: string;
	/** Optional: set by backend from JWT if not provided */
	updatedBy?: string;
};

export interface DocPermissions {
	read: boolean;
	write: boolean;
	execute: boolean;
}

/**
 * Sync metadata for CLI-synced articles.
 * Only present for articles synced via the markdown sync server.
 */
export interface SyncInfo {
	/** Stable file ID from CLI (ULID in frontmatter) */
	fileId: string;
	/** Obfuscated client path */
	serverPath: string;
	/** Integrity hash (wyhash of content) */
	contentHash?: string;
	/** Tombstone flag */
	deleted?: boolean;
	/** When deleted (epoch ms) */
	deletedAt?: number;
}

/**
 * Search result for the article link menu (`[[` trigger).
 * Includes the document and its parent folder name for display context.
 */
export interface ArticleLinkSearchResult {
	readonly id: number;
	readonly jrn: string;
	readonly slug: string;
	readonly path: string;
	readonly updatedAt: string;
	readonly contentMetadata: DocContentMetadata | undefined;
	readonly parentFolderName: string | null;
}

export interface DocContentMetadata {
	title?: string;
	sourceName?: string;
	sourceUrl?: string;
	status?: "upToDate" | "needsUpdate" | "underReview";
	commitsAhead?: number;
	qualityScore?: number;
	lastUpdated?: string;
	readonly draftId?: number | undefined;
	updatePrompt?: string;
	permissions?: DocPermissions;
	isSourceDoc?: boolean;
	referVersion?: number;
	/** Sync metadata - only present for CLI-synced articles */
	sync?: SyncInfo;
}
