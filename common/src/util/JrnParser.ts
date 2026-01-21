/**
 * JRN (Jolli Resource Name) Parser
 *
 * Supports both v2 and v3 JRN formats.
 *
 * V3 Format: jrn:<controllingPath?>:path:<unix-path>[:qualifier]
 * - controllingPath is optional and opaque (can be any string or empty)
 * - path is a unix-style path: /home/{orgId}/{service}/{resourceType}/{resourceId}
 *
 * V3 Examples:
 * - jrn::path:/home/org_01/sources/github/anthropics/claude-code/main
 * - jrn::path:/home/org_01/docs/article/art_01JXYZ:v/12
 * - jrn:ctrl:path:/home/org_01/docs/article/art_01JXYZ (with controlling path)
 *
 * V2 Format (legacy): jrn:{orgId}/{spaceId}:{service}:{resourceType}/{resourceId}[:qualifier]
 *
 * V2 Examples:
 * - jrn:/spc_01JABC:docs:article/art_01JXYZ (space only)
 * - jrn:org_01/spc_01:docs:article/art_01JXYZ:v/12 (full path)
 */

import {
	JRN_V3_TYPE_PATH,
	type JrnParseResult,
	type JrnService,
	type JrnV3ParseResult,
	type JrnV3Type,
	type ParsedAgentsJrn,
	type ParsedAgentsJrnV3,
	type ParsedAssetsJrn,
	type ParsedAssetsJrnV3,
	type ParsedDocsJrn,
	type ParsedDocsJrnV3,
	type ParsedGithubSourceJrn,
	type ParsedGithubSourceJrnV3,
	type ParsedJobsJrn,
	type ParsedJobsJrnV3,
	type ParsedJrn,
	type ParsedJrnBase,
	type ParsedJrnV3,
	type ParsedJrnV3Base,
	type ParsedSourcesJrn,
	type ParsedSourcesJrnV3,
	type ParsedSpacesJrn,
	type ParsedSpacesJrnV3,
	type ParsedWebSourceJrn,
	type ParsedWebSourceJrnV3,
	type SourceType,
	VALID_JRN_V3_TYPES,
} from "../types/Jrn";
import { matches as matchesJrn, matchesJrnPattern } from "./JrnMatcher";

// Re-export types and constants for convenience
export type {
	JrnParseResult,
	JrnService,
	JrnV3ParseResult,
	JrnV3Type,
	ParsedAgentsJrn,
	ParsedAgentsJrnV3,
	ParsedAssetsJrn,
	ParsedAssetsJrnV3,
	ParsedDocsJrn,
	ParsedDocsJrnV3,
	ParsedGithubSourceJrn,
	ParsedGithubSourceJrnV3,
	ParsedJobsJrn,
	ParsedJobsJrnV3,
	ParsedJrn,
	ParsedJrnBase,
	ParsedJrnV3,
	ParsedJrnV3Base,
	ParsedSourcesJrn,
	ParsedSourcesJrnV3,
	ParsedSpacesJrn,
	ParsedSpacesJrnV3,
	ParsedWebSourceJrn,
	ParsedWebSourceJrnV3,
	SourceType,
};

export { JRN_V3_TYPE_PATH, VALID_JRN_V3_TYPES };

/** Valid services as array for validation */
const VALID_SERVICES: ReadonlyArray<JrnService> = ["docs", "sources", "agents", "jobs", "assets", "spaces"];

// =============================================================================
// Internal Types
// =============================================================================

/** Parsed workspace components */
interface ParsedWorkspace {
	readonly workspace: string;
	readonly orgId: string;
	readonly spaceId: string;
}

/** Internal parsed base with resource suffix for subparsers */
interface InternalParsedBase {
	readonly raw: string;
	readonly workspace: string;
	readonly orgId: string;
	readonly spaceId: string;
	readonly service: JrnService;
	readonly resourceSuffix: string;
}

/** Validation result for individual tokens */
type TokenValidation = { valid: true } | { valid: false; error: string };

/** Subparser interface */
interface JrnSubparser<T extends ParsedJrnBase> {
	parse(base: InternalParsedBase): JrnParseResult<T>;
}

// =============================================================================
// Constants and Patterns
// =============================================================================

/** Fixed JRN prefix */
const JRN_PREFIX = "jrn";

/** Default spaceId when none is provided */
export const DEFAULT_SPACE_ID = "global";

/** Default workspace string (/global) when none is provided */
export const DEFAULT_WORKSPACE = `/${DEFAULT_SPACE_ID}`;

/** Root workspace for internal/system documents */
export const ROOT_WORKSPACE = "/root";

/** Regex for valid token characters (lowercase alphanumeric, dot, underscore, hyphen) */
const TOKEN_PATTERN = /^[a-z0-9._-]+$/;

/** Regex for workspace/resourceId (allows uppercase for case-sensitive IDs like ULIDs) */
const CASE_SENSITIVE_PATTERN = /^[a-zA-Z0-9._-]+$/;

// =============================================================================
// Validation Functions
// =============================================================================

function validateToken(value: string, fieldName: string): TokenValidation {
	if (!value) {
		return { valid: false, error: `${fieldName} is required` };
	}
	if (value.trim() !== value) {
		return { valid: false, error: `${fieldName} cannot have leading or trailing whitespace` };
	}
	if (!TOKEN_PATTERN.test(value)) {
		return {
			valid: false,
			error: `${fieldName} contains invalid characters (allowed: a-z, 0-9, ., _, -)`,
		};
	}
	return { valid: true };
}

function validateCaseSensitiveToken(value: string, fieldName: string): TokenValidation {
	if (!value) {
		return { valid: false, error: `${fieldName} is required` };
	}
	if (value.trim() !== value) {
		return { valid: false, error: `${fieldName} cannot have leading or trailing whitespace` };
	}
	if (!CASE_SENSITIVE_PATTERN.test(value)) {
		return {
			valid: false,
			error: `${fieldName} contains invalid characters (allowed: a-zA-Z, 0-9, ., _, -)`,
		};
	}
	return { valid: true };
}

/** Validate optional case-sensitive token (allows empty string) */
function validateOptionalCaseSensitiveToken(value: string, fieldName: string): TokenValidation {
	if (value === "") {
		return { valid: true };
	}
	return validateCaseSensitiveToken(value, fieldName);
}

function isValidService(service: string): service is JrnService {
	return VALID_SERVICES.includes(service as JrnService);
}

/**
 * Parse workspace string into org/space components
 * Format: {orgId}/{spaceId}
 * Examples:
 * - /spc_01 -> org="", space="spc_01"
 * - org_01/spc_01 -> org="org_01", space="spc_01"
 */
