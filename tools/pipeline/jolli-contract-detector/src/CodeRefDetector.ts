/**
 * Detector for environment variable references in code.
 * Uses regex patterns to find process.env.X references.
 */

/**
 * Patterns for detecting process.env references in JavaScript/TypeScript code.
 *
 * Matches:
 * - process.env.VAR_NAME
 * - process.env["VAR_NAME"]
 * - process.env['VAR_NAME']
 *
 * Does NOT match:
 * - process.env (without specific variable)
 * - Dynamic access like process.env[varName]
 */
const PROCESS_ENV_PATTERNS = [
	// process.env.VAR_NAME - dot notation
	/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,

	// process.env["VAR_NAME"] - bracket notation with double quotes
	/process\.env\["([A-Za-z_][A-Za-z0-9_]*)"\]/g,

	// process.env['VAR_NAME'] - bracket notation with single quotes
	/process\.env\['([A-Za-z_][A-Za-z0-9_]*)'\]/g,
];

/**
 * Extract environment variable references from a single line of code.
 * @param line - A line of source code
 * @returns Array of variable names found in the line
 */
export function extractEnvRefsFromLine(line: string): Array<string> {
	const refs: Array<string> = [];

	for (const pattern of PROCESS_ENV_PATTERNS) {
		// Reset regex state for each line
		pattern.lastIndex = 0;

		let match: RegExpExecArray | null;
		while ((match = pattern.exec(line)) !== null) {
			refs.push(match[1]);
		}
	}

	return refs;
}

/**
 * Extract all environment variable references from multiple lines of code.
 * @param lines - Array of source code lines
 * @returns Set of unique variable names referenced
 */
export function extractEnvRefsFromLines(lines: Array<string>): Set<string> {
	const refs = new Set<string>();

	for (const line of lines) {
		const lineRefs = extractEnvRefsFromLine(line);
		for (const ref of lineRefs) {
			refs.add(ref);
		}
	}

	return refs;
}

/**
 * Analyze code diff to find env var references that were added or removed.
 * References in added lines are considered "changed" (touched by this PR).
 * References in removed lines are also "changed" (affected by this PR).
 *
 * @param addedLines - Lines added in the diff
 * @param removedLines - Lines removed in the diff
 * @returns Set of variable names that are referenced in changed code
 */
export function analyzeCodeRefs(addedLines: Array<string>, removedLines: Array<string>): Set<string> {
	const addedRefs = extractEnvRefsFromLines(addedLines);
	const removedRefs = extractEnvRefsFromLines(removedLines);

	// Combine both - any reference in changed code is "affected"
	const allRefs = new Set<string>();

	for (const ref of addedRefs) {
		allRefs.add(ref);
	}

	for (const ref of removedRefs) {
		allRefs.add(ref);
	}

	return allRefs;
}
