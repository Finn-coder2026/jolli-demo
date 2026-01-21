/**
 * JRN (Jolli Resource Name) Matcher
 *
 * Provides pattern matching for JRN strings with wildcard support.
 * Supports both v2 and v3 JRN formats.
 *
 * V2 Pattern format: jrn:{orgId}/{spaceId}:{service}:{resourcePath}
 * V3 Pattern format: jrn:<controllingPath?>:<type>:<path>
 *
 * Workspace wildcards (v2):
 * - ** matches any entire workspace
 * - * matches any entire workspace (backwards compatible)
 * - Granular: use * for individual org/space parts
 *
 * Path wildcards (both v2 and v3):
 * - * matches any single path segment
 * - ** matches zero or more path segments
 *
 * Missing segments in the pattern default to * (wildcard)
 */

import { type JrnV3Type, VALID_JRN_V3_TYPES } from "../types/Jrn";

// =============================================================================
// Constants
// =============================================================================

/** Wildcard for matching any single segment */
const SINGLE_WILDCARD = "*";

/** Wildcard for matching multiple path segments */
const MULTI_WILDCARD = "**";

/** Helper function to check if a string is a valid v3 type */
function isValidV3Type(value: string): value is JrnV3Type {
	return VALID_JRN_V3_TYPES.includes(value as JrnV3Type);
}

// =============================================================================
// Internal Matching Functions
// =============================================================================

/**
 * Match a single segment against a pattern segment
 * @param value - The actual value to match
 * @param pattern - The pattern (can be * for wildcard)
 * @returns true if matches
 */
function matchSegment(value: string, pattern: string): boolean {
	if (pattern === SINGLE_WILDCARD) {
		return true;
	}
	return value === pattern;
}

/**
 * Match workspace parts (orgId/spaceId) against a pattern
 * Supports:
 * - Single asterisk for matching any single part (org or space)
 * - Double asterisk for matching all parts (entire workspace)
 *
 * Examples:
 * - "**" matches any workspace
 * - "*" matches any workspace (backwards compatible)
 * - "X/spc_01" (where X is asterisk) matches any org but specific space
 * - "org_01/X" matches specific org but any space
 * - "/spc_01" matches empty org, specific space
 */
function matchWorkspace(jrnWorkspace: string, patternWorkspace: string): boolean {
	// ** or * alone matches any workspace (backwards compatible)
	if (patternWorkspace === MULTI_WILDCARD || patternWorkspace === SINGLE_WILDCARD) {
		return true;
	}

	// Split into parts
	const jrnParts = jrnWorkspace.split("/");
	const patternParts = patternWorkspace.split("/");

	// Both must have exactly 2 parts (orgId/spaceId)
	if (jrnParts.length !== 2 || patternParts.length !== 2) {
		// If pattern doesn't have 2 parts, fall back to exact match
		return jrnWorkspace === patternWorkspace;
	}

	// Match each part: org, space
	for (let i = 0; i < 2; i++) {
		if (!matchSegment(jrnParts[i], patternParts[i])) {
			return false;
		}
	}

	return true;
}

/**
 * Match path segments (after the service) against a pattern
 * Supports * for single segment and ** for multiple segments
 * @param valueParts - The actual path parts (e.g., ["github", "org", "repo", "branch"])
 * @param patternParts - The pattern parts (e.g., ["github", "*", "*", "*"] or ["github", "**"])
 * @returns true if matches
 */
