// Agent Tool Host
// Executes tools locally on behalf of the remote agent session.
// Enforces workspace root policy and provides sandboxed tool execution.

import { getLog, logError } from "../../shared/logger";
import type { ToolManifest, ToolManifestEntry } from "./agent";
import { cp as fsCp, rm as fsRm, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { jrnParser, jrnParserV3 } from "jolli-common";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const logger = getLog(import.meta);

// =============================================================================
// SECTION: Fuzzy Matching Helpers
// =============================================================================

/**
 * Finds the most similar substring in content to the search string.
 * Uses a simplified approach: finds lines that share the most words with the search.
 * Returns the best matching section or null if no reasonable match.
 */
function findSimilarText(content: string, search: string, maxSuggestionLength = 300): string | null {
	// Normalize and split search into significant words (3+ chars)
	const searchWords = search
		.toLowerCase()
		.replace(/[^\w\s]/g, " ")
		.split(/\s+/)
		.filter(w => w.length >= 3);

	if (searchWords.length === 0) {
		return null;
	}

	// Split content into lines and find the best matching region
	const lines = content.split("\n");
	let bestScore = 0;
	let bestStartLine = 0;
	let bestEndLine = 0;

	// Sliding window approach - check groups of lines
	for (let start = 0; start < lines.length; start++) {
		for (let end = start; end < Math.min(start + 10, lines.length); end++) {
			const region = lines.slice(start, end + 1).join("\n");
			const regionWords = region
				.toLowerCase()
				.replace(/[^\w\s]/g, " ")
				.split(/\s+/)
				.filter(w => w.length >= 3);

			// Count matching words
			const matches = searchWords.filter(sw => regionWords.some(rw => rw.includes(sw) || sw.includes(rw)));
			const score = matches.length / searchWords.length;

			if (score > bestScore) {
				bestScore = score;
				bestStartLine = start;
				bestEndLine = end;
			}
		}
	}

	// Only suggest if we found a reasonable match (at least 30% of words match)
	if (bestScore < 0.3) {
		return null;
	}

	const suggestion = lines.slice(bestStartLine, bestEndLine + 1).join("\n");
	if (suggestion.length > maxSuggestionLength) {
		return `${suggestion.slice(0, maxSuggestionLength)}...`;
	}
	return suggestion;
}

// =============================================================================
// SECTION: Types
// =============================================================================

/**
 * Result of a tool execution
 */
export interface ToolResult {
	readonly success: boolean;
	readonly output: string;
	readonly error?: string;
	readonly confirmationMessage?: string;
}

/**
 * Shell command permission configuration
 */
export interface ShellPermissionConfig {
	readonly allowedCommands?: ReadonlyArray<string>;
	readonly deniedPatterns?: ReadonlyArray<string>;
}

/**
 * Tool permission configuration
 */
export interface ToolPermissionConfig {
	readonly disabledTools?: ReadonlyArray<string>;
	readonly confirmationRequired?: ReadonlyArray<string>;
	readonly shell?: ShellPermissionConfig;
}

/**
 * Tool executor function signature
 */
export type ToolExecutor = (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<ToolResult>;

/**
 * Tool host configuration
 */
export interface ToolHostConfig {
	readonly workspaceRoot: string;
	readonly allowedRoots: ReadonlyArray<string>;
	readonly sourceNames: ReadonlyArray<string>;
	readonly maxOutputSize: number;
	readonly allowedTools: ReadonlySet<string>;
	readonly permissions?: ToolPermissionConfig;
}

/**
 * Context passed to tool executors for permission checks
 */
export interface ToolExecutionContext {
	readonly workspaceRoot: string;
	readonly allowedRoots?: ReadonlyArray<string>;
	readonly sourceNames?: ReadonlyArray<string>;
	readonly permissions?: ToolPermissionConfig;
	readonly skipConfirmation?: boolean;
}

/**
 * Tool host instance for executing tools
 */
export interface ToolHost {
	readonly config: ToolHostConfig;
	execute(toolName: string, args: Record<string, unknown>, skipConfirmation?: boolean): Promise<ToolResult>;
	getManifest(): ToolManifest;
	requiresConfirmation(toolName: string): boolean;
}

// =============================================================================
// SECTION: Path Policy
// =============================================================================

/**
 * Validates that a path is within the workspace root or additional allowed roots.
 * Returns the resolved absolute path if valid, throws if path escapes the sandbox.
 */
function collectAllowedRoots(workspaceRoot: string, allowedRoots?: ReadonlyArray<string>): Array<string> {
	const roots = [path.resolve(workspaceRoot), ...(allowedRoots ?? []).map(root => path.resolve(root))];
	return Array.from(new Set(roots));
}

function findContainingRoot(absolutePath: string, roots: ReadonlyArray<string>): string | undefined {
	return roots
		.slice()
		.sort((a, b) => b.length - a.length)
		.find(root => absolutePath === root || absolutePath.startsWith(root + path.sep));
}

function stripNullChars(value: string): string {
	return value.includes("\u0000") ? value.replace(/\u0000/g, "") : value;
}

function sanitizeToolResult(result: ToolResult): ToolResult {
	const output = stripNullChars(result.output);
	const error = result.error !== undefined ? stripNullChars(result.error) : undefined;
	const confirmationMessage =
		result.confirmationMessage !== undefined ? stripNullChars(result.confirmationMessage) : undefined;

	return {
		success: result.success,
		output,
		...(error !== undefined ? { error } : {}),
		...(confirmationMessage !== undefined ? { confirmationMessage } : {}),
	};
}

function validatePath(relativePath: string, workspaceRoot: string, allowedRoots?: ReadonlyArray<string>): string {
	if (relativePath.includes("\u0000")) {
		throw new Error("Invalid path: contains null byte");
	}

	const absolutePath = path.resolve(workspaceRoot, relativePath);
	const normalizedRoots = collectAllowedRoots(workspaceRoot, allowedRoots);

	if (normalizedRoots.some(root => absolutePath.startsWith(root + path.sep) || absolutePath === root)) {
		return absolutePath;
	}

	throw new Error(`Path escapes workspace root: ${relativePath}`);
}

/**
 * Validates that a path is writable within the workspace root only.
 * Configured source roots are intentionally read-only.
 */
function validateWritablePath(relativePath: string, workspaceRoot: string): string {
	return validatePath(relativePath, workspaceRoot);
}

/**
 * Converts an absolute path back to a workspace-relative path.
 */
function toRelativePath(absolutePath: string, workspaceRoot: string, allowedRoots?: ReadonlyArray<string>): string {
	const normalizedPath = path.resolve(absolutePath);
	const normalizedRoots = collectAllowedRoots(workspaceRoot, allowedRoots);
	const containingRoot = findContainingRoot(normalizedPath, normalizedRoots);

	if (!containingRoot) {
		throw new Error(`Path is outside workspace: ${absolutePath}`);
	}

	return path.relative(containingRoot, normalizedPath) || ".";
}

// =============================================================================
// SECTION: Frontmatter Validation Helpers
// =============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function isAbsoluteOrWorkspacePrefixedAttentionPath(pathValue: string): boolean {
	const trimmed = pathValue.trim();
	if (trimmed.startsWith("/") || trimmed.startsWith("\\") || trimmed.startsWith("~")) {
		return true;
	}
	if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
		return true;
	}
	return trimmed.toLowerCase().startsWith("workspace/");
}

function validateJrnField(value: unknown): Array<string> {
	const issues: Array<string> = [];
	const normalized = normalizeString(value);
	if (!normalized) {
		issues.push("jrn must be a non-empty string");
		return issues;
	}

	// Accept non-JRN identifiers (e.g. DOC_001), but if it looks like a JRN, validate format.
	if (!normalized.startsWith("jrn:")) {
		return issues;
	}

	if (jrnParserV3.isV3(normalized)) {
		const parsedV3 = jrnParserV3.parse(normalized);
		if (!parsedV3.success) {
			issues.push(`jrn is not a valid v3 JRN: ${parsedV3.error}`);
		}
		return issues;
	}

	const parsedV2 = jrnParser.parse(normalized);
	if (!parsedV2.success) {
		issues.push(`jrn is not a valid v2 JRN: ${parsedV2.error}`);
	}
	return issues;
}

function validateAttentionKeywords(value: unknown, ruleIndex: number): Array<string> {
	const issues: Array<string> = [];
	if (value === undefined) {
		return issues;
	}

	if (typeof value === "string") {
		if (value.trim().length === 0) {
			issues.push(`attention[${ruleIndex}].keywords must not be empty when provided as a string`);
		}
		return issues;
	}

	if (!Array.isArray(value)) {
		issues.push(`attention[${ruleIndex}].keywords must be a string or an array of strings`);
		return issues;
	}

	for (let i = 0; i < value.length; i++) {
		const item = value[i];
		if (typeof item !== "string" || item.trim().length === 0) {
			issues.push(`attention[${ruleIndex}].keywords[${i}] must be a non-empty string`);
		}
	}

	return issues;
}

function validateAttentionSource(
	value: unknown,
	ruleIndex: number,
	sourceNames?: ReadonlyArray<string>,
): Array<string> {
	const issues: Array<string> = [];
	const sourceValue = normalizeString(value);
	if (!sourceValue) {
		issues.push(`attention[${ruleIndex}].source must be a non-empty string`);
		return issues;
	}

	if (sourceNames && sourceNames.length > 0 && !sourceNames.includes(sourceValue)) {
		issues.push(`attention[${ruleIndex}].source must be one of: ${sourceNames.join(", ")}`);
	}

	return issues;
}

