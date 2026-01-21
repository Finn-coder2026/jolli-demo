/**
 * JRN (Jolli Resource Name) Type Definitions
 *
 * Version 3 Format: jrn:<controllingPath?>:path:<unix-path>[:qualifier]
 *
 * The controllingPath is optional and opaque (can be any string or empty).
 * The path is a unix-style path that represents the resource location.
 *
 * Examples:
 * - jrn::path:/home/org_01/sources/github/anthropics/claude-code/main
 * - jrn::path:/home/org_01/docs/article/art_01JXYZ
 * - jrn::path:/home/org_01/docs/article/art_01JXYZ:v/12
 * - jrn::path:/home/org_01/sources/web/https://example.com
 * - jrn::path:/home/org_01/assets/image/img_01JXYZ
 * - jrn:ctrl:path:/home/org_01/docs/article/art_01JXYZ (with controlling path)
 *
 * Legacy v2 Format (still supported for parsing): jrn:{orgId}/{spaceId}:{service}:{resourceType}/{resourceId}[:qualifier]
 */

// =============================================================================
// Core Type Definitions
// =============================================================================

/** Known service values */
export type JrnService = "docs" | "sources" | "agents" | "jobs" | "assets" | "spaces";

/** Known source types */
export type SourceType = "github" | "web";

// =============================================================================
// Parsed JRN Interfaces
// =============================================================================

/** Base interface for all parsed JRNs (common fields) */
export interface ParsedJrnBase {
	/** Original raw JRN string */
	readonly raw: string;
	/** Raw workspace string (orgId/spaceId) */
	readonly workspace: string;
	/** Organization identifier (optional, empty string if not provided) */
	readonly orgId: string;
	/** Space identifier (required) */
	readonly spaceId: string;
	/** Product subsystem */
	readonly service: JrnService;
}

/** Docs service - articles, files, folders, documents */
export interface ParsedDocsJrn extends ParsedJrnBase {
	readonly service: "docs";
	readonly resourceType: "article" | "file" | "folder" | "document";
	readonly resourceId: string;
	/** Parsed version number from qualifier "v/123" */
	readonly version?: number;
}

/** Base interface for all sources */
interface ParsedSourcesJrnBase extends ParsedJrnBase {
	readonly service: "sources";
	/** Source type discriminator (resourceType in JRN) */
	readonly sourceType: SourceType;
}

/** GitHub source - org/repo/branch */
export interface ParsedGithubSourceJrn extends ParsedSourcesJrnBase {
	readonly sourceType: "github";
	/** Organization name from qualifier */
	readonly org?: string;
	/** Repository name from qualifier */
	readonly repo?: string;
	/** Branch name from qualifier */
	readonly branch?: string;
}

/** Web source - URL */
export interface ParsedWebSourceJrn extends ParsedSourcesJrnBase {
	readonly sourceType: "web";
	/** URL from qualifier */
	readonly url?: string;
}

/** Sources service - discriminated union of source types */
export type ParsedSourcesJrn = ParsedGithubSourceJrn | ParsedWebSourceJrn;

/** Jobs service - job executions */
export interface ParsedJobsJrn extends ParsedJrnBase {
	readonly service: "jobs";
	readonly resourceType: "job";
	readonly resourceId: string;
}

/** Agents service */
export interface ParsedAgentsJrn extends ParsedJrnBase {
	readonly service: "agents";
	readonly resourceType: "agent";
	readonly resourceId: string;
}

/** Assets service - images, files */
export interface ParsedAssetsJrn extends ParsedJrnBase {
	readonly service: "assets";
	readonly resourceType: "image";
	readonly resourceId: string;
}

/** Spaces service - space containers */
export interface ParsedSpacesJrn extends ParsedJrnBase {
	readonly service: "spaces";
	readonly resourceType: "space";
	readonly resourceId: string;
}