function parseWorkspace(workspace: string): JrnParseResult<ParsedWorkspace> {
	const parts = workspace.split("/");

	if (parts.length !== 2) {
		return {
			success: false,
			error: "workspace must have format {orgId}/{spaceId}",
		};
	}

	const [orgId, spaceId] = parts;

	// Validate org (optional)
	const orgValidation = validateOptionalCaseSensitiveToken(orgId, "orgId");
	if (!orgValidation.valid) {
		return { success: false, error: orgValidation.error };
	}

	// Validate space (required)
	const spaceValidation = validateCaseSensitiveToken(spaceId, "spaceId");
	if (!spaceValidation.valid) {
		return { success: false, error: spaceValidation.error };
	}

	return {
		success: true,
		value: {
			workspace,
			orgId,
			spaceId,
		},
	};
}

// =============================================================================
// Subparser Implementations
// =============================================================================

/** Docs service subparser */
const docsSubparser: JrnSubparser<ParsedDocsJrn> = {
	parse(base: InternalParsedBase): JrnParseResult<ParsedDocsJrn> {
		// Parse resourceSuffix: article/art_01JXYZ or article/art_01JXYZ:v/12
		const colonIndex = base.resourceSuffix.indexOf(":");
		const resourcePart = colonIndex === -1 ? base.resourceSuffix : base.resourceSuffix.slice(0, colonIndex);
		const qualifierPart = colonIndex === -1 ? "" : base.resourceSuffix.slice(colonIndex + 1);

		const slashIndex = resourcePart.indexOf("/");
		if (slashIndex === -1) {
			return { success: false, error: "Resource must be in format {resourceType}/{resourceId}" };
		}

		const resourceType = resourcePart.slice(0, slashIndex);
		const resourceId = resourcePart.slice(slashIndex + 1);

		// Validate resourceType
		const resourceTypeValidation = validateToken(resourceType, "resourceType");
		if (!resourceTypeValidation.valid) {
			return { success: false, error: resourceTypeValidation.error };
		}

		const VALID_DOCS_TYPES = ["article", "file", "folder", "document"];
		if (!VALID_DOCS_TYPES.includes(resourceType)) {
			return {
				success: false,
				error: `Invalid docs resourceType: ${resourceType} (expected: ${VALID_DOCS_TYPES.join(", ")})`,
			};
		}

		// Validate resourceId
		const resourceIdValidation = validateCaseSensitiveToken(resourceId, "resourceId");
		if (!resourceIdValidation.valid) {
			return { success: false, error: resourceIdValidation.error };
		}

		// Parse version from qualifier if present (format: v/123)
		let version: number | undefined;
		if (qualifierPart) {
			const versionMatch = qualifierPart.match(/^v\/(\d+)$/);
			if (versionMatch) {
				version = Number.parseInt(versionMatch[1], 10);
			}
		}

		const result: ParsedDocsJrn = {
			raw: base.raw,
			workspace: base.workspace,
			orgId: base.orgId,
			spaceId: base.spaceId,
			service: "docs",
			resourceType: resourceType as "article" | "file" | "folder" | "document",
			resourceId,
		};

		if (version !== undefined) {
			return { success: true, value: { ...result, version } };
		}
		return { success: true, value: result };
	},
};

/** Valid source types */
const VALID_SOURCE_TYPES: ReadonlyArray<SourceType> = ["github", "web"];

function isValidSourceType(sourceType: string): sourceType is SourceType {
	return VALID_SOURCE_TYPES.includes(sourceType as SourceType);
}

/** Sources service subparser - format: sources:{sourceType}/{qualifier} */
const sourcesSubparser: JrnSubparser<ParsedSourcesJrn> = {
	parse(base: InternalParsedBase): JrnParseResult<ParsedSourcesJrn> {
		// Parse resourceSuffix as sourceType/qualifier (e.g., "github/org/repo/branch")
		const slashIndex = base.resourceSuffix.indexOf("/");
		const sourceType = slashIndex === -1 ? base.resourceSuffix : base.resourceSuffix.slice(0, slashIndex);
		const qualifier = slashIndex === -1 ? "" : base.resourceSuffix.slice(slashIndex + 1);

		if (!isValidSourceType(sourceType)) {
			return {
				success: false,
				error: `Unknown source type: ${sourceType} (expected: ${VALID_SOURCE_TYPES.join(", ")})`,
			};
		}

		// Route to source-type-specific parsing
		if (sourceType === "github") {
			return parseGithubSource(base, qualifier);
		}
		return parseWebSource(base, qualifier);
	},
};

/** Parse GitHub source qualifier: org/repo/branch */
function parseGithubSource(base: InternalParsedBase, qualifier: string): JrnParseResult<ParsedGithubSourceJrn> {
	const result: ParsedGithubSourceJrn = {
		raw: base.raw,
		workspace: base.workspace,
		orgId: base.orgId,
		spaceId: base.spaceId,
		service: "sources",
		sourceType: "github",
	};

	if (!qualifier) {
		return { success: true, value: result };
	}

	const parts = qualifier.split("/");
	if (parts.length >= 3) {
		const org = parts[0];
		const repo = parts[1];
		const branch = parts.slice(2).join("/"); // branch may contain slashes
		return { success: true, value: { ...result, org, repo, branch } };
	}

	return { success: true, value: result };
}

/** Parse Web source qualifier: URL (everything after web/) */
function parseWebSource(base: InternalParsedBase, qualifier: string): JrnParseResult<ParsedWebSourceJrn> {
	const result: ParsedWebSourceJrn = {
		raw: base.raw,
		workspace: base.workspace,
		orgId: base.orgId,
		spaceId: base.spaceId,
		service: "sources",
		sourceType: "web",
	};

	if (!qualifier) {
		return { success: true, value: result };
	}

	return { success: true, value: { ...result, url: qualifier } };
}

/** Jobs service subparser */
const jobsSubparser: JrnSubparser<ParsedJobsJrn> = {
	parse(base: InternalParsedBase): JrnParseResult<ParsedJobsJrn> {
		// Parse resourceSuffix: job/job_01J999
		const slashIndex = base.resourceSuffix.indexOf("/");
		if (slashIndex === -1) {
			return { success: false, error: "Resource must be in format {resourceType}/{resourceId}" };
		}

		const resourceType = base.resourceSuffix.slice(0, slashIndex);
		const resourceId = base.resourceSuffix.slice(slashIndex + 1);

		// Validate resourceType
		if (resourceType !== "job") {
			return { success: false, error: `Invalid jobs resourceType: ${resourceType} (expected: job)` };
		}

		// Validate resourceId
		const resourceIdValidation = validateCaseSensitiveToken(resourceId, "resourceId");
		if (!resourceIdValidation.valid) {
			return { success: false, error: resourceIdValidation.error };
		}

		return {
			success: true,
			value: {
				raw: base.raw,
				workspace: base.workspace,
				orgId: base.orgId,
				spaceId: base.spaceId,
				service: "jobs",
				resourceType: "job",
				resourceId,
			},
		};
	},
};