function validateAttentionField(value: unknown, sourceNames?: ReadonlyArray<string>): Array<string> {
	const issues: Array<string> = [];
	if (!Array.isArray(value)) {
		issues.push("attention must be an array");
		return issues;
	}

	for (let i = 0; i < value.length; i++) {
		const rule = value[i];
		if (!isRecord(rule)) {
			issues.push(`attention[${i}] must be an object`);
			continue;
		}

		if (rule.op !== "file") {
			issues.push(`attention[${i}].op must be \"file\"`);
		}

		issues.push(...validateAttentionSource(rule.source, i, sourceNames));

		const pathValue = normalizeString(rule.path);
		if (!pathValue) {
			issues.push(`attention[${i}].path must be a non-empty string`);
		} else if (isAbsoluteOrWorkspacePrefixedAttentionPath(pathValue)) {
			issues.push(
				`attention[${i}].path must be repo-relative (for example "src/auth/login.ts"), not absolute or workspace-prefixed`,
			);
		}

		issues.push(...validateAttentionKeywords(rule.keywords, i));
	}

	return issues;
}

function validateManagedFrontmatter(
	frontmatter: Record<string, unknown>,
	sourceNames?: ReadonlyArray<string>,
): Array<string> {
	const issues: Array<string> = [];
	if ("jrn" in frontmatter) {
		issues.push(...validateJrnField(frontmatter.jrn));
	}
	if ("attention" in frontmatter) {
		issues.push(...validateAttentionField(frontmatter.attention, sourceNames));
	}
	return issues;
}

function validateManagedFrontmatterInMarkdown(
	content: string,
	sourceNames?: ReadonlyArray<string>,
): Array<string> {
	const normalized = content.startsWith("\ufeff") ? content.slice(1) : content;
	const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n)?/);
	if (!match?.[1]) {
		return [];
	}

	let frontmatter: unknown;
	try {
		frontmatter = parseYaml(match[1]);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return [`Frontmatter YAML is invalid: ${message}`];
	}

	if (!isRecord(frontmatter)) {
		return ["Frontmatter must be a YAML object"];
	}
	return validateManagedFrontmatter(frontmatter, sourceNames);
}

function hasMarkdownFrontmatter(content: string): boolean {
	const normalized = content.startsWith("\ufeff") ? content.slice(1) : content;
	return /^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/.test(normalized);
}

function buildMissingFrontmatterWarning(filePath: string, sourceNames?: ReadonlyArray<string>): string {
	const defaultSource = sourceNames?.length === 1 ? sourceNames[0] : "<source-name>";
	const sourceHint =
		sourceNames && sourceNames.length > 0
			? `Use one of the configured source names: ${sourceNames.join(", ")}.`
			: "Ask the user for the correct source name.";

	return [
		"WARNINGS:",
		"- MISSING_FRONTMATTER: Markdown file was written without a frontmatter block.",
		"RECOMMENDED_ACTION:",
		"- Call upsert_frontmatter to add managed metadata.",
		`- Example: {"path":"${filePath}","set":{"jrn":"doc-<id>","attention":[{"op":"file","source":"${defaultSource}","path":"<repo-relative-path>"}]}}`,
		`- ${sourceHint}`,
		"- jrn is optional; include it when available.",
	].join("\n");
}

function appendWarningBlock(output: string, warningBlock: string): string {
	return `${output}\n${warningBlock}`;
}

// =============================================================================
// SECTION: Tool Executors
// =============================================================================

/**
 * Read file tool executor
 */
async function executeReadFile(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const filePath = args.path;
	if (typeof filePath !== "string") {
		return { success: false, output: "", error: "Missing or invalid 'path' argument" };
	}

	try {
		const absolutePath = validatePath(filePath, context.workspaceRoot, context.allowedRoots);
		const file = Bun.file(absolutePath);

		if (!(await file.exists())) {
			return { success: false, output: "", error: `File not found: ${filePath}` };
		}

		const content = await file.text();
		return { success: true, output: content };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}
}

/**
 * Read file range tool executor
 */