function matchPathSegments(valueParts: ReadonlyArray<string>, patternParts: ReadonlyArray<string>): boolean {
	let valueIdx = 0;
	let patternIdx = 0;

	while (patternIdx < patternParts.length) {
		const patternPart = patternParts[patternIdx];

		if (patternPart === MULTI_WILDCARD) {
			// ** matches zero or more segments
			// If this is the last pattern part, it matches everything remaining
			if (patternIdx === patternParts.length - 1) {
				return true;
			}

			// Try to match the rest of the pattern against remaining value parts
			// Start from current position and try each possible match point
			const nextPattern = patternParts.slice(patternIdx + 1);
			for (let i = valueIdx; i <= valueParts.length; i++) {
				const remainingValue = valueParts.slice(i);
				if (matchPathSegments(remainingValue, nextPattern)) {
					return true;
				}
			}
			return false;
		}

		// For * or literal, we need a value part to match against
		if (valueIdx >= valueParts.length) {
			return false;
		}

		if (!matchSegment(valueParts[valueIdx], patternPart)) {
			return false;
		}

		valueIdx++;
		patternIdx++;
	}

	// Pattern exhausted - check if value is also exhausted
	return valueIdx >= valueParts.length;
}

// =============================================================================
// Pattern Parsing
// =============================================================================

/**
 * Parse a JRN pattern into its components for matching
 * Pattern format: jrn:{workspace}:{service}:{resourcePath}
 * Each segment can be * for wildcard
 * resourcePath can use ** for matching multiple path segments
 */
interface ParsedJrnPattern {
	workspace: string;
	service: string;
	resourcePath: string;
}

/**
 * Parse a JRN pattern string into components
 * Missing segments default to * (wildcard)
 */