/** Agents service subparser */
const agentsSubparser: JrnSubparser<ParsedAgentsJrn> = {
	parse(base: InternalParsedBase): JrnParseResult<ParsedAgentsJrn> {
		// Parse resourceSuffix: agent/agt_01J888
		const slashIndex = base.resourceSuffix.indexOf("/");
		if (slashIndex === -1) {
			return { success: false, error: "Resource must be in format {resourceType}/{resourceId}" };
		}

		const resourceType = base.resourceSuffix.slice(0, slashIndex);
		const resourceId = base.resourceSuffix.slice(slashIndex + 1);

		// Validate resourceType
		if (resourceType !== "agent") {
			return { success: false, error: `Invalid agents resourceType: ${resourceType} (expected: agent)` };
		}

		// Validate resourceId
		const resourceIdValidation = validateCaseSensitiveToken(resourceId, "resourceId");
		if (!resourceIdValidation.valid) {
			return { success: false, error: resourceIdValidation.error };
		}

		return {
			success: true,
			value: {
				raw: base.raw,
				workspace: base.workspace,
				orgId: base.orgId,
				spaceId: base.spaceId,
				service: "agents",
				resourceType: "agent",
				resourceId,
			},
		};
	},
};

/** Assets service subparser */
const assetsSubparser: JrnSubparser<ParsedAssetsJrn> = {
	parse(base: InternalParsedBase): JrnParseResult<ParsedAssetsJrn> {
		// Parse resourceSuffix: image/img_01JXYZ
		const slashIndex = base.resourceSuffix.indexOf("/");
		if (slashIndex === -1) {
			return { success: false, error: "Resource must be in format {resourceType}/{resourceId}" };
		}

		const resourceType = base.resourceSuffix.slice(0, slashIndex);
		const resourceId = base.resourceSuffix.slice(slashIndex + 1);

		// Validate resourceType
		if (resourceType !== "image") {
			return { success: false, error: `Invalid assets resourceType: ${resourceType} (expected: image)` };
		}

		// Validate resourceId
		const resourceIdValidation = validateCaseSensitiveToken(resourceId, "resourceId");
		if (!resourceIdValidation.valid) {
			return { success: false, error: resourceIdValidation.error };
		}

		return {
			success: true,
			value: {
				raw: base.raw,
				workspace: base.workspace,
				orgId: base.orgId,
				spaceId: base.spaceId,
				service: "assets",
				resourceType: "image",
				resourceId,
			},
		};
	},
};

/** Spaces service subparser */
const spacesSubparser: JrnSubparser<ParsedSpacesJrn> = {
	parse(base: InternalParsedBase): JrnParseResult<ParsedSpacesJrn> {
		// Parse resourceSuffix: space/my-space-slug
		const slashIndex = base.resourceSuffix.indexOf("/");
		if (slashIndex === -1) {
			return { success: false, error: "Resource must be in format {resourceType}/{resourceId}" };
		}

		const resourceType = base.resourceSuffix.slice(0, slashIndex);
		const resourceId = base.resourceSuffix.slice(slashIndex + 1);

		// Validate resourceType
		if (resourceType !== "space") {
			return { success: false, error: `Invalid spaces resourceType: ${resourceType} (expected: space)` };
		}

		// Validate resourceId
		const resourceIdValidation = validateCaseSensitiveToken(resourceId, "resourceId");
		if (!resourceIdValidation.valid) {
			return { success: false, error: resourceIdValidation.error };
		}

		return {
			success: true,
			value: {
				raw: base.raw,
				workspace: base.workspace,
				orgId: base.orgId,
				spaceId: base.spaceId,
				service: "spaces",
				resourceType: "space",
				resourceId,
			},
		};
	},
};

/** Subparser registry */
const subparsers: Record<JrnService, JrnSubparser<ParsedJrnBase>> = {
	docs: docsSubparser,
	sources: sourcesSubparser,
	jobs: jobsSubparser,
	agents: agentsSubparser,
	assets: assetsSubparser,
	spaces: spacesSubparser,
};

// =============================================================================
// JRN Parser Class
// =============================================================================

/**
 * JRN Parser class for parsing and building Jolli Resource Names
 */
export class JrnParser {
	/**
	 * Parse the base part of a JRN (up to and including service)
	 */
	private parseBase(jrn: string): JrnParseResult<InternalParsedBase> {
		if (!jrn || jrn.trim() === "") {
			return { success: false, error: "JRN cannot be empty" };
		}

		const parts = jrn.split(":");

		// Must have at least 4 parts: jrn, workspace, service, resource
		if (parts.length < 4) {
			return {
				success: false,
				error: "JRN must have format jrn:{orgId}/{spaceId}:{service}:{resourceType}/{resourceId}",
			};
		}

		const [prefix, workspace, service, ...rest] = parts;

		if (prefix !== JRN_PREFIX) {
			return { success: false, error: `JRN must start with "${JRN_PREFIX}:"` };
		}

		// Parse workspace into tenant/org/space
		const workspaceResult = parseWorkspace(workspace);
		if (!workspaceResult.success) {
			return { success: false, error: workspaceResult.error };
		}

		const serviceValidation = validateToken(service, "service");
		if (!serviceValidation.valid) {
			return { success: false, error: serviceValidation.error };
		}

		if (!isValidService(service)) {
			return { success: false, error: `Unknown service: ${service}` };
		}

		const resourceSuffix = rest.join(":");
		if (!resourceSuffix) {
			return { success: false, error: "Resource specification is required" };
		}

		return {
			success: true,
			value: {
				raw: jrn,
				workspace: workspaceResult.value.workspace,
				orgId: workspaceResult.value.orgId,
				spaceId: workspaceResult.value.spaceId,
				service,
				resourceSuffix,
			},
		};
	}

	/**
	 * Parse a JRN string into its component parts with service-specific semantics
	 */
	parse(jrn: string): JrnParseResult<ParsedJrn> {
		const baseResult = this.parseBase(jrn);
		if (!baseResult.success) {
			return baseResult;
		}

		const subparser = subparsers[baseResult.value.service];
		return subparser.parse(baseResult.value) as JrnParseResult<ParsedJrn>;
	}

	/**
	 * Build a workspace string from org/space components
	 * If workspace string is provided directly, use it; otherwise build from components
	 */
	private buildWorkspace(input: { workspace?: string; orgId?: string; spaceId?: string }): string {
		if (input.workspace) {
			return input.workspace;
		}
		const orgId = input.orgId ?? "";
		const spaceId = input.spaceId ?? DEFAULT_SPACE_ID;
		return `${orgId}/${spaceId}`;
	}

	/**
	 * Build a JRN string for docs service
	 */
	buildDocs(input: {
		workspace?: string;
		orgId?: string;
		spaceId?: string;
		resourceType: "article" | "file" | "folder" | "document";
		resourceId: string;
		version?: number;
	}): string {
		const workspace = this.buildWorkspace(input);
		const base = `${JRN_PREFIX}:${workspace}:docs:${input.resourceType}/${input.resourceId}`;
		return input.version !== undefined ? `${base}:v/${input.version}` : base;
	}