/** Union type for all parsed JRNs */
export type ParsedJrn =
	| ParsedDocsJrn
	| ParsedSourcesJrn
	| ParsedJobsJrn
	| ParsedAgentsJrn
	| ParsedAssetsJrn
	| ParsedSpacesJrn;

// =============================================================================
// Parser Result Types
// =============================================================================

/** Parser result type - success or failure with error message */
export type JrnParseResult<T = ParsedJrn> = { success: true; value: T } | { success: false; error: string };

// =============================================================================
// V3 Path-based JRN Types
// =============================================================================

/**
 * V3 JRN type discriminator
 * Currently only "path" is supported, but this can be extended to support other types
 * (e.g., "query", "ref", etc.)
 */
export type JrnV3Type = "path";

/** V3 type marker constant - use this instead of hardcoding "path" */
export const JRN_V3_TYPE_PATH: JrnV3Type = "path";

/** Array of valid V3 types for validation */
export const VALID_JRN_V3_TYPES: ReadonlyArray<JrnV3Type> = ["path"];

/**
 * Base interface for all v3 parsed JRNs
 * V3 format: jrn:<controllingPath?>:path:<unix-path>[:qualifier]
 */
export interface ParsedJrnV3Base {
	/** Original raw JRN string */
	readonly raw: string;
	/** JRN version (always 3 for v3 JRNs) */
	readonly version: 3;
	/** The type of v3 JRN (currently only "path", extensible for future types) */
	readonly type: JrnV3Type;
	/** Optional controlling path (opaque string, can be empty) */
	readonly controllingPath: string;
	/** The unix-style path */
	readonly path: string;
	/** Organization ID extracted from path (from /home/{orgId}/...) */
	readonly orgId: string;
	/** Service type extracted from path */
	readonly service: JrnService;
}

/** V3 Docs service - articles, files, folders, documents */
export interface ParsedDocsJrnV3 extends ParsedJrnV3Base {
	readonly service: "docs";
	readonly resourceType: "article" | "file" | "folder" | "document";
	readonly resourceId: string;
	/** Parsed version number from qualifier "v/123" */
	readonly docVersion?: number;
}

/** V3 GitHub source */
export interface ParsedGithubSourceJrnV3 extends ParsedJrnV3Base {
	readonly service: "sources";
	readonly sourceType: "github";
	readonly org?: string;
	readonly repo?: string;
	readonly branch?: string;
}

/** V3 Web source */
export interface ParsedWebSourceJrnV3 extends ParsedJrnV3Base {
	readonly service: "sources";
	readonly sourceType: "web";
	readonly url?: string;
}

/** V3 Sources service - discriminated union */
export type ParsedSourcesJrnV3 = ParsedGithubSourceJrnV3 | ParsedWebSourceJrnV3;

/** V3 Jobs service */
export interface ParsedJobsJrnV3 extends ParsedJrnV3Base {
	readonly service: "jobs";
	readonly resourceType: "job";
	readonly resourceId: string;
}

/** V3 Agents service */
export interface ParsedAgentsJrnV3 extends ParsedJrnV3Base {
	readonly service: "agents";
	readonly resourceType: "agent";
	readonly resourceId: string;
}

/** V3 Assets service */
export interface ParsedAssetsJrnV3 extends ParsedJrnV3Base {
	readonly service: "assets";
	readonly resourceType: "image";
	readonly resourceId: string;
}

/** V3 Spaces service - space containers */
export interface ParsedSpacesJrnV3 extends ParsedJrnV3Base {
	readonly service: "spaces";
	readonly resourceType: "space";
	readonly resourceId: string;
}

/** Union type for all v3 parsed JRNs */
export type ParsedJrnV3 =
	| ParsedDocsJrnV3
	| ParsedSourcesJrnV3
	| ParsedJobsJrnV3
	| ParsedAgentsJrnV3
	| ParsedAssetsJrnV3
	| ParsedSpacesJrnV3;

/** Parser result type for v3 JRNs */
export type JrnV3ParseResult<T = ParsedJrnV3> = { success: true; value: T } | { success: false; error: string };
