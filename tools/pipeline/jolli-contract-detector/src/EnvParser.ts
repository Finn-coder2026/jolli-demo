/**
 * Parser for .env files.
 * Extracts environment variable names from .env file content.
 */

/**
 * Extract environment variable name from a line.
 * Returns null if the line is not a valid env var declaration.
 *
 * Valid formats:
 * - VAR_NAME=value
 * - VAR_NAME="value"
 * - VAR_NAME='value'
 * - VAR_NAME= (empty value)
 *
 * Invalid (ignored):
 * - # comment
 * - blank/whitespace only
 * - export VAR_NAME=value (shell syntax, not supported)
 *
 * @param line - A single line from an env file
 * @returns The variable name or null
 */
export function extractEnvVarFromLine(line: string): string | null {
	const trimmed = line.trim();

	// Skip empty lines
	if (trimmed.length === 0) {
		return null;
	}

	// Skip comments
	if (trimmed.startsWith("#")) {
		return null;
	}

	// Match ENV_VAR_NAME=anything pattern
	// Variable names: start with letter or underscore, followed by letters, digits, underscores
	const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);

	if (match) {
		return match[1];
	}

	return null;
}

/**
 * Extract all environment variable names from env file lines.
 * @param lines - Array of lines from an env file
 * @returns Set of unique variable names
 */
export function extractEnvVarsFromLines(lines: Array<string>): Set<string> {
	const vars = new Set<string>();

	for (const line of lines) {
		const varName = extractEnvVarFromLine(line);
		if (varName !== null) {
			vars.add(varName);
		}
	}

	return vars;
}

/**
 * Analyze diff lines to determine added, removed, and changed env vars.
 * A "changed" var is one that appears in both added and removed lines
 * (meaning the value changed but the variable still exists).
 *
 * @param addedLines - Lines added in the diff
 * @param removedLines - Lines removed in the diff
 * @returns Object with added, removed, and changed sets
 */
export function analyzeEnvChanges(
	addedLines: Array<string>,
	removedLines: Array<string>,
): {
	added: Set<string>;
	removed: Set<string>;
	changed: Set<string>;
} {
	const addedVars = extractEnvVarsFromLines(addedLines);
	const removedVars = extractEnvVarsFromLines(removedLines);

	const added = new Set<string>();
	const removed = new Set<string>();
	const changed = new Set<string>();

	// Variables that appear in both are "changed" (value modified)
	for (const varName of addedVars) {
		if (removedVars.has(varName)) {
			changed.add(varName);
		} else {
			added.add(varName);
		}
	}

	// Variables only in removed are truly "removed"
	for (const varName of removedVars) {
		if (!addedVars.has(varName)) {
			removed.add(varName);
		}
	}

	return { added, removed, changed };
}