	/**
	 * Build a JRN string for GitHub source
	 */
	buildGithubSource(input: {
		workspace?: string;
		orgId?: string;
		spaceId?: string;
		org?: string;
		repo?: string;
		branch?: string;
	}): string {
		const workspace = this.buildWorkspace(input);
		const base = `${JRN_PREFIX}:${workspace}:sources:github`;
		if (input.org && input.repo && input.branch) {
			return `${base}/${input.org}/${input.repo}/${input.branch}`;
		}
		return base;
	}

	/**
	 * Build a JRN string for web source
	 */
	buildWebSource(input: { workspace?: string; orgId?: string; spaceId?: string; url?: string }): string {
		const workspace = this.buildWorkspace(input);
		const base = `${JRN_PREFIX}:${workspace}:sources:web`;
		if (input.url) {
			return `${base}/${input.url}`;
		}
		return base;
	}

	/**
	 * Build a JRN string for jobs service
	 */
	buildJobs(input: { workspace?: string; orgId?: string; spaceId?: string; resourceId: string }): string {
		const workspace = this.buildWorkspace(input);
		return `${JRN_PREFIX}:${workspace}:jobs:job/${input.resourceId}`;
	}

	/**
	 * Build a JRN string for agents service
	 */
	buildAgents(input: { workspace?: string; orgId?: string; spaceId?: string; resourceId: string }): string {
		const workspace = this.buildWorkspace(input);
		return `${JRN_PREFIX}:${workspace}:agents:agent/${input.resourceId}`;
	}

	/**
	 * Build a JRN string for assets service
	 */
	buildAssets(input: { workspace?: string; orgId?: string; spaceId?: string; resourceId: string }): string {
		const workspace = this.buildWorkspace(input);
		return `${JRN_PREFIX}:${workspace}:assets:image/${input.resourceId}`;
	}

	/**
	 * Build a JRN string for spaces service
	 */
	buildSpaces(input: { workspace?: string; orgId?: string; spaceId?: string; resourceId: string }): string {
		const workspace = this.buildWorkspace(input);
		return `${JRN_PREFIX}:${workspace}:spaces:space/${input.resourceId}`;
	}

	// =========================================================================
	// Type Guards
	// =========================================================================

	/** Check if parsed JRN is for docs service */
	isDocs(parsed: ParsedJrn): parsed is ParsedDocsJrn {
		return parsed.service === "docs";
	}

	/** Check if parsed JRN is for sources service */
	isSources(parsed: ParsedJrn): parsed is ParsedSourcesJrn {
		return parsed.service === "sources";
	}

	/** Check if parsed sources JRN is for GitHub */
	isGithubSource(parsed: ParsedSourcesJrn): parsed is ParsedGithubSourceJrn {
		return parsed.sourceType === "github";
	}

	/** Check if parsed sources JRN is for web */
	isWebSource(parsed: ParsedSourcesJrn): parsed is ParsedWebSourceJrn {
		return parsed.sourceType === "web";
	}

	/** Check if parsed JRN is for jobs service */
	isJob(parsed: ParsedJrn): parsed is ParsedJobsJrn {
		return parsed.service === "jobs";
	}

	/** Check if parsed JRN is for agents service */
	isAgents(parsed: ParsedJrn): parsed is ParsedAgentsJrn {
		return parsed.service === "agents";
	}

	/** Check if parsed JRN is for assets service */
	isAssets(parsed: ParsedJrn): parsed is ParsedAssetsJrn {
		return parsed.service === "assets";
	}

	/** Check if parsed JRN is for spaces service */
	isSpaces(parsed: ParsedJrn): parsed is ParsedSpacesJrn {
		return parsed.service === "spaces";
	}

	// =========================================================================
	// Convenience Factory Methods
	// =========================================================================

	/**
	 * Build a JRN for an article
	 * @param id - The article resource ID (will be normalized: lowercase, spaces to hyphens)
	 * @param options - Optional workspace components and version
	 */
	article(id: string, options?: { workspace?: string; orgId?: string; spaceId?: string; version?: number }): string {
		const normalizedId = id.toLowerCase().replace(/\s+/g, "-");
		return this.buildDocs({
			...(options?.workspace && { workspace: options.workspace }),
			...(options?.orgId && { orgId: options.orgId }),
			...(options?.spaceId && { spaceId: options.spaceId }),
			resourceType: "article",
			resourceId: normalizedId,
			...(options?.version !== undefined && { version: options.version }),
		});
	}

	/**
	 * Build a JRN for a folder
	 * @param slug - The folder's slug (URL-friendly identifier)
	 */
	folder(slug: string, options?: { workspace?: string; orgId?: string; spaceId?: string }): string {
		return this.buildDocs({
			...(options?.workspace && { workspace: options.workspace }),
			...(options?.orgId && { orgId: options.orgId }),
			...(options?.spaceId && { spaceId: options.spaceId }),
			resourceType: "folder",
			resourceId: slug,
		});
	}

	/**
	 * Build a JRN for a document
	 * @param slug - The document's slug (URL-friendly identifier)
	 */
	document(slug: string, options?: { workspace?: string; orgId?: string; spaceId?: string }): string {
		return this.buildDocs({
			...(options?.workspace && { workspace: options.workspace }),
			...(options?.orgId && { orgId: options.orgId }),
			...(options?.spaceId && { spaceId: options.spaceId }),
			resourceType: "document",
			resourceId: slug,
		});
	}

	/**
	 * Build a JRN for a GitHub source
	 * @param options - Optional workspace components, org, repo, and branch
	 */
	githubSource(options?: {
		workspace?: string;
		orgId?: string;
		spaceId?: string;
		org?: string;
		repo?: string;
		branch?: string;
	}): string {
		return this.buildGithubSource({
			...(options?.workspace && { workspace: options.workspace }),
			...(options?.orgId && { orgId: options.orgId }),
			...(options?.spaceId && { spaceId: options.spaceId }),
			...(options?.org && { org: options.org }),
			...(options?.repo && { repo: options.repo }),
			...(options?.branch && { branch: options.branch }),
		});
	}

	/**
	 * Build a JRN for a web source
	 * @param options - Optional workspace components and url
	 */
	webSource(options?: { workspace?: string; orgId?: string; spaceId?: string; url?: string }): string {
		return this.buildWebSource({
			...(options?.workspace && { workspace: options.workspace }),
			...(options?.orgId && { orgId: options.orgId }),
			...(options?.spaceId && { spaceId: options.spaceId }),
			...(options?.url && { url: options.url }),
		});
	}

	/**
	 * Build a JRN for an agent
	 * @param id - The agent resource ID
	 * @param options - Optional workspace components
	 */
	agent(id: string, options?: { workspace?: string; orgId?: string; spaceId?: string }): string {
		return this.buildAgents({
			...(options?.workspace && { workspace: options.workspace }),
			...(options?.orgId && { orgId: options.orgId }),
			...(options?.spaceId && { spaceId: options.spaceId }),
			resourceId: id,
		});
	}