function parseJrnPattern(pattern: string): ParsedJrnPattern | null {
	if (!pattern.startsWith("jrn:")) {
		return null;
	}

	const parts = pattern.slice(4).split(":");
	// parts[0] = workspace, parts[1] = service, parts[2+] = resource

	return {
		workspace: parts[0] || SINGLE_WILDCARD,
		service: parts[1] || SINGLE_WILDCARD,
		resourcePath: parts.slice(2).join(":") || MULTI_WILDCARD,
	};
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Check if a JRN matches a pattern with wildcard support
 *
 * Pattern format: jrn:{orgId}/{spaceId}:{service}:{resourcePath}
 *
 * Workspace wildcards:
 * - ** matches any entire workspace (e.g., jrn:**:sources:...)
 * - Single * matches any entire workspace (backwards compatible)
 * - Granular: use * for individual org/space parts
 *
 * Resource path wildcards:
 * - * matches any single path segment
 * - ** matches zero or more path segments
 *
 * Missing segments in the pattern default to * (wildcard)
 *
 * @param jrn - The actual JRN string to test
 * @param pattern - The pattern to match against
 * @returns true if the JRN matches the pattern
 */
export function matchesJrnPattern(jrn: string, pattern: string): boolean {
	const parsedPattern = parseJrnPattern(pattern);
	if (!parsedPattern) {
		return false;
	}

	// Parse the actual JRN - but we need the raw parts, not the semantic parse
	if (!jrn.startsWith("jrn:")) {
		return false;
	}

	const jrnParts = jrn.slice(4).split(":");
	if (jrnParts.length < 3) {
		return false;
	}

	const jrnWorkspace = jrnParts[0];
	const jrnService = jrnParts[1];
	const jrnResourcePath = jrnParts.slice(2).join(":");

	// Match workspace (supports granular * for each part and ** for all)
	if (!matchWorkspace(jrnWorkspace, parsedPattern.workspace)) {
		return false;
	}

	// Match service
	if (!matchSegment(jrnService, parsedPattern.service)) {
		return false;
	}

	// Match resource path (supports * and ** in path)
	const jrnPathParts = jrnResourcePath.split("/");
	const patternPathParts = parsedPattern.resourcePath.split("/");

	return matchPathSegments(jrnPathParts, patternPathParts);
}

/**
 * Convenience alias for matchesJrnPattern
 *
 * @param jrn - The actual JRN string to test
 * @param pattern - The pattern to match against
 * @returns true if the JRN matches the pattern
 */
export function matches(jrn: string, pattern: string): boolean {
	return matchesJrnPattern(jrn, pattern);
}

// =============================================================================
// V3 JRN Pattern Matching
// =============================================================================

/**
 * Check if a JRN string is v3 format
 */
function isV3Jrn(jrn: string): boolean {
	if (!jrn.startsWith("jrn:")) {
		return false;
	}
	const parts = jrn.slice(4).split(":");
	return parts.length >= 2 && isValidV3Type(parts[1]);
}

/**
 * Parsed V3 JRN pattern
 */
interface ParsedJrnV3Pattern {
	controllingPath: string;
	type: JrnV3Type;
	path: string;
}

/**
 * Parse a v3 JRN pattern string into components
 */
function parseJrnV3Pattern(pattern: string): ParsedJrnV3Pattern | null {
	if (!pattern.startsWith("jrn:")) {
		return null;
	}

	const parts = pattern.slice(4).split(":");

	// Must have at least controllingPath (can be empty), type (e.g., "path"), and the path itself
	if (parts.length < 3 || !isValidV3Type(parts[1])) {
		return null;
	}

	return {
		controllingPath: parts[0],
		type: parts[1],
		path: parts.slice(2).join(":"),
	};
}

/**
 * Match a v3 JRN against a v3 pattern
 *
 * Pattern format: jrn:<controllingPath?>:<type>:<path>
 *
 * Wildcards in path:
 * - * matches any single path segment
 * - ** matches zero or more path segments
 *
 * Controlling path:
 * - * matches any controlling path (including empty)
 * - "" (empty) matches only empty controlling path
 * - Literal value matches exactly
 *
 * Type:
 * - Must match exactly (currently only "path" is supported)
 *
 * @param jrn - The actual v3 JRN string to test
 * @param pattern - The v3 pattern to match against
 * @returns true if the JRN matches the pattern
 */
export function matchesJrnV3Pattern(jrn: string, pattern: string): boolean {
	const parsedPattern = parseJrnV3Pattern(pattern);
	if (!parsedPattern) {
		return false;
	}

	if (!isV3Jrn(jrn)) {
		return false;
	}

	const jrnParts = jrn.slice(4).split(":");
	const jrnControllingPath = jrnParts[0];
	const jrnType = jrnParts[1];
	const jrnPath = jrnParts.slice(2).join(":");

	// Match controlling path
	if (parsedPattern.controllingPath !== SINGLE_WILDCARD && jrnControllingPath !== parsedPattern.controllingPath) {
		return false;
	}

	// Match type (must match exactly)
	// Note: Since both JRN and pattern are validated as v3 JRNs, and there's currently
	// only one valid type ("path"), this check will always pass. The type is included
	// in ParsedJrnV3Pattern for future extensibility when more types are added.
	/* v8 ignore start - type check always passes with single valid type */
	if (jrnType !== parsedPattern.type) {
		return false;
	}
	/* v8 ignore stop */

	// Match path using path segment matching
	const jrnPathParts = jrnPath.split("/").filter(s => s !== "");
	const patternPathParts = parsedPattern.path.split("/").filter(s => s !== "");

	return matchPathSegments(jrnPathParts, patternPathParts);
}

/**
 * Match any JRN (v2 or v3) against a pattern
 * Automatically detects the version and uses the appropriate matcher
 *
 * @param jrn - The actual JRN string to test (v2 or v3)
 * @param pattern - The pattern to match against (v2 or v3)
 * @returns true if the JRN matches the pattern
 */
export function matchesAnyJrnPattern(jrn: string, pattern: string): boolean {
	const jrnIsV3 = isV3Jrn(jrn);
	const patternIsV3 = isV3Jrn(pattern);

	// Both must be the same version to match
	if (jrnIsV3 !== patternIsV3) {
		return false;
	}

	if (jrnIsV3) {
		return matchesJrnV3Pattern(jrn, pattern);
	}
	return matchesJrnPattern(jrn, pattern);
}