async function executeReadFileRange(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const filePath = args.path;
	const startLine = args.start;
	const endLine = args.end;

	if (typeof filePath !== "string") {
		return { success: false, output: "", error: "Missing or invalid 'path' argument" };
	}
	if (typeof startLine !== "number" || !Number.isInteger(startLine) || startLine < 1) {
		return { success: false, output: "", error: "Missing or invalid 'start' argument (must be an integer >= 1)" };
	}
	if (typeof endLine !== "number" || !Number.isInteger(endLine) || endLine < startLine) {
		return {
			success: false,
			output: "",
			error: "Missing or invalid 'end' argument (must be an integer >= start)",
		};
	}

	try {
		const absolutePath = validatePath(filePath, context.workspaceRoot, context.allowedRoots);
		const file = Bun.file(absolutePath);

		if (!(await file.exists())) {
			return { success: false, output: "", error: `File not found: ${filePath}` };
		}

		const content = await file.text();
		const lines = content.split("\n");
		const totalLines = lines.length;
		if (startLine > totalLines) {
			return {
				success: false,
				output: "",
				error: `Start line ${startLine} is out of range (file has ${totalLines} lines)`,
			};
		}

		const boundedEnd = Math.min(endLine, totalLines);
		const width = String(boundedEnd).length;
		const selected = lines.slice(startLine - 1, boundedEnd);
		const numbered = selected.map((line, idx) => {
			const lineNo = startLine + idx;
			return `${String(lineNo).padStart(width, " ")}: ${line}`;
		});

		return {
			success: true,
			output: `Showing lines ${startLine}-${boundedEnd} of ${totalLines} from ${filePath}\n${numbered.join("\n")}`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}
}

/**
 * Write file tool executor
 */
async function executeWriteFile(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const filePath = args.path;
	const content = args.content;

	if (typeof filePath !== "string") {
		return { success: false, output: "", error: "Missing or invalid 'path' argument" };
	}
	if (typeof content !== "string") {
		return { success: false, output: "", error: "Missing or invalid 'content' argument" };
	}

		try {
			const isMarkdown = filePath.toLowerCase().endsWith(".md");
			if (isMarkdown) {
				const validationIssues = validateManagedFrontmatterInMarkdown(content, context.sourceNames);
				if (validationIssues.length > 0) {
					return {
					success: false,
					output: "",
					error: [
						"Frontmatter validation failed:",
						...validationIssues.map(issue => `- ${issue}`),
						"",
						"Expected managed schema:",
						"- jrn: optional non-empty string (if it starts with jrn:, it must parse as v2 or v3 JRN)",
						"- attention: array of { op: \"file\", source: non-empty string, path: repo-relative non-empty string, keywords?: string | string[] }",
					].join("\n"),
				};
			}
		}

		const absolutePath = validateWritablePath(filePath, context.workspaceRoot);
		const dir = path.dirname(absolutePath);

		// Ensure parent directory exists
			await Bun.$`mkdir -p ${dir}`.quiet();
			await Bun.write(absolutePath, content);

			const baseOutput = `Wrote ${content.length} bytes to ${filePath}`;
			if (isMarkdown && !hasMarkdownFrontmatter(content)) {
				const warning = buildMissingFrontmatterWarning(filePath, context.sourceNames);
				return { success: true, output: appendWarningBlock(baseOutput, warning) };
			}
			return { success: true, output: baseOutput };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return { success: false, output: "", error: message };
	}
}

/**
 * List directory tool executor
 */
async function executeLs(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const dirPath = args.path ?? ".";
	if (typeof dirPath !== "string") {
		return { success: false, output: "", error: "Invalid 'path' argument" };
	}

	try {
		const absolutePath = validatePath(dirPath, context.workspaceRoot, context.allowedRoots);
		const stats = await stat(absolutePath);

		if (!stats.isDirectory()) {
			return { success: false, output: "", error: `Not a directory: ${dirPath}` };
		}

		const entries = await readdir(absolutePath, { withFileTypes: true });
		const lines = entries.map(entry => {
			const suffix = entry.isDirectory() ? "/" : "";
			return `${entry.name}${suffix}`;
		});

		return { success: true, output: lines.join("\n") };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}
}

/**
 * Create directory tool executor
 */
async function executeMkdir(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const dirPath = args.path;
	if (typeof dirPath !== "string") {
		return { success: false, output: "", error: "Missing or invalid 'path' argument" };
	}

	try {
		const absolutePath = validateWritablePath(dirPath, context.workspaceRoot);
		await Bun.$`mkdir -p ${absolutePath}`.quiet();
		return { success: true, output: `Created directory: ${dirPath}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}
}

/**
 * Remove file/directory tool executor
 */
async function executeRm(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const targetPath = args.path;
	const recursive = args.recursive === true;

	if (typeof targetPath !== "string") {
		return { success: false, output: "", error: "Missing or invalid 'path' argument" };
	}

	try {
		const absolutePath = validateWritablePath(targetPath, context.workspaceRoot);

		// Check if confirmation is required (and not already confirmed)
		if (!context.skipConfirmation) {
			return {
				success: false,
				output: "",
				error: "CONFIRMATION_REQUIRED",
				confirmationMessage: `Are you sure you want to delete ${targetPath}${recursive ? " (recursively)" : ""}?`,
			};
		}

		const stats = await stat(absolutePath);
		if (stats.isDirectory() && !recursive) {
			return { success: false, output: "", error: "Cannot remove directory without recursive: true" };
		}

		await fsRm(absolutePath, { recursive, force: false });
		return { success: true, output: `Removed: ${targetPath}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}
}

/**
 * Move/rename file tool executor
 */
async function executeMv(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const source = args.source;
	const destination = args.destination;

	if (typeof source !== "string") {
		return { success: false, output: "", error: "Missing or invalid 'source' argument" };
	}
	if (typeof destination !== "string") {
		return { success: false, output: "", error: "Missing or invalid 'destination' argument" };
	}

	try {
		const absoluteSource = validateWritablePath(source, context.workspaceRoot);
		const absoluteDest = validateWritablePath(destination, context.workspaceRoot);

		await rename(absoluteSource, absoluteDest);
		return { success: true, output: `Moved ${source} to ${destination}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}
}

/**
 * Copy file/directory tool executor
 */
async function executeCp(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const source = args.source;
	const destination = args.destination;
	const recursive = args.recursive === true;

	if (typeof source !== "string") {
		return { success: false, output: "", error: "Missing or invalid 'source' argument" };
	}
	if (typeof destination !== "string") {
		return { success: false, output: "", error: "Missing or invalid 'destination' argument" };
	}

	try {
		const absoluteSource = validatePath(source, context.workspaceRoot, context.allowedRoots);
		const absoluteDest = validateWritablePath(destination, context.workspaceRoot);

		const stats = await stat(absoluteSource);
		if (stats.isDirectory() && !recursive) {
			return { success: false, output: "", error: "Cannot copy directory without recursive: true" };
		}

		await fsCp(absoluteSource, absoluteDest, { recursive });
		return { success: true, output: `Copied ${source} to ${destination}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}
}

// =============================================================================
// SECTION: Code Exploration Tools
// =============================================================================

/**
 * Grep tool executor - search file contents
 */
async function executeGrep(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const pattern = args.pattern;
	const searchPath = (args.path as string) ?? ".";
	const recursive = args.recursive !== false;
	const ignoreCase = args.ignoreCase === true;
	const maxResults = typeof args.maxResults === "number" ? args.maxResults : 100;

	if (typeof pattern !== "string") {
		return { success: false, output: "", error: "Missing or invalid 'pattern' argument" };
	}

	try {
		const absolutePath = validatePath(searchPath, context.workspaceRoot, context.allowedRoots);

		const flags: Array<string> = [];
		if (recursive) {
			flags.push("-r");
		}
		if (ignoreCase) {
			flags.push("-i");
		}
		flags.push("-n"); // Show line numbers

		// Use quiet mode to suppress errors, capture output
		const result = await Bun.$`grep ${flags} ${pattern} ${absolutePath} 2>/dev/null || true`.quiet();
		const output = result.stdout.toString();

		// Truncate if too many results
		const lines = output.split("\n").filter(Boolean);
		if (lines.length > maxResults) {
			const truncated = lines.slice(0, maxResults).join("\n");
			return {
				success: true,
				output: `${truncated}\n\n[Results truncated: showing ${maxResults} of ${lines.length} matches]`,
			};
		}

		if (lines.length === 0) {
			return { success: true, output: "No matches found" };
		}

		return { success: true, output: lines.join("\n") };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}
}

/**
 * Find tool executor - find files by glob pattern
 */
async function executeFind(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const pattern = args.pattern;
	const searchPath = (args.path as string) ?? ".";
	const typeFilter = (args.type as string) ?? "all";
	const maxResults = typeof args.maxResults === "number" ? args.maxResults : 100;

	if (typeof pattern !== "string") {
		return { success: false, output: "", error: "Missing or invalid 'pattern' argument" };
	}
	if (typeof searchPath !== "string") {
		return { success: false, output: "", error: "Invalid 'path' argument" };
	}

	try {
		const absolutePath = validatePath(searchPath, context.workspaceRoot, context.allowedRoots);

		let pathStats: Awaited<ReturnType<typeof stat>>;
		try {
			pathStats = await stat(absolutePath);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return { success: false, output: "", error: stripNullChars(message) };
		}

		if (!pathStats.isDirectory()) {
			return { success: false, output: "", error: `Path is not a directory: ${searchPath}` };
		}

		const glob = new Bun.Glob(pattern);

		const results: Array<string> = [];
		for await (const file of glob.scan({ cwd: absolutePath, onlyFiles: typeFilter === "file", dot: true })) {
			// Filter by type if needed
			if (typeFilter === "directory") {
				const filePath = path.join(absolutePath, file);
				try {
					const stats = await stat(filePath);
					if (!stats.isDirectory()) {
						continue;
					}
				} catch {
					continue;
				}
			}

			results.push(file);
			if (results.length >= maxResults) {
				break;
			}
		}

		if (results.length === 0) {
			return { success: true, output: "No files found matching pattern" };
		}

		let output = results.join("\n");
		if (results.length >= maxResults) {
			output += `\n\n[Results limited to ${maxResults} entries]`;
		}

		return { success: true, output };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: stripNullChars(message) };
	}
}

/**
 * Ripgrep search tool executor - fast search with optional glob filtering
 */
async function executeRgSearch(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const pattern = args.pattern;
	const searchPath = (args.path as string) ?? ".";
	const ignoreCase = args.ignoreCase === true;
	const contextLines = typeof args.contextLines === "number" ? args.contextLines : 0;
	const maxResults = typeof args.maxResults === "number" ? args.maxResults : 100;
	const globsRaw = args.globs;

	if (typeof pattern !== "string" || pattern.length === 0) {
		return { success: false, output: "", error: "Missing or invalid 'pattern' argument" };
	}
	if (typeof searchPath !== "string") {
		return { success: false, output: "", error: "Invalid 'path' argument" };
	}
	if (!Number.isInteger(contextLines) || contextLines < 0 || contextLines > 20) {
		return { success: false, output: "", error: "Invalid 'contextLines' argument (must be an integer between 0 and 20)" };
	}
	if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 2000) {
		return { success: false, output: "", error: "Invalid 'maxResults' argument (must be an integer between 1 and 2000)" };
	}

	let globs: Array<string> = [];
	if (globsRaw !== undefined) {
		if (!Array.isArray(globsRaw)) {
			return { success: false, output: "", error: "Invalid 'globs' argument (must be an array of strings)" };
		}
		for (let i = 0; i < globsRaw.length; i++) {
			const item = globsRaw[i];
			if (typeof item !== "string" || item.trim().length === 0) {
				return { success: false, output: "", error: `Invalid globs[${i}] (must be a non-empty string)` };
			}
			globs.push(item);
		}
	}

	try {
		const absolutePath = validatePath(searchPath, context.workspaceRoot, context.allowedRoots);
		const rgArgs: Array<string> = ["--line-number", "--no-heading", "--color", "never", "-m", String(maxResults)];
		if (ignoreCase) {
			rgArgs.push("-i");
		}
		if (contextLines > 0) {
			rgArgs.push("-C", String(contextLines));
		}
		for (const glob of globs) {
			rgArgs.push("-g", glob);
		}
		rgArgs.push(pattern, absolutePath);

		const proc = Bun.spawn(["rg", ...rgArgs], {
			cwd: context.workspaceRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		if (exitCode === 0) {
			return { success: true, output: stdout.trim() || "No matches found" };
		}
		if (exitCode === 1) {
			return { success: true, output: "No matches found" };
		}

		const errMessage = stderr.trim() || `rg exited with code ${exitCode}`;
		return { success: false, output: stdout.trim(), error: errMessage };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		// Fallback when rg is not installed in environment.
		if (message.toLowerCase().includes("enoent") || message.toLowerCase().includes("no such file")) {
			const grepResult = await executeGrep(
				{
					pattern,
					path: searchPath,
					ignoreCase,
					maxResults,
					recursive: true,
				},
				context,
			);
			if (grepResult.success) {
				return {
					success: true,
					output: `${grepResult.output}\n\n[rg unavailable; used grep fallback]`,
				};
			}
			return grepResult;
		}
		return { success: false, output: "", error: message };
	}
}

// =============================================================================
// SECTION: Article Editing Tools
// =============================================================================

/**
 * Result type for edit_article with additional edit information
 */
export interface EditArticleResult extends ToolResult {
	readonly appliedEdits?: ReadonlyArray<{ readonly index: number; readonly reason: string }>;
}

/**
 * Edit entry for edit_article tool
 */
export interface EditEntry {
	readonly old_string: string;
	readonly new_string: string;
	readonly reason: string;
}

/**
 * Edit article tool executor - makes targeted text replacements with uniqueness checks
 */
async function executeEditArticle(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const filePath = args.path;
	const edits = args.edits;

	if (typeof filePath !== "string") {
		return { success: false, output: "", error: "Missing or invalid 'path' argument" };
	}
	if (!Array.isArray(edits)) {
		return { success: false, output: "", error: "Missing or invalid 'edits' argument - must be an array" };
	}

	// Validate each edit has required fields
	for (let i = 0; i < edits.length; i++) {
		const edit = edits[i] as Record<string, unknown>;
		if (typeof edit.old_string !== "string") {
			return { success: false, output: "", error: `Edit ${i}: Missing or invalid 'old_string'` };
		}
		if (typeof edit.new_string !== "string") {
			return { success: false, output: "", error: `Edit ${i}: Missing or invalid 'new_string'` };
		}
		if (typeof edit.reason !== "string") {
			return { success: false, output: "", error: `Edit ${i}: Missing or invalid 'reason'` };
		}
	}

	try {
		const absolutePath = validateWritablePath(filePath, context.workspaceRoot);
		const file = Bun.file(absolutePath);

		if (!(await file.exists())) {
			return { success: false, output: "", error: `File not found: ${filePath}` };
		}

		// Read current content
		let content = await file.text();
		const appliedEdits: Array<{ index: number; reason: string }> = [];

			// Apply edits in order
			for (let i = 0; i < edits.length; i++) {
				const edit = edits[i] as EditEntry;

			// Count occurrences to check uniqueness
			const occurrences = content.split(edit.old_string).length - 1;

			if (occurrences === 0) {
				// Include a snippet of the actual file content to help the agent self-correct
				const preview = content.length > 500 ? `${content.slice(0, 500)}...\n\n[File truncated - ${content.length} chars total]` : content;
				return {
					success: false,
					output: "",
					error: `Edit ${i}: Text not found in file. The old_string you provided does not exist in the file.\n\nActual file content:\n\`\`\`\n${preview}\n\`\`\`\n\nPlease use exact text from the file above.`,
				};
			}

			if (occurrences > 1) {
				return {
					success: false,
					output: "",
					error: `Edit ${i}: Text appears ${occurrences} times - include more context to make it unique`,
				};
			}

			// Safe to replace - exactly one occurrence
			content = content.replace(edit.old_string, edit.new_string);
				appliedEdits.push({ index: i, reason: edit.reason });
			}

			const isMarkdown = filePath.toLowerCase().endsWith(".md");
			if (isMarkdown) {
				const validationIssues = validateManagedFrontmatterInMarkdown(content, context.sourceNames);
				if (validationIssues.length > 0) {
					return {
						success: false,
						output: "",
						error: [
							"Frontmatter validation failed:",
							...validationIssues.map(issue => `- ${issue}`),
							"",
							"Expected managed schema:",
							"- jrn: optional non-empty string (if it starts with jrn:, it must parse as v2 or v3 JRN)",
							"- attention: array of { op: \"file\", source: non-empty string, path: repo-relative non-empty string, keywords?: string | string[] }",
						].join("\n"),
					};
				}
			}

			// Write updated content
			const dir = path.dirname(absolutePath);
			await Bun.$`mkdir -p ${dir}`.quiet();
			await Bun.write(absolutePath, content);

			const baseOutput = `Applied ${appliedEdits.length} edit${appliedEdits.length !== 1 ? "s" : ""} to ${filePath}`;
			const output =
				isMarkdown && !hasMarkdownFrontmatter(content)
					? appendWarningBlock(baseOutput, buildMissingFrontmatterWarning(filePath, context.sourceNames))
					: baseOutput;

			const result: EditArticleResult = {
				success: true,
				output,
				appliedEdits,
			};
			return result;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}
}

/**
 * Upsert frontmatter tool executor - merge/remove fields with schema validation.
 */
async function executeUpsertFrontmatter(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const filePath = args.path;
	const set = args.set;
	const remove = args.remove;

	if (typeof filePath !== "string") {
		return { success: false, output: "", error: "Missing or invalid 'path' argument" };
	}
	if (set !== undefined && !isRecord(set)) {
		return { success: false, output: "", error: "Invalid 'set' argument (must be an object when provided)" };
	}
	if (remove !== undefined && (!Array.isArray(remove) || remove.some(key => typeof key !== "string"))) {
		return { success: false, output: "", error: "Invalid 'remove' argument (must be an array of strings when provided)" };
	}
	if (set === undefined && remove === undefined) {
		return { success: false, output: "", error: "Provide at least one of 'set' or 'remove'" };
	}

	try {
		const absolutePath = validateWritablePath(filePath, context.workspaceRoot);
		const file = Bun.file(absolutePath);
		if (!(await file.exists())) {
			return { success: false, output: "", error: `File not found: ${filePath}` };
		}

		const originalContent = await file.text();
		const hasBom = originalContent.startsWith("\ufeff");
		const normalized = hasBom ? originalContent.slice(1) : originalContent;
		const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n)?/);

		let existingData: Record<string, unknown> = {};
		let afterFrontmatter = normalized;
		let trailingNewline = "\n";

		if (match?.[1] !== undefined) {
			const rawYaml = match[1];
			trailingNewline = match[2] ?? "";
			afterFrontmatter = normalized.slice(match[0].length);

			try {
				const parsed = parseYaml(rawYaml);
				if (!isRecord(parsed)) {
					return {
						success: false,
						output: "",
						error: "Existing frontmatter must be a YAML object for upsert operations",
					};
				}
				existingData = { ...parsed };
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					success: false,
					output: "",
					error: `Existing frontmatter YAML is invalid: ${message}`,
				};
			}
		}

		const nextData: Record<string, unknown> = { ...existingData };
		if (Array.isArray(remove)) {
			for (const key of remove) {
				delete nextData[key];
			}
		}
		if (isRecord(set)) {
			for (const [key, value] of Object.entries(set)) {
				nextData[key] = value;
			}
		}

			const validationIssues = validateManagedFrontmatter(nextData, context.sourceNames);
			if (validationIssues.length > 0) {
				return {
					success: false,
					output: "",
					error: [
						"Frontmatter validation failed:",
						...validationIssues.map(issue => `- ${issue}`),
						"",
						"Expected managed schema:",
						"- jrn: optional non-empty string (if it starts with jrn:, it must parse as v2 or v3 JRN)",
						"- attention: array of { op: \"file\", source: non-empty string, path: repo-relative non-empty string, keywords?: string | string[] }",
					].join("\n"),
				};
			}

			let nextContent: string;
		if (Object.keys(nextData).length === 0) {
			nextContent = `${hasBom ? "\ufeff" : ""}${afterFrontmatter}`;
		} else {
			const yaml = stringifyYaml(nextData, { lineWidth: 0 }).trimEnd();
			const separator = match ? trailingNewline : "\n";
			nextContent = `${hasBom ? "\ufeff" : ""}---\n${yaml}\n---${separator}${afterFrontmatter}`;
		}

		if (nextContent === originalContent) {
			return { success: true, output: `No frontmatter changes needed for ${filePath}` };
		}

		await Bun.write(absolutePath, nextContent);
		return { success: true, output: `Updated frontmatter for ${filePath}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}
}

// =============================================================================
// SECTION: Git Tools
// =============================================================================

/**
 * Shape returned by git tools as structured JSON text.
 */
interface GitToolPayload {
	readonly tool: string;
	readonly ok: boolean;
	readonly summary: string;
	readonly data?: unknown;
	readonly error?: {
		readonly code: string;
		readonly message: string;
		readonly hint?: string;
	};
}

interface GitCommandResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
}

interface GitRepoContext {
	readonly absolutePath: string;
	readonly displayPath: string;
}

interface GitChangedFile {
	readonly status: string;
	readonly raw_status: string;
	readonly path: string;
	readonly old_path?: string;
}

interface GitHistoryCommit {
	readonly sha: string;
	readonly subject: string;
	readonly date: string;
	readonly author: string;
	readonly files?: ReadonlyArray<GitChangedFile>;
}

function buildGitPayload(payload: GitToolPayload): string {
	return JSON.stringify(payload, null, 2);
}

function gitOk(tool: string, summary: string, data?: unknown): ToolResult {
	return {
		success: true,
		output: buildGitPayload({
			tool,
			ok: true,
			summary,
			...(data !== undefined ? { data } : {}),
		}),
	};
}

function gitError(tool: string, code: string, message: string, hint?: string, data?: unknown): ToolResult {
	return {
		success: true,
		output: buildGitPayload({
			tool,
			ok: false,
			summary: message,
			...(data !== undefined ? { data } : {}),
			error: {
				code,
				message,
				...(hint ? { hint } : {}),
			},
		}),
	};
}

async function resolveGitRepoContext(
	args: Record<string, unknown>,
	context: ToolExecutionContext,
): Promise<GitRepoContext> {
	const repoPathRaw = args.repo_path;
	if (repoPathRaw === undefined) {
		return {
			absolutePath: context.workspaceRoot,
			displayPath: ".",
		};
	}

	if (typeof repoPathRaw !== "string" || repoPathRaw.trim().length === 0) {
		throw new Error("Invalid 'repo_path' argument (must be a non-empty string when provided)");
	}

	const absolutePath = validatePath(repoPathRaw, context.workspaceRoot, context.allowedRoots);
	const repoStats = await stat(absolutePath);
	if (!repoStats.isDirectory()) {
		throw new Error(`repo_path is not a directory: ${repoPathRaw}`);
	}

	return {
		absolutePath,
		displayPath: toRelativePath(absolutePath, context.workspaceRoot, context.allowedRoots),
	};
}

function resolveGitPathSpec(pathValue: unknown, context: ToolExecutionContext, repoRoot: string): string | undefined {
	if (pathValue === undefined) {
		return undefined;
	}
	if (typeof pathValue !== "string" || pathValue.trim().length === 0) {
		throw new Error("Invalid 'path' argument (must be a non-empty string when provided)");
	}

	const absolutePath = validatePath(pathValue, context.workspaceRoot, context.allowedRoots);
	const relPath = path.relative(repoRoot, absolutePath);
	if (relPath.startsWith("..") || path.isAbsolute(relPath)) {
		throw new Error(`Path '${pathValue}' is outside repository root`);
	}

	return relPath.length === 0 ? "." : relPath.split(path.sep).join("/");
}

async function runGitCommand(repoRoot: string, gitArgs: ReadonlyArray<string>): Promise<GitCommandResult> {
	const proc = Bun.spawn(["git", "-C", repoRoot, ...gitArgs], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);

	return {
		stdout: stdout.trimEnd(),
		stderr: stderr.trim(),
		exitCode,
	};
}

function parseGitCommandError(stderr: string, exitCode: number): { code: string; message: string; hint?: string } | null {
	if (exitCode === 0) {
		return null;
	}

	const normalized = stderr.toLowerCase();
	if (normalized.includes("not a git repository")) {
		return {
			code: "NOT_GIT_REPOSITORY",
			message: "Not a git repository",
			hint: "Run the tool in a folder that contains a .git directory or pass repo_path.",
		};
	}
	if (
		normalized.includes("unknown revision") ||
		normalized.includes("bad revision") ||
		normalized.includes("ambiguous argument")
	) {
		return {
			code: "INVALID_REF",
			message: "Invalid git ref or range",
			hint: "Verify the branch or commit SHA and try again.",
		};
	}
	if (normalized.includes("pathspec")) {
		return {
			code: "INVALID_PATHSPEC",
			message: "Invalid path for this repository",
			hint: "Pass a path that exists under the target repository.",
		};
	}
	if (normalized.includes("does not have any commits yet")) {
		return {
			code: "NO_COMMITS",
			message: "Repository has no commits yet",
		};
	}

	return {
		code: "GIT_COMMAND_FAILED",
		message: stderr || `git exited with code ${exitCode}`,
	};
}

function parseNameStatusLine(line: string): GitChangedFile | null {
	const trimmed = line.trim();
	if (!trimmed) {
		return null;
	}

	const parts = trimmed.split("\t");
	if (parts.length < 2) {
		return null;
	}

	const rawStatus = parts[0] ?? "";
	const status = rawStatus.slice(0, 1) || rawStatus;
	if ((status === "R" || status === "C") && parts.length >= 3) {
		return {
			status,
			raw_status: rawStatus,
			old_path: parts[1],
			path: parts[2],
		};
	}

	return {
		status,
		raw_status: rawStatus,
		path: parts.slice(1).join("\t"),
	};
}

function parseGitStatusPorcelain(stdout: string): { branch: string; files: Array<Record<string, unknown>> } {
	const lines = stdout.split(/\r?\n/).filter(Boolean);
	let branch = "HEAD";
	const files: Array<Record<string, unknown>> = [];

	for (const line of lines) {
		if (line.startsWith("## ")) {
			branch = line.slice(3).trim() || "HEAD";
			continue;
		}
		if (line.length < 3) {
			continue;
		}

		const xy = line.slice(0, 2);
		const rest = line.slice(3).trim();
		if (!rest) {
			continue;
		}

		let currentPath = rest;
		let oldPath: string | undefined;
		if (rest.includes(" -> ")) {
			const [from, to] = rest.split(" -> ");
			oldPath = from;
			currentPath = to ?? rest;
		}

		const indexStatus = xy[0] ?? " ";
		const worktreeStatus = xy[1] ?? " ";
		files.push({
			path: currentPath,
			...(oldPath ? { old_path: oldPath } : {}),
			index_status: indexStatus,
			worktree_status: worktreeStatus,
			raw_status: xy,
			status: xy.trim() || xy,
		});
	}

	return { branch, files };
}

function parseGitHistoryOutput(stdout: string, withFiles: boolean): Array<GitHistoryCommit> {
	const lines = stdout.split(/\r?\n/);
	const commits: Array<GitHistoryCommit> = [];
	let current: {
		sha: string;
		subject: string;
		date: string;
		author: string;
		files: Array<GitChangedFile>;
	} | null = null;

	for (const rawLine of lines) {
		if (!rawLine) {
			continue;
		}

		const headerParts = rawLine.split("\u0000");
		const candidateSha = headerParts[0] ?? "";
		if (headerParts.length >= 4 && /^[0-9a-f]{7,40}$/i.test(candidateSha)) {
			if (current) {
				commits.push({
					sha: current.sha,
					subject: current.subject,
					date: current.date,
					author: current.author,
					...(withFiles ? { files: current.files } : {}),
				});
			}
			current = {
				sha: headerParts[0] ?? "",
				subject: headerParts[1] ?? "",
				date: headerParts[2] ?? "",
				author: headerParts[3] ?? "",
				files: [],
			};
			continue;
		}

		if (!withFiles || !current) {
			continue;
		}

		const parsedFile = parseNameStatusLine(rawLine);
		if (parsedFile) {
			current.files.push(parsedFile);
		}
	}

	if (current) {
		commits.push({
			sha: current.sha,
			subject: current.subject,
			date: current.date,
			author: current.author,
			...(withFiles ? { files: current.files } : {}),
		});
	}

	return commits;
}

function parseBoundedInt(
	value: unknown,
	defaultValue: number,
	fieldName: string,
	opts: { min: number; max: number },
): { ok: true; value: number } | { ok: false; error: string } {
	if (value === undefined) {
		return { ok: true, value: defaultValue };
	}
	if (typeof value !== "number" || !Number.isInteger(value)) {
		return { ok: false, error: `Invalid '${fieldName}' argument (must be an integer)` };
	}
	if (value < opts.min || value > opts.max) {
		return {
			ok: false,
			error: `Invalid '${fieldName}' argument (must be between ${opts.min} and ${opts.max})`,
		};
	}
	return { ok: true, value };
}

/**
 * Git status tool executor
 */
async function executeGitStatus(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	let repo: GitRepoContext;
	let pathSpec: string | undefined;

	try {
		repo = await resolveGitRepoContext(args, context);
		pathSpec = resolveGitPathSpec(args.path, context, repo.absolutePath);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}

	const gitArgs = ["status", "--porcelain=v1", "--branch"];
	if (pathSpec) {
		gitArgs.push("--", pathSpec);
	}

	const result = await runGitCommand(repo.absolutePath, gitArgs);
	const parsedError = parseGitCommandError(result.stderr, result.exitCode);
	if (parsedError) {
		return gitError("git_status", parsedError.code, parsedError.message, parsedError.hint, {
			repo_path: repo.displayPath,
		});
	}

	const parsed = parseGitStatusPorcelain(result.stdout);
	if (parsed.files.length === 0) {
		return gitOk("git_status", "Working tree clean", {
			repo_path: repo.displayPath,
			branch: parsed.branch,
			files: [],
		});
	}

	return gitOk("git_status", `Found ${parsed.files.length} changed file(s)`, {
		repo_path: repo.displayPath,
		branch: parsed.branch,
		files: parsed.files,
	});
}

/**
 * Git diff tool executor
 */
async function executeGitDiff(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	let repo: GitRepoContext;
	let pathSpec: string | undefined;

	try {
		repo = await resolveGitRepoContext(args, context);
		pathSpec = resolveGitPathSpec(args.path, context, repo.absolutePath);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}

	const staged = args.staged === true;
	const fromRef = typeof args.from_ref === "string" && args.from_ref.trim().length > 0 ? args.from_ref.trim() : undefined;
	const toRef = typeof args.to_ref === "string" && args.to_ref.trim().length > 0 ? args.to_ref.trim() : undefined;
	const nameOnly = args.name_only === true;
	const statOnly = args.stat === true;

	const contextLinesParsed = parseBoundedInt(args.context_lines, 3, "context_lines", { min: 0, max: 20 });
	if (!contextLinesParsed.ok) {
		return { success: false, output: "", error: contextLinesParsed.error };
	}
	const maxBytesParsed = parseBoundedInt(args.max_bytes, 250_000, "max_bytes", { min: 1_024, max: 2_000_000 });
	if (!maxBytesParsed.ok) {
		return { success: false, output: "", error: maxBytesParsed.error };
	}

	if (staged && (fromRef || toRef)) {
		return { success: false, output: "", error: "Invalid arguments: use either 'staged' or ref range arguments, not both" };
	}

	const gitArgs = ["diff"];
	if (nameOnly) {
		gitArgs.push("--name-only");
	}
	if (statOnly) {
		gitArgs.push("--stat");
	}
	gitArgs.push(`-U${contextLinesParsed.value}`);

	let mode: "working_tree" | "staged" | "range" = "working_tree";
	if (staged) {
		mode = "staged";
		gitArgs.push("--staged");
	} else if (fromRef || toRef) {
		mode = "range";
		const normalizedFrom = fromRef ?? "HEAD";
		if (toRef) {
			gitArgs.push(`${normalizedFrom}..${toRef}`);
		} else {
			gitArgs.push(normalizedFrom);
		}
	}

	if (pathSpec) {
		gitArgs.push("--", pathSpec);
	}

	const result = await runGitCommand(repo.absolutePath, gitArgs);
	const parsedError = parseGitCommandError(result.stderr, result.exitCode);
	if (parsedError) {
		return gitError("git_diff", parsedError.code, parsedError.message, parsedError.hint, {
			repo_path: repo.displayPath,
			mode,
			...(fromRef ? { from_ref: fromRef } : {}),
			...(toRef ? { to_ref: toRef } : {}),
		});
	}

	let content = result.stdout;
	let truncated = false;
	if (content.length > maxBytesParsed.value) {
		content = content.slice(0, maxBytesParsed.value);
		truncated = true;
	}

	if (content.trim().length === 0) {
		return gitOk("git_diff", "No differences found", {
			repo_path: repo.displayPath,
			mode,
			...(fromRef ? { from_ref: fromRef } : {}),
			...(toRef ? { to_ref: toRef } : {}),
			...(pathSpec ? { path: pathSpec } : {}),
			name_only: nameOnly,
			stat: statOnly,
			context_lines: contextLinesParsed.value,
			truncated,
			content: "",
		});
	}

	return gitOk("git_diff", "Diff retrieved", {
		repo_path: repo.displayPath,
		mode,
		...(fromRef ? { from_ref: fromRef } : {}),
		...(toRef ? { to_ref: toRef } : {}),
		...(pathSpec ? { path: pathSpec } : {}),
		name_only: nameOnly,
		stat: statOnly,
		context_lines: contextLinesParsed.value,
		truncated,
		content,
	});
}

/**
 * Shared history/log implementation.
 */
async function executeGitHistoryLike(
	toolName: "git_history" | "git_log",
	args: Record<string, unknown>,
	context: ToolExecutionContext,
	defaultWithFiles: boolean,
): Promise<ToolResult> {
	let repo: GitRepoContext;
	let pathSpec: string | undefined;
	try {
		repo = await resolveGitRepoContext(args, context);
		pathSpec = resolveGitPathSpec(args.path, context, repo.absolutePath);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}

	const ref = typeof args.ref === "string" && args.ref.trim().length > 0 ? args.ref.trim() : "HEAD";
	const skipParsed = parseBoundedInt(args.skip, 0, "skip", { min: 0, max: 100_000 });
	if (!skipParsed.ok) {
		return { success: false, output: "", error: skipParsed.error };
	}

	const limitInput = args.limit ?? args.count;
	const limitParsed = parseBoundedInt(limitInput, 10, "limit", { min: 1, max: 200 });
	if (!limitParsed.ok) {
		return { success: false, output: "", error: limitParsed.error };
	}

	const withFiles = typeof args.with_files === "boolean" ? args.with_files : defaultWithFiles;
	const limit = limitParsed.value;
	const maxCount = limit + 1;

	const gitArgs = [
		"log",
		ref,
		`--skip=${skipParsed.value}`,
		`--max-count=${maxCount}`,
		"--date=iso-strict",
		'--pretty=format:%H%x00%s%x00%ai%x00%an',
	];
	if (withFiles) {
		gitArgs.push("--name-status");
	}
	if (pathSpec) {
		gitArgs.push("--", pathSpec);
	}

	const result = await runGitCommand(repo.absolutePath, gitArgs);
	const parsedError = parseGitCommandError(result.stderr, result.exitCode);
	if (parsedError) {
		return gitError(toolName, parsedError.code, parsedError.message, parsedError.hint, {
			repo_path: repo.displayPath,
			ref,
			skip: skipParsed.value,
			limit,
		});
	}

	const commits = parseGitHistoryOutput(result.stdout, withFiles);
	const hasMore = commits.length > limit;
	const visibleCommits = hasMore ? commits.slice(0, limit) : commits;

	return gitOk(toolName, `Retrieved ${visibleCommits.length} commit(s)`, {
		repo_path: repo.displayPath,
		ref,
		skip: skipParsed.value,
		limit,
		has_more: hasMore,
		next_skip: hasMore ? skipParsed.value + limit : null,
		with_files: withFiles,
		commits: visibleCommits,
	});
}

/**
 * Git history tool executor
 */
async function executeGitHistory(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	return await executeGitHistoryLike("git_history", args, context, true);
}

/**
 * Git log tool executor (alias with concise defaults).
 */
async function executeGitLog(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const oneline = args.oneline !== false;
	const normalizedArgs: Record<string, unknown> = {
		...args,
		...(args.with_files === undefined ? { with_files: !oneline } : {}),
	};
	return await executeGitHistoryLike("git_log", normalizedArgs, context, false);
}

/**
 * Git show tool executor
 */
async function executeGitShow(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const sha = typeof args.sha === "string" && args.sha.trim().length > 0 ? args.sha.trim() : null;
	if (!sha) {
		return { success: false, output: "", error: "Missing or invalid 'sha' argument" };
	}

	let repo: GitRepoContext;
	let pathSpec: string | undefined;
	try {
		repo = await resolveGitRepoContext(args, context);
		pathSpec = resolveGitPathSpec(args.path, context, repo.absolutePath);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}

	const patch = args.patch !== false;
	const statEnabled = args.stat !== false;
	const contextLinesParsed = parseBoundedInt(args.context_lines, 3, "context_lines", { min: 0, max: 20 });
	if (!contextLinesParsed.ok) {
		return { success: false, output: "", error: contextLinesParsed.error };
	}

	const gitArgs = ["show", sha];
	if (!patch) {
		gitArgs.push("--no-patch");
	}
	if (!statEnabled) {
		gitArgs.push("--no-stat");
	}
	if (patch) {
		gitArgs.push(`-U${contextLinesParsed.value}`);
	}
	if (pathSpec) {
		gitArgs.push("--", pathSpec);
	}

	const result = await runGitCommand(repo.absolutePath, gitArgs);
	const parsedError = parseGitCommandError(result.stderr, result.exitCode);
	if (parsedError) {
		return gitError("git_show", parsedError.code, parsedError.message, parsedError.hint, {
			repo_path: repo.displayPath,
			sha,
		});
	}

	const output = result.stdout.trimEnd();
	return gitOk("git_show", output.length > 0 ? "Commit details retrieved" : "No output for requested commit view", {
		repo_path: repo.displayPath,
		sha,
		...(pathSpec ? { path: pathSpec } : {}),
		patch,
		stat: statEnabled,
		context_lines: contextLinesParsed.value,
		content: output,
	});
}

/**
 * Git changed-files executor
 */
async function executeGitChangedFiles(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const fromRef = typeof args.from_ref === "string" && args.from_ref.trim().length > 0 ? args.from_ref.trim() : null;
	const toRef = typeof args.to_ref === "string" && args.to_ref.trim().length > 0 ? args.to_ref.trim() : null;
	if (!fromRef || !toRef) {
		return { success: false, output: "", error: "Missing required arguments: 'from_ref' and 'to_ref'" };
	}

	let repo: GitRepoContext;
	let pathSpec: string | undefined;
	try {
		repo = await resolveGitRepoContext(args, context);
		pathSpec = resolveGitPathSpec(args.path, context, repo.absolutePath);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}

	const gitArgs = ["diff", "--name-status", `${fromRef}..${toRef}`];
	if (pathSpec) {
		gitArgs.push("--", pathSpec);
	}

	const result = await runGitCommand(repo.absolutePath, gitArgs);
	const parsedError = parseGitCommandError(result.stderr, result.exitCode);
	if (parsedError) {
		return gitError("git_changed_files", parsedError.code, parsedError.message, parsedError.hint, {
			repo_path: repo.displayPath,
			from_ref: fromRef,
			to_ref: toRef,
		});
	}

	const files = result.stdout
		.split(/\r?\n/)
		.map(line => parseNameStatusLine(line))
		.filter((entry): entry is GitChangedFile => entry !== null);

	return gitOk("git_changed_files", `Found ${files.length} changed file(s)`, {
		repo_path: repo.displayPath,
		from_ref: fromRef,
		to_ref: toRef,
		...(pathSpec ? { path: pathSpec } : {}),
		files,
	});
}

// =============================================================================
// SECTION: Shell Tool
// =============================================================================

/**
 * Default allowed shell command prefixes
 */
const DEFAULT_ALLOWED_COMMANDS = [
	"npm",
	"npx",
	"node",
	"bun",
	"bunx",
	"pnpm",
	"yarn",
	"cat",
	"head",
	"tail",
	"wc",
	"sort",
	"uniq",
	"echo",
	"pwd",
	"which",
	"env",
	"grep",
	"find",
	"ls",
	"tree",
	"git",
];

/**
 * Default denied shell command patterns
 */
const DEFAULT_DENIED_PATTERNS = [
	/^rm\s+-rf\s+[/~]/i, // rm -rf with absolute paths
	/sudo/i,
	/chmod\s+777/i,
	/curl.*\|\s*sh/i,
	/wget.*\|\s*sh/i,
	/eval\s/i,
	/>\s*\/dev\//i,
	/mkfs/i,
	/dd\s+if=/i,
];

/**
 * Checks if a shell command is allowed
 */
function isShellCommandAllowed(
	command: string,
	permissions?: ToolPermissionConfig,
): { allowed: boolean; reason?: string } {
	const trimmed = command.trim();
	const firstWord = trimmed.split(/\s+/)[0];

	// Check denied patterns first
	const deniedPatterns = permissions?.shell?.deniedPatterns?.map(p => new RegExp(p)) ?? DEFAULT_DENIED_PATTERNS;
	for (const pattern of deniedPatterns) {
		if (pattern.test(trimmed)) {
			return { allowed: false, reason: `Command matches denied pattern: ${pattern.source}` };
		}
	}

	// Check allowed commands
	const allowedCommands = permissions?.shell?.allowedCommands ?? DEFAULT_ALLOWED_COMMANDS;
	if (!firstWord) {
		return { allowed: false, reason: "Empty command" };
	}
	const isAllowed = allowedCommands.some(prefix => firstWord === prefix || firstWord.startsWith(`${prefix}/`));

	if (!isAllowed) {
		return { allowed: false, reason: `Command '${firstWord}' is not in the allowed list` };
	}

	return { allowed: true };
}

/**
 * Shell command tool executor
 */
async function executeShell(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
	const command = args.command;
	const cwd = (args.cwd as string) ?? ".";
	const timeout = Math.min(typeof args.timeout === "number" ? args.timeout : 30000, 60000);

	if (typeof command !== "string") {
		return { success: false, output: "", error: "Missing or invalid 'command' argument" };
	}

	// Validate working directory
	let workingDir: string;
	try {
		workingDir = validatePath(cwd, context.workspaceRoot, context.allowedRoots);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}

	// Check if command is allowed
	const { allowed, reason } = isShellCommandAllowed(command, context.permissions);
	if (!allowed) {
		return { success: false, output: "", error: reason };
	}

	// Check if confirmation is required (and not already confirmed)
	if (!context.skipConfirmation) {
		return {
			success: false,
			output: "",
			error: "CONFIRMATION_REQUIRED",
			confirmationMessage: `Execute shell command: ${command}`,
		};
	}

	try {
		// Use Bun.spawn with timeout for better control
		const proc = Bun.spawn(["sh", "-c", command], {
			cwd: workingDir,
			stdout: "pipe",
			stderr: "pipe",
		});

		// Set up timeout
		const timeoutPromise = new Promise<"timeout">(resolve => {
			setTimeout(() => resolve("timeout"), timeout);
		});

		const exitPromise = proc.exited.then(() => "done" as const);
		const result = await Promise.race([exitPromise, timeoutPromise]);

		if (result === "timeout") {
			proc.kill();
			return { success: false, output: "", error: `Command timed out after ${timeout}ms` };
		}

		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();

		let output = stdout.trim();
		if (stderr.trim()) {
			output += output ? `\n\nSTDERR:\n${stderr.trim()}` : `STDERR:\n${stderr.trim()}`;
		}

		const exitCode = await proc.exited;
		if (exitCode !== 0) {
			return { success: false, output, error: `Command exited with code ${exitCode}` };
		}

		return { success: true, output: output || "(no output)" };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, output: "", error: message };
	}
}

// =============================================================================
// SECTION: Tool Registry
// =============================================================================

const toolExecutors: Map<string, ToolExecutor> = new Map([
	["read_file", executeReadFile],
	["read_file_range", executeReadFileRange],
	["write_file", executeWriteFile],
	["edit_article", executeEditArticle],
	["upsert_frontmatter", executeUpsertFrontmatter],
	["ls", executeLs],
	["mkdir", executeMkdir],
	["rm", executeRm],
	["mv", executeMv],
	["cp", executeCp],
	["grep", executeGrep],
	["rg_search", executeRgSearch],
	["find", executeFind],
	["git_status", executeGitStatus],
	["git_diff", executeGitDiff],
	["git_history", executeGitHistory],
	["git_log", executeGitLog],
	["git_show", executeGitShow],
	["git_changed_files", executeGitChangedFiles],
	["shell", executeShell],
]);

/**
 * Tools that require user confirmation before execution
 */
const toolsRequiringConfirmation: Set<string> = new Set(["rm", "shell"]);

const toolDefinitions: Map<string, ToolManifestEntry> = new Map([
	[
		"read_file",
		{
			name: "read_file",
			description: "Read contents of a file",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string", description: "File path relative to workspace root" },
				},
				required: ["path"],
			},
		},
	],
	[
		"read_file_range",
		{
			name: "read_file_range",
			description: "Read a specific line range from a file (with line numbers)",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string", description: "File path relative to workspace root" },
					start: { type: "number", description: "1-based start line (inclusive)" },
					end: { type: "number", description: "1-based end line (inclusive)" },
				},
				required: ["path", "start", "end"],
			},
		},
	],
	[
		"write_file",
		{
			name: "write_file",
			description: "Write contents to a file under the workspace root (vault only)",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string", description: "File path relative to workspace root (vault only)" },
					content: { type: "string", description: "Content to write" },
				},
				required: ["path", "content"],
			},
		},
	],
	[
		"upsert_frontmatter",
		{
			name: "upsert_frontmatter",
			description:
				"Upsert/remove frontmatter fields under the workspace root (vault only) while validating managed schema (jrn, attention). Returns detailed validation errors.",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string", description: "Markdown file path relative to workspace root (vault only)" },
					set: {
						type: "object",
						description: "Fields to merge into frontmatter",
						additionalProperties: true,
					},
					remove: {
						type: "array",
						description: "Top-level frontmatter keys to remove",
						items: { type: "string" },
					},
				},
				required: ["path"],
			},
		},
	],
	[
		"edit_article",
		{
			name: "edit_article",
			description:
				"Make targeted edits to a documentation article under the workspace root (vault only). Each edit's old_string MUST be unique in the file.",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string", description: "Path to the article relative to workspace root (vault only)" },
					edits: {
						type: "array",
						description: "Array of edits to apply",
						items: {
							type: "object",
							properties: {
								old_string: {
									type: "string",
									description:
										"Exact text to find and replace. MUST be unique in the file - include surrounding context (headings, preceding lines) if needed",
								},
								new_string: { type: "string", description: "Replacement text" },
								reason: {
									type: "string",
									description: "Why this change is needed (reference the code change)",
								},
							},
							required: ["old_string", "new_string", "reason"],
						},
					},
				},
				required: ["path", "edits"],
			},
		},
	],
	[
		"ls",
		{
			name: "ls",
			description: "List directory contents",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string", description: "Directory path relative to workspace root" },
				},
				required: ["path"],
			},
		},
	],
	[
		"mkdir",
		{
			name: "mkdir",
			description: "Create a directory under the workspace root (vault only)",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string", description: "Directory path relative to workspace root (vault only)" },
				},
				required: ["path"],
			},
		},
	],
	[
		"rm",
		{
			name: "rm",
			description:
				"Remove a file or directory under the workspace root (vault only). For directories, use recursive: true. Requires confirmation.",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string", description: "Path to remove relative to workspace root (vault only)" },
					recursive: {
						type: "boolean",
						description: "Remove directories recursively (required for non-empty dirs)",
					},
				},
				required: ["path"],
			},
			requiresConfirmation: true,
		},
	],
	[
		"mv",
		{
			name: "mv",
			description: "Move or rename a file or directory within the workspace root (vault only)",
			inputSchema: {
				type: "object",
				properties: {
					source: { type: "string", description: "Source path relative to workspace root (vault only)" },
					destination: {
						type: "string",
						description: "Destination path relative to workspace root (vault only)",
					},
				},
				required: ["source", "destination"],
			},
		},
	],
	[
		"cp",
		{
			name: "cp",
			description:
				"Copy a file or directory into the workspace root (vault only). Source can be in workspace or configured source roots.",
			inputSchema: {
				type: "object",
				properties: {
					source: {
						type: "string",
						description: "Source path under workspace root or configured source roots",
					},
					destination: {
						type: "string",
						description: "Destination path relative to workspace root (vault only)",
					},
					recursive: { type: "boolean", description: "Copy directories recursively" },
				},
				required: ["source", "destination"],
			},
		},
	],
	[
		"grep",
		{
			name: "grep",
			description: "Search file contents with regex pattern",
			inputSchema: {
				type: "object",
				properties: {
					pattern: { type: "string", description: "Regex pattern to search for" },
					path: { type: "string", description: "File or directory to search in (default: '.')" },
					recursive: { type: "boolean", description: "Search recursively in directories (default: true)" },
					ignoreCase: { type: "boolean", description: "Case-insensitive search (default: false)" },
					maxResults: { type: "number", description: "Maximum number of results (default: 100)" },
				},
				required: ["pattern"],
			},
		},
	],
	[
		"find",
		{
			name: "find",
			description: "Find files matching a glob pattern",
			inputSchema: {
				type: "object",
				properties: {
					pattern: { type: "string", description: "Glob pattern (e.g., '**/*.ts', 'src/**/*.test.ts')" },
					path: { type: "string", description: "Directory to search in (default: '.')" },
					type: {
						type: "string",
						enum: ["file", "directory", "all"],
						description: "Type of entries to find (default: 'all')",
					},
					maxResults: { type: "number", description: "Maximum number of results (default: 100)" },
				},
				required: ["pattern"],
			},
		},
	],
	[
		"rg_search",
		{
			name: "rg_search",
			description: "Fast code/content search using ripgrep, with optional glob filters and context lines",
			inputSchema: {
				type: "object",
				properties: {
					pattern: { type: "string", description: "Regex pattern to search for" },
					path: { type: "string", description: "File or directory to search in (default: '.')" },
					globs: {
						type: "array",
						description: "Optional include globs passed to rg via -g",
						items: { type: "string" },
					},
					ignoreCase: { type: "boolean", description: "Case-insensitive search (default: false)" },
					contextLines: {
						type: "number",
						description: "Lines of context before/after each match (default: 0, max: 20)",
					},
					maxResults: { type: "number", description: "Maximum matches to return (default: 100, max: 2000)" },
				},
				required: ["pattern"],
			},
		},
	],
	[
		"git_status",
		{
			name: "git_status",
			description: "Inspect working tree state (branch + changed files). Returns structured JSON output.",
			inputSchema: {
				type: "object",
				properties: {
					repo_path: { type: "string", description: "Optional repository directory relative to workspace root" },
					path: { type: "string", description: "Optional path filter inside the repository" },
				},
				required: [],
			},
		},
	],
	[
		"git_diff",
		{
			name: "git_diff",
			description:
				"Show git diff for working tree, staged changes, or a ref range. Returns structured JSON output with the diff text.",
			inputSchema: {
				type: "object",
				properties: {
					repo_path: { type: "string", description: "Optional repository directory relative to workspace root" },
					from_ref: { type: "string", description: "Start ref for diff mode (default: HEAD when to_ref is set)" },
					to_ref: { type: "string", description: "End ref for range diff mode" },
					staged: { type: "boolean", description: "Use staged diff mode (mutually exclusive with refs)" },
					path: { type: "string", description: "Optional path filter inside repository" },
					name_only: { type: "boolean", description: "Return only file names changed (no patch)" },
					stat: { type: "boolean", description: "Return diff stat summary" },
					context_lines: { type: "number", description: "Unified diff context lines (0-20, default 3)" },
					max_bytes: { type: "number", description: "Soft truncation cap for returned diff text (1024-2000000)" },
				},
				required: [],
			},
		},
	],
	[
		"git_history",
		{
			name: "git_history",
			description: "Browse commit history with pagination and optional file change details.",
			inputSchema: {
				type: "object",
				properties: {
					repo_path: { type: "string", description: "Optional repository directory relative to workspace root" },
					ref: { type: "string", description: "Starting ref (default: HEAD)" },
					skip: { type: "number", description: "Commit offset from newest commit (default: 0)" },
					limit: { type: "number", description: "Maximum commits to return (1-200, default: 10)" },
					path: { type: "string", description: "Optional path filter inside repository" },
					with_files: { type: "boolean", description: "Include changed files for each commit (default: true)" },
				},
				required: [],
			},
		},
	],
	[
		"git_log",
		{
			name: "git_log",
			description: "Alias for git history with concise defaults (compatible with existing count/oneline usage).",
			inputSchema: {
				type: "object",
				properties: {
					repo_path: { type: "string", description: "Optional repository directory relative to workspace root" },
					ref: { type: "string", description: "Starting ref (default: HEAD)" },
					skip: { type: "number", description: "Commit offset from newest commit (default: 0)" },
					limit: { type: "number", description: "Maximum commits to return (1-200, default: 10)" },
					count: { type: "number", description: "Backward-compatible alias for limit" },
					oneline: { type: "boolean", description: "Legacy compatibility flag; defaults to true for concise mode" },
					path: { type: "string", description: "Optional path filter inside repository" },
					with_files: { type: "boolean", description: "Include changed files for each commit" },
				},
				required: [],
			},
		},
	],
	[
		"git_show",
		{
			name: "git_show",
			description: "Inspect a single commit with optional patch/stat controls.",
			inputSchema: {
				type: "object",
				properties: {
					repo_path: { type: "string", description: "Optional repository directory relative to workspace root" },
					sha: { type: "string", description: "Commit SHA or ref to inspect" },
					path: { type: "string", description: "Optional path filter inside repository" },
					patch: { type: "boolean", description: "Include patch output (default: true)" },
					stat: { type: "boolean", description: "Include stat output (default: true)" },
					context_lines: { type: "number", description: "Unified diff context lines when patch=true (0-20, default 3)" },
				},
				required: ["sha"],
			},
		},
	],
	[
		"git_changed_files",
		{
			name: "git_changed_files",
			description: "List changed files between two refs with status codes (A/M/D/R/C).",
			inputSchema: {
				type: "object",
				properties: {
					repo_path: { type: "string", description: "Optional repository directory relative to workspace root" },
					from_ref: { type: "string", description: "Start ref" },
					to_ref: { type: "string", description: "End ref" },
					path: { type: "string", description: "Optional path filter inside repository" },
				},
				required: ["from_ref", "to_ref"],
			},
		},
	],
	[
		"shell",
		{
			name: "shell",
			description: "Execute a shell command in the workspace. Limited to safe commands. Requires confirmation.",
			inputSchema: {
				type: "object",
				properties: {
					command: { type: "string", description: "Shell command to execute" },
					cwd: {
						type: "string",
						description:
							"Working directory relative to workspace root, or an absolute path under workspace/configured source roots (default: '.')",
					},
					timeout: { type: "number", description: "Timeout in milliseconds (default: 30000, max: 60000)" },
				},
				required: ["command"],
			},
			requiresConfirmation: true,
		},
	],
]);

// =============================================================================
// SECTION: Tool Host Implementation
// =============================================================================

const DEFAULT_MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB

/**
 * Options for creating a tool host
 */
export interface CreateToolHostOptions {
	readonly allowedTools?: ReadonlyArray<string>;
	readonly allowedRoots?: ReadonlyArray<string>;
	readonly sourceNames?: ReadonlyArray<string>;
	readonly permissions?: ToolPermissionConfig;
}

/**
 * Creates a new tool host instance with the specified configuration.
 */
export function createToolHost(
	workspaceRoot: string,
	options?: CreateToolHostOptions | ReadonlyArray<string>,
): ToolHost {
	// Support both old signature (array) and new signature (options object)
	const opts: CreateToolHostOptions = Array.isArray(options) ? { allowedTools: options } : (options ?? {});
	const workspaceRootResolved = path.resolve(workspaceRoot);
	const allowedRoots = Array.from(
		new Set((opts.allowedRoots ?? []).map(root => path.resolve(root)).filter(root => root !== workspaceRootResolved)),
	);
	const sourceNames = Array.from(
		new Set((opts.sourceNames ?? []).map(name => name.trim()).filter(name => name.length > 0)),
	).sort((a, b) => a.localeCompare(b));

	const allowedSet = opts.allowedTools ? new Set(opts.allowedTools) : new Set(toolExecutors.keys());

	// Remove disabled tools
	if (opts.permissions?.disabledTools) {
		for (const tool of opts.permissions.disabledTools) {
			allowedSet.delete(tool);
		}
	}

	const config: ToolHostConfig = {
		workspaceRoot: workspaceRootResolved,
		allowedRoots,
		sourceNames,
		maxOutputSize: DEFAULT_MAX_OUTPUT_SIZE,
		allowedTools: allowedSet,
		permissions: opts.permissions,
	};

	return {
		config,

		requiresConfirmation(toolName: string): boolean {
			// Check if tool requires confirmation by default
			if (toolsRequiringConfirmation.has(toolName)) {
				return true;
			}
			// Check if tool is in the custom confirmation list
			if (config.permissions?.confirmationRequired?.includes(toolName)) {
				return true;
			}
			return false;
		},

		async execute(
			toolName: string,
			args: Record<string, unknown>,
			skipConfirmation?: boolean,
		): Promise<ToolResult> {
			if (!config.allowedTools.has(toolName)) {
				return { success: false, output: "", error: `Tool not allowed: ${toolName}` };
			}

			const executor = toolExecutors.get(toolName);
			if (!executor) {
				return { success: false, output: "", error: `Unknown tool: ${toolName}` };
			}

			logger.info("Executing tool: %s", toolName);
			const startTime = Date.now();

				try {
					const context: ToolExecutionContext = {
						workspaceRoot: config.workspaceRoot,
						allowedRoots: config.allowedRoots,
						sourceNames: config.sourceNames,
						permissions: config.permissions,
						skipConfirmation,
					};

				const result = await executor(args, context);
				const sanitizedResult = sanitizeToolResult(result);
				const duration = Date.now() - startTime;
				logger.info("Tool %s completed in %dms (success: %s)", toolName, duration, sanitizedResult.success);

				// Truncate output if too large
				if (sanitizedResult.output.length > config.maxOutputSize) {
					const truncated = sanitizedResult.output.slice(0, config.maxOutputSize);
					return {
						success: sanitizedResult.success,
						output: `${truncated}\n\n[Output truncated at ${config.maxOutputSize} bytes]`,
						error: sanitizedResult.error,
						confirmationMessage: sanitizedResult.confirmationMessage,
					};
				}

				return sanitizedResult;
			} catch (err) {
				logError(logger, err, `Tool ${toolName} failed`);
				const message = err instanceof Error ? err.message : String(err);
				return { success: false, output: "", error: stripNullChars(message) };
			}
		},

		getManifest(): ToolManifest {
			const tools: Array<ToolManifestEntry> = [];
			for (const name of config.allowedTools) {
				const def = toolDefinitions.get(name);
				if (def) {
					tools.push(def);
				}
			}
			return { tools };
		},
	};
}

// =============================================================================
// SECTION: Exports
// =============================================================================

export {
	validatePath,
	toRelativePath,
	executeReadFile,
	executeReadFileRange,
	executeWriteFile,
	executeEditArticle,
	executeUpsertFrontmatter,
	executeLs,
	executeMkdir,
	executeRm,
	executeMv,
	executeCp,
	executeGrep,
	executeRgSearch,
	executeFind,
	executeGitStatus,
	executeGitDiff,
	executeGitHistory,
	executeGitLog,
	executeGitShow,
	executeGitChangedFiles,
	executeShell,
	toolExecutors,
	toolDefinitions,
	toolsRequiringConfirmation,
	DEFAULT_MAX_OUTPUT_SIZE,
	DEFAULT_ALLOWED_COMMANDS,
	DEFAULT_DENIED_PATTERNS,
	isShellCommandAllowed,
};