	/**
	 * Build a JRN for a job
	 * @param id - The job resource ID
	 * @param options - Optional workspace components
	 */
	job(id: string, options?: { workspace?: string; orgId?: string; spaceId?: string }): string {
		return this.buildJobs({
			...(options?.workspace && { workspace: options.workspace }),
			...(options?.orgId && { orgId: options.orgId }),
			...(options?.spaceId && { spaceId: options.spaceId }),
			resourceId: id,
		});
	}

	/**
	 * Build a JRN for an image asset
	 * @param id - The image resource ID
	 * @param options - Optional workspace components
	 */
	image(id: string, options?: { workspace?: string; orgId?: string; spaceId?: string }): string {
		return this.buildAssets({
			...(options?.workspace && { workspace: options.workspace }),
			...(options?.orgId && { orgId: options.orgId }),
			...(options?.spaceId && { spaceId: options.spaceId }),
			resourceId: id,
		});
	}

	/**
	 * Build a JRN for a space
	 * @param slug - The space's slug (URL-friendly identifier)
	 * @param options - Optional workspace components
	 */
	space(slug: string, options?: { workspace?: string; orgId?: string; spaceId?: string }): string {
		return this.buildSpaces({
			...(options?.workspace && { workspace: options.workspace }),
			...(options?.orgId && { orgId: options.orgId }),
			...(options?.spaceId && { spaceId: options.spaceId }),
			resourceId: slug,
		});
	}

	/**
	 * Check if a JRN matches a pattern with wildcard support
	 *
	 * Pattern format: jrn:{orgId}/{spaceId}:{service}:{resourcePath}
	 *
	 * Wildcards:
	 * - * matches any single segment (workspace component, service, or single path segment)
	 * - ** matches zero or more path segments in the resource path
	 *
	 * Missing segments in the pattern default to * (wildcard)
	 *
	 * Examples:
	 * - jrn:*:sources:github/** matches any github source
	 * - jrn:org_01/*:sources:github/myorg/*\/* matches any repo/branch under myorg
	 * - jrn:*:sources:github/org/repo/main matches exact repo/branch in any workspace
	 *
	 * @param jrn - The actual JRN string to test
	 * @param pattern - The pattern to match against
	 * @returns true if the JRN matches the pattern
	 */
	matches(jrn: string, pattern: string): boolean {
		return matchesJrnPattern(jrn, pattern);
	}
}

/** Singleton instance */
export const jrnParser = new JrnParser();

// Re-export matches from JrnMatcher for convenience
export { matchesJrn as matches };

// =============================================================================
// V3 Parser Implementation
// =============================================================================

/** Helper function to check if a string is a valid v3 type */
function isValidV3Type(value: string): value is JrnV3Type {
	return VALID_JRN_V3_TYPES.includes(value as JrnV3Type);
}

/**
 * Internal parsed base for v3 subparsers
 */
interface InternalParsedV3Base {
	readonly raw: string;
	readonly type: JrnV3Type;
	readonly controllingPath: string;
	readonly path: string;
	readonly orgId: string;
	readonly service: JrnService;
	/** The remaining path segments after /home/{orgId}/{service}/ */
	readonly resourceSegments: ReadonlyArray<string>;
	/** Qualifier if present (e.g., "v/12") */
	readonly qualifier: string;
}

/** V3 Subparser interface */
interface JrnV3Subparser<T extends ParsedJrnV3Base> {
	parse(base: InternalParsedV3Base): JrnV3ParseResult<T>;
}

// =============================================================================
// V3 Subparser Implementations
// =============================================================================

/** V3 Docs service subparser */
const docsV3Subparser: JrnV3Subparser<ParsedDocsJrnV3> = {
	parse(base: InternalParsedV3Base): JrnV3ParseResult<ParsedDocsJrnV3> {
		// Expected format: /home/{orgId}/docs/{resourceType}/{resourceId}
		// resourceSegments should be: [resourceType, resourceId]
		if (base.resourceSegments.length < 2) {
			return { success: false, error: "V3 docs path must have resourceType and resourceId" };
		}

		const [resourceType, resourceId] = base.resourceSegments;

		const VALID_DOCS_TYPES = ["article", "file", "folder", "document"];
		if (!VALID_DOCS_TYPES.includes(resourceType)) {
			return {
				success: false,
				error: `Invalid docs resourceType: ${resourceType} (expected: ${VALID_DOCS_TYPES.join(", ")})`,
			};
		}

		// Parse version from qualifier if present (format: v/123)
		let docVersion: number | undefined;
		if (base.qualifier) {
			const versionMatch = base.qualifier.match(/^v\/(\d+)$/);
			if (versionMatch) {
				docVersion = Number.parseInt(versionMatch[1], 10);
			}
		}

		const result: ParsedDocsJrnV3 = {
			raw: base.raw,
			version: 3,
			type: base.type,
			controllingPath: base.controllingPath,
			path: base.path,
			orgId: base.orgId,
			service: "docs",
			resourceType: resourceType as "article" | "file" | "folder" | "document",
			resourceId,
		};

		if (docVersion !== undefined) {
			return { success: true, value: { ...result, docVersion } };
		}
		return { success: true, value: result };
	},
};

/** V3 Sources service subparser */
const sourcesV3Subparser: JrnV3Subparser<ParsedSourcesJrnV3> = {
	parse(base: InternalParsedV3Base): JrnV3ParseResult<ParsedSourcesJrnV3> {
		// Expected format: /home/{orgId}/sources/{sourceType}/{...rest}
		// resourceSegments should be: [sourceType, ...sourceSpecificParts]
		if (base.resourceSegments.length < 1) {
			return { success: false, error: "V3 sources path must have sourceType" };
		}

		const [sourceType, ...rest] = base.resourceSegments;

		if (sourceType === "github") {
			return parseGithubV3Source(base, rest);
		}
		if (sourceType === "web") {
			return parseWebV3Source(base, rest);
		}

		return {
			success: false,
			error: `Unknown source type: ${sourceType} (expected: github, web)`,
		};
	},
};

/** Parse v3 GitHub source */
function parseGithubV3Source(
	base: InternalParsedV3Base,
	parts: ReadonlyArray<string>,
): JrnV3ParseResult<ParsedGithubSourceJrnV3> {
	const result: ParsedGithubSourceJrnV3 = {
		raw: base.raw,
		version: 3,
		type: base.type,
		controllingPath: base.controllingPath,
		path: base.path,
		orgId: base.orgId,
		service: "sources",
		sourceType: "github",
	};

	if (parts.length >= 3) {
		const org = parts[0];
		const repo = parts[1];
		const branch = parts.slice(2).join("/");
		return { success: true, value: { ...result, org, repo, branch } };
	}

	return { success: true, value: result };
}

/** Parse v3 Web source */
function parseWebV3Source(
	base: InternalParsedV3Base,
	_parts: ReadonlyArray<string>,
): JrnV3ParseResult<ParsedWebSourceJrnV3> {
	const result: ParsedWebSourceJrnV3 = {
		raw: base.raw,
		version: 3,
		type: base.type,
		controllingPath: base.controllingPath,
		path: base.path,
		orgId: base.orgId,
		service: "sources",
		sourceType: "web",
	};

	// Extract URL directly from path to preserve :// in URLs
	// Path format: /home/{orgId}/sources/web/{url}
	const webPrefix = `/home/${base.orgId}/sources/web/`;
	if (base.path.startsWith(webPrefix) && base.path.length > webPrefix.length) {
		const url = base.path.slice(webPrefix.length);
		return { success: true, value: { ...result, url } };
	}

	return { success: true, value: result };
}

/** V3 Jobs service subparser */
const jobsV3Subparser: JrnV3Subparser<ParsedJobsJrnV3> = {
	parse(base: InternalParsedV3Base): JrnV3ParseResult<ParsedJobsJrnV3> {
		// Expected format: /home/{orgId}/jobs/{resourceType}/{resourceId}
		if (base.resourceSegments.length < 2) {
			return { success: false, error: "V3 jobs path must have resourceType and resourceId" };
		}

		const [resourceType, resourceId] = base.resourceSegments;

		if (resourceType !== "job") {
			return { success: false, error: `Invalid jobs resourceType: ${resourceType} (expected: job)` };
		}

		return {
			success: true,
			value: {
				raw: base.raw,
				version: 3,
				type: base.type,
				controllingPath: base.controllingPath,
				path: base.path,
				orgId: base.orgId,
				service: "jobs",
				resourceType: "job",
				resourceId,
			},
		};
	},
};

/** V3 Agents service subparser */
const agentsV3Subparser: JrnV3Subparser<ParsedAgentsJrnV3> = {
	parse(base: InternalParsedV3Base): JrnV3ParseResult<ParsedAgentsJrnV3> {
		// Expected format: /home/{orgId}/agents/{resourceType}/{resourceId}
		if (base.resourceSegments.length < 2) {
			return { success: false, error: "V3 agents path must have resourceType and resourceId" };
		}

		const [resourceType, resourceId] = base.resourceSegments;

		if (resourceType !== "agent") {
			return { success: false, error: `Invalid agents resourceType: ${resourceType} (expected: agent)` };
		}

		return {
			success: true,
			value: {
				raw: base.raw,
				version: 3,
				type: base.type,
				controllingPath: base.controllingPath,
				path: base.path,
				orgId: base.orgId,
				service: "agents",
				resourceType: "agent",
				resourceId,
			},
		};
	},
};

/** V3 Assets service subparser */
const assetsV3Subparser: JrnV3Subparser<ParsedAssetsJrnV3> = {
	parse(base: InternalParsedV3Base): JrnV3ParseResult<ParsedAssetsJrnV3> {
		// Expected format: /home/{orgId}/assets/{resourceType}/{resourceId}
		if (base.resourceSegments.length < 2) {
			return { success: false, error: "V3 assets path must have resourceType and resourceId" };
		}

		const [resourceType, resourceId] = base.resourceSegments;

		if (resourceType !== "image") {
			return { success: false, error: `Invalid assets resourceType: ${resourceType} (expected: image)` };
		}

		return {
			success: true,
			value: {
				raw: base.raw,
				version: 3,
				type: base.type,
				controllingPath: base.controllingPath,
				path: base.path,
				orgId: base.orgId,
				service: "assets",
				resourceType: "image",
				resourceId,
			},
		};
	},
};

/** V3 Spaces service subparser */
const spacesV3Subparser: JrnV3Subparser<ParsedSpacesJrnV3> = {
	parse(base: InternalParsedV3Base): JrnV3ParseResult<ParsedSpacesJrnV3> {
		// Expected format: /home/{orgId}/spaces/{resourceType}/{resourceId}
		if (base.resourceSegments.length < 2) {
			return { success: false, error: "V3 spaces path must have resourceType and resourceId" };
		}

		const [resourceType, resourceId] = base.resourceSegments;

		if (resourceType !== "space") {
			return { success: false, error: `Invalid spaces resourceType: ${resourceType} (expected: space)` };
		}

		return {
			success: true,
			value: {
				raw: base.raw,
				version: 3,
				type: base.type,
				controllingPath: base.controllingPath,
				path: base.path,
				orgId: base.orgId,
				service: "spaces",
				resourceType: "space",
				resourceId,
			},
		};
	},
};

/** V3 Subparser registry */
const v3Subparsers: Record<JrnService, JrnV3Subparser<ParsedJrnV3Base>> = {
	docs: docsV3Subparser,
	sources: sourcesV3Subparser,
	jobs: jobsV3Subparser,
	agents: agentsV3Subparser,
	assets: assetsV3Subparser,
	spaces: spacesV3Subparser,
};

// =============================================================================
// JRN V3 Parser Class
// =============================================================================

/**
 * JRN V3 Parser class for parsing and building v3 path-based Jolli Resource Names
 *
 * V3 Format: jrn:<controllingPath?>:path:<unix-path>[:qualifier]
 */
export class JrnParserV3 {
	/**
	 * Check if a JRN string is v3 format
	 */
	isV3(jrn: string): boolean {
		if (!jrn.startsWith("jrn:")) {
			return false;
		}
		// V3 format has a valid v3 type marker (e.g., "path") as the second segment
		// jrn:<controllingPath?>:path:<path>
		const parts = jrn.slice(4).split(":");
		return parts.length >= 2 && isValidV3Type(parts[1]);
	}

	/**
	 * Parse a v3 JRN string
	 */
	parse(jrn: string): JrnV3ParseResult<ParsedJrnV3> {
		if (!jrn || jrn.trim() === "") {
			return { success: false, error: "JRN cannot be empty" };
		}

		if (!jrn.startsWith("jrn:")) {
			return { success: false, error: 'JRN must start with "jrn:"' };
		}

		const afterPrefix = jrn.slice(4);
		const parts = afterPrefix.split(":");

		// Minimum: controllingPath (can be empty), type (e.g., "path"), path, so at least 3 parts
		// jrn::path:/home/org/... -> ["", "path", "/home/org/..."]
		// jrn:ctrl:path:/home/org/... -> ["ctrl", "path", "/home/org/..."]
		if (parts.length < 3) {
			return {
				success: false,
				error: "V3 JRN must have format jrn:<controllingPath?>:<type>:<path>",
			};
		}

		const controllingPath = parts[0];
		const typeMarker = parts[1];

		if (!isValidV3Type(typeMarker)) {
			return {
				success: false,
				error: `V3 JRN must have a valid type as second segment (valid: ${VALID_JRN_V3_TYPES.join(", ")}), got "${typeMarker}"`,
			};
		}

		// The path and optional qualifier come after
		// parts[2+] is the path with possible qualifier at the end
		// Need to handle URLs that contain : (e.g., https://example.com)
		// Path starts with /home/ so we look for the qualifier pattern after the path
		const remainingParts = parts.slice(2).join(":");

		// Find the qualifier (e.g., :v/12) - it comes after the path
		// Qualifier pattern is :v/\d+ at the end
		const qualifierMatch = remainingParts.match(/:v\/\d+$/);
		let pathPart: string;
		let qualifier: string;

		if (qualifierMatch) {
			pathPart = remainingParts.slice(0, -qualifierMatch[0].length);
			qualifier = qualifierMatch[0].slice(1); // Remove leading :
		} else {
			pathPart = remainingParts;
			qualifier = "";
		}

		if (!pathPart.startsWith("/home/")) {
			return {
				success: false,
				error: 'V3 path must start with "/home/"',
			};
		}

		// Parse the path: /home/{orgId}/{service}/{...resourcePath}
		const pathSegments = pathPart.split("/").filter(s => s !== "");
		// pathSegments: ["home", orgId, service, ...resourceSegments]

		if (pathSegments.length < 3) {
			return {
				success: false,
				error: "V3 path must have at least /home/{orgId}/{service}",
			};
		}

		const [, orgId, serviceName, ...resourceSegments] = pathSegments;

		if (!isValidService(serviceName)) {
			return { success: false, error: `Unknown service: ${serviceName}` };
		}

		const base: InternalParsedV3Base = {
			raw: jrn,
			type: typeMarker,
			controllingPath,
			path: pathPart,
			orgId,
			service: serviceName,
			resourceSegments,
			qualifier,
		};

		const subparser = v3Subparsers[serviceName];
		return subparser.parse(base) as JrnV3ParseResult<ParsedJrnV3>;
	}

	// =========================================================================
	// Build Methods
	// =========================================================================

	/**
	 * Build a v3 JRN for docs service
	 */
	buildDocs(input: {
		controllingPath?: string;
		orgId: string;
		resourceType: "article" | "file" | "folder" | "document";
		resourceId: string;
		docVersion?: number;
	}): string {
		const ctrl = input.controllingPath ?? "";
		const path = `/home/${input.orgId}/docs/${input.resourceType}/${input.resourceId}`;
		const base = `jrn:${ctrl}:${JRN_V3_TYPE_PATH}:${path}`;
		return input.docVersion !== undefined ? `${base}:v/${input.docVersion}` : base;
	}

	/**
	 * Build a v3 JRN for GitHub source
	 */
	buildGithubSource(input: {
		controllingPath?: string;
		orgId: string;
		org?: string;
		repo?: string;
		branch?: string;
	}): string {
		const ctrl = input.controllingPath ?? "";
		let path = `/home/${input.orgId}/sources/github`;
		if (input.org && input.repo && input.branch) {
			path = `${path}/${input.org}/${input.repo}/${input.branch}`;
		}
		return `jrn:${ctrl}:${JRN_V3_TYPE_PATH}:${path}`;
	}

	/**
	 * Build a v3 JRN for web source
	 */
	buildWebSource(input: { controllingPath?: string; orgId: string; url?: string }): string {
		const ctrl = input.controllingPath ?? "";
		let path = `/home/${input.orgId}/sources/web`;
		if (input.url) {
			path = `${path}/${input.url}`;
		}
		return `jrn:${ctrl}:${JRN_V3_TYPE_PATH}:${path}`;
	}

	/**
	 * Build a v3 JRN for jobs service
	 */
	buildJobs(input: { controllingPath?: string; orgId: string; resourceId: string }): string {
		const ctrl = input.controllingPath ?? "";
		const path = `/home/${input.orgId}/jobs/job/${input.resourceId}`;
		return `jrn:${ctrl}:${JRN_V3_TYPE_PATH}:${path}`;
	}

	/**
	 * Build a v3 JRN for agents service
	 */
	buildAgents(input: { controllingPath?: string; orgId: string; resourceId: string }): string {
		const ctrl = input.controllingPath ?? "";
		const path = `/home/${input.orgId}/agents/agent/${input.resourceId}`;
		return `jrn:${ctrl}:${JRN_V3_TYPE_PATH}:${path}`;
	}

	/**
	 * Build a v3 JRN for assets service
	 */
	buildAssets(input: { controllingPath?: string; orgId: string; resourceId: string }): string {
		const ctrl = input.controllingPath ?? "";
		const path = `/home/${input.orgId}/assets/image/${input.resourceId}`;
		return `jrn:${ctrl}:${JRN_V3_TYPE_PATH}:${path}`;
	}

	/**
	 * Build a v3 JRN for spaces service
	 */
	buildSpaces(input: { controllingPath?: string; orgId: string; resourceId: string }): string {
		const ctrl = input.controllingPath ?? "";
		const path = `/home/${input.orgId}/spaces/space/${input.resourceId}`;
		return `jrn:${ctrl}:${JRN_V3_TYPE_PATH}:${path}`;
	}

	// =========================================================================
	// Convenience Factory Methods
	// =========================================================================

	/**
	 * Build a v3 JRN for an article
	 */
	article(id: string, options: { controllingPath?: string; orgId: string; docVersion?: number }): string {
		const normalizedId = id.toLowerCase().replace(/\s+/g, "-");
		return this.buildDocs({
			...(options.controllingPath !== undefined && { controllingPath: options.controllingPath }),
			orgId: options.orgId,
			resourceType: "article",
			resourceId: normalizedId,
			...(options.docVersion !== undefined && { docVersion: options.docVersion }),
		});
	}

	/**
	 * Build a v3 JRN for a folder
	 * @param slug - The folder's slug (URL-friendly identifier)
	 */
	folder(slug: string, options: { controllingPath?: string; orgId: string }): string {
		return this.buildDocs({
			...(options.controllingPath !== undefined && { controllingPath: options.controllingPath }),
			orgId: options.orgId,
			resourceType: "folder",
			resourceId: slug,
		});
	}

	/**
	 * Build a v3 JRN for a document
	 * @param slug - The document's slug (URL-friendly identifier)
	 */
	document(slug: string, options: { controllingPath?: string; orgId: string }): string {
		return this.buildDocs({
			...(options.controllingPath !== undefined && { controllingPath: options.controllingPath }),
			orgId: options.orgId,
			resourceType: "document",
			resourceId: slug,
		});
	}

	/**
	 * Build a v3 JRN for a GitHub source
	 */
	githubSource(options: {
		controllingPath?: string;
		orgId: string;
		org?: string;
		repo?: string;
		branch?: string;
	}): string {
		return this.buildGithubSource(options);
	}

	/**
	 * Build a v3 JRN for a web source
	 */
	webSource(options: { controllingPath?: string; orgId: string; url?: string }): string {
		return this.buildWebSource(options);
	}

	/**
	 * Build a v3 JRN for an agent
	 */
	agent(id: string, options: { controllingPath?: string; orgId: string }): string {
		return this.buildAgents({
			...(options.controllingPath !== undefined && { controllingPath: options.controllingPath }),
			orgId: options.orgId,
			resourceId: id,
		});
	}

	/**
	 * Build a v3 JRN for a job
	 */
	job(id: string, options: { controllingPath?: string; orgId: string }): string {
		return this.buildJobs({
			...(options.controllingPath !== undefined && { controllingPath: options.controllingPath }),
			orgId: options.orgId,
			resourceId: id,
		});
	}

	/**
	 * Build a v3 JRN for an image asset
	 */
	image(id: string, options: { controllingPath?: string; orgId: string }): string {
		return this.buildAssets({
			...(options.controllingPath !== undefined && { controllingPath: options.controllingPath }),
			orgId: options.orgId,
			resourceId: id,
		});
	}

	/**
	 * Build a v3 JRN for a space
	 * @param slug - The space's slug (URL-friendly identifier)
	 */
	space(slug: string, options: { controllingPath?: string; orgId: string }): string {
		return this.buildSpaces({
			...(options.controllingPath !== undefined && { controllingPath: options.controllingPath }),
			orgId: options.orgId,
			resourceId: slug,
		});
	}

	// =========================================================================
	// Type Guards
	// =========================================================================

	/** Check if parsed v3 JRN is for docs service */
	isDocs(parsed: ParsedJrnV3): parsed is ParsedDocsJrnV3 {
		return parsed.service === "docs";
	}

	/** Check if parsed v3 JRN is for sources service */
	isSources(parsed: ParsedJrnV3): parsed is ParsedSourcesJrnV3 {
		return parsed.service === "sources";
	}

	/** Check if parsed v3 sources JRN is for GitHub */
	isGithubSource(parsed: ParsedSourcesJrnV3): parsed is ParsedGithubSourceJrnV3 {
		return parsed.sourceType === "github";
	}

	/** Check if parsed v3 sources JRN is for web */
	isWebSource(parsed: ParsedSourcesJrnV3): parsed is ParsedWebSourceJrnV3 {
		return parsed.sourceType === "web";
	}

	/** Check if parsed v3 JRN is for jobs service */
	isJob(parsed: ParsedJrnV3): parsed is ParsedJobsJrnV3 {
		return parsed.service === "jobs";
	}

	/** Check if parsed v3 JRN is for agents service */
	isAgents(parsed: ParsedJrnV3): parsed is ParsedAgentsJrnV3 {
		return parsed.service === "agents";
	}

	/** Check if parsed v3 JRN is for assets service */
	isAssets(parsed: ParsedJrnV3): parsed is ParsedAssetsJrnV3 {
		return parsed.service === "assets";
	}

	/** Check if parsed v3 JRN is for spaces service */
	isSpaces(parsed: ParsedJrnV3): parsed is ParsedSpacesJrnV3 {
		return parsed.service === "spaces";
	}
}

/** Singleton instance for v3 parser */
export const jrnParserV3 = new JrnParserV3();

// =============================================================================
// V2 to V3 Conversion Functions
// =============================================================================

/**
 * Convert a v2 JRN string to v3 format
 * Uses orgId from v2 workspace, or "global" if not specified
 */
export function convertV2ToV3(v2Jrn: string): string {
	const result = jrnParser.parse(v2Jrn);
	if (!result.success) {
		throw new Error(`Failed to parse v2 JRN: ${result.error}`);
	}

	const parsed = result.value;
	const orgId = parsed.orgId || parsed.spaceId;

	if (jrnParser.isDocs(parsed)) {
		return jrnParserV3.buildDocs({
			orgId,
			resourceType: parsed.resourceType,
			resourceId: parsed.resourceId,
			...(parsed.version !== undefined && { docVersion: parsed.version }),
		});
	}

	if (jrnParser.isSources(parsed)) {
		if (jrnParser.isGithubSource(parsed)) {
			return jrnParserV3.buildGithubSource({
				orgId,
				...(parsed.org !== undefined && { org: parsed.org }),
				...(parsed.repo !== undefined && { repo: parsed.repo }),
				...(parsed.branch !== undefined && { branch: parsed.branch }),
			});
		}
		if (jrnParser.isWebSource(parsed)) {
			return jrnParserV3.buildWebSource({
				orgId,
				...(parsed.url !== undefined && { url: parsed.url }),
			});
		}
	}

	if (jrnParser.isJob(parsed)) {
		return jrnParserV3.buildJobs({
			orgId,
			resourceId: parsed.resourceId,
		});
	}

	if (jrnParser.isAgents(parsed)) {
		return jrnParserV3.buildAgents({
			orgId,
			resourceId: parsed.resourceId,
		});
	}

	if (jrnParser.isAssets(parsed)) {
		return jrnParserV3.buildAssets({
			orgId,
			resourceId: parsed.resourceId,
		});
	}

	// At this point, we've checked docs, sources, jobs, agents, assets - only spaces remain
	// The parser validates services upfront, so this must be spaces
	return jrnParserV3.buildSpaces({
		orgId,
		resourceId: (parsed as { resourceId: string }).resourceId,
	});
}

/**
 * Convert a v3 JRN string to v2 format
 * Note: v3 doesn't have spaceId, so we use orgId for both orgId and spaceId
 */
export function convertV3ToV2(v3Jrn: string): string {
	const result = jrnParserV3.parse(v3Jrn);
	if (!result.success) {
		throw new Error(`Failed to parse v3 JRN: ${result.error}`);
	}

	const parsed = result.value;
	const workspace = `/${parsed.orgId}`;

	if (jrnParserV3.isDocs(parsed)) {
		return jrnParser.buildDocs({
			workspace,
			resourceType: parsed.resourceType,
			resourceId: parsed.resourceId,
			...(parsed.docVersion !== undefined && { version: parsed.docVersion }),
		});
	}

	if (jrnParserV3.isSources(parsed)) {
		if (jrnParserV3.isGithubSource(parsed)) {
			return jrnParser.buildGithubSource({
				workspace,
				...(parsed.org !== undefined && { org: parsed.org }),
				...(parsed.repo !== undefined && { repo: parsed.repo }),
				...(parsed.branch !== undefined && { branch: parsed.branch }),
			});
		}
		if (jrnParserV3.isWebSource(parsed)) {
			return jrnParser.buildWebSource({
				workspace,
				...(parsed.url !== undefined && { url: parsed.url }),
			});
		}
	}

	if (jrnParserV3.isJob(parsed)) {
		return jrnParser.buildJobs({
			workspace,
			resourceId: parsed.resourceId,
		});
	}

	if (jrnParserV3.isAgents(parsed)) {
		return jrnParser.buildAgents({
			workspace,
			resourceId: parsed.resourceId,
		});
	}

	if (jrnParserV3.isAssets(parsed)) {
		return jrnParser.buildAssets({
			workspace,
			resourceId: parsed.resourceId,
		});
	}

	// At this point, we've checked docs, sources, jobs, agents, assets - only spaces remain
	// The parser validates services upfront, so this must be spaces
	return jrnParser.buildSpaces({
		workspace,
		resourceId: (parsed as { resourceId: string }).resourceId,
	});
}
