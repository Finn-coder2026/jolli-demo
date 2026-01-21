import { compile } from "@mdx-js/mdx";
import type { OpenApiValidationError } from "jolli-common";
import { parse as parseYaml } from "yaml";

/**
 * Type for YAML parse errors with line position info
 */
interface YamlParseErrorLike {
	message: string;
	linePos?: Array<{ line?: number; col?: number }>;
}

/**
 * Type for VFile messages from MDX compilation
 */
interface VFileMessage {
	message: string;
	reason?: string;
	line?: number;
	column?: number;
	source?: string;
	ruleId?: string;
	position?: {
		start?: { line?: number; column?: number };
		end?: { line?: number; column?: number };
	};
}

/**
 * Result of MDX validation
 */
export interface MdxValidationResult {
	/** Whether the MDX content is valid */
	isValid: boolean;
	/** Validation errors (using OpenApiValidationError for UI compatibility) */
	errors: Array<OpenApiValidationError>;
}

/**
 * Result of batch MDX validation
 */
export interface MdxBatchValidationResult {
	/** Whether all files are valid */
	isValid: boolean;
	/** Results per file path */
	results: Map<string, MdxValidationResult>;
	/** Total error count */
	errorCount: number;
	/** Total warning count */
	warningCount: number;
}

/**
 * Extracts frontmatter from MDX content
 * Returns the frontmatter string (without delimiters) and the line offset
 */
function extractFrontmatter(content: string): { frontmatter: string | null; lineOffset: number } {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) {
		return { frontmatter: null, lineOffset: 0 };
	}
	// Count lines in frontmatter section (including both --- delimiters)
	const frontmatterLines = match[0].split("\n").length;
	return { frontmatter: match[1], lineOffset: frontmatterLines };
}

/**
 * Validates frontmatter YAML syntax
 */
function validateFrontmatter(content: string): Array<OpenApiValidationError> {
	const { frontmatter } = extractFrontmatter(content);

	if (!frontmatter) {
		return [];
	}

	try {
		parseYaml(frontmatter);
		return [];
	} catch (e) {
		const yamlError = e as YamlParseErrorLike;
		// Frontmatter starts at line 2 (after the opening ---)
		const errorLine = yamlError.linePos?.[0]?.line ? yamlError.linePos[0].line + 1 : 2;
		return [
			{
				message: `Frontmatter YAML error: ${yamlError.message}`,
				line: errorLine,
				column: yamlError.linePos?.[0]?.col,
				severity: "error",
			},
		];
	}
}

/**
 * Extracts line and column from MDX compilation error
 * MDX errors often include position in the message like "(5:1-5:6)" when line/column props are undefined
 * @internal Exported for testing
 */
export function extractErrorPosition(error: unknown): { line?: number; column?: number } {
	/* v8 ignore next 3 - defensive check, error is always an object from catch */
	if (!error || typeof error !== "object") {
		return {};
	}

	const err = error as VFileMessage & { line?: number; column?: number };

	// Try direct line/column properties (most common for MDX errors)
	if (err.line !== undefined) {
		const result: { line?: number; column?: number } = { line: err.line };
		if (err.column !== undefined) {
			result.column = err.column;
		}
		return result;
	}

	/* v8 ignore start - position object format may occur with some MDX errors */
	// Try position object (VFile format)
	if (err.position?.start) {
		const result: { line?: number; column?: number } = {};
		if (err.position.start.line !== undefined) {
			result.line = err.position.start.line;
		}
		if (err.position.start.column !== undefined) {
			result.column = err.position.start.column;
		}
		return result;
	}
	/* v8 ignore stop */

	// Try to extract position from message like "(5:1-5:6)" or "(5:1)"
	const message = err.reason || err.message || "";
	const posMatch = message.match(/\((\d+):(\d+)(?:-\d+:\d+)?\)\s*$/);
	if (posMatch) {
		return {
			line: Number.parseInt(posMatch[1], 10),
			column: Number.parseInt(posMatch[2], 10),
		};
	}

	return {};
}

/**
 * Validates MDX content by attempting to compile it
 *
 * @param content - The MDX content to validate
 * @param filePath - Optional file path for error messages
 * @returns Validation result with errors
 */
export async function validateMdxContent(content: string, filePath?: string): Promise<MdxValidationResult> {
	const errors: Array<OpenApiValidationError> = [];

	// Step 1: Validate frontmatter YAML
	const frontmatterErrors = validateFrontmatter(content);
	errors.push(...frontmatterErrors);

	// Step 2: Validate MDX syntax by compiling
	try {
		await compile(content, {
			// Don't output anything, just validate
			development: false,
			// Use MDX format
			format: "mdx",
		});
	} catch (e) {
		const error = e as Error & VFileMessage;
		const position = extractErrorPosition(error);

		// Clean up the error message
		/* v8 ignore next - MDX errors always have reason or message */
		const message = error.reason || error.message || "Unknown MDX compilation error";

		errors.push({
			message,
			path: filePath,
			line: position.line,
			column: position.column,
			severity: "error",
		});
	}

	return {
		isValid: errors.length === 0,
		errors,
	};
}

/**
 * Validates multiple MDX files in parallel
 *
 * @param files - Map of file path to content
 * @param concurrency - Maximum concurrent validations (default: 10)
 * @returns Batch validation result
 */
export async function validateMdxBatch(
	files: Map<string, string>,
	concurrency = 10,
): Promise<MdxBatchValidationResult> {
	const results = new Map<string, MdxValidationResult>();
	const entries = Array.from(files.entries());

	// Process in chunks for concurrency control
	for (let i = 0; i < entries.length; i += concurrency) {
		const chunk = entries.slice(i, i + concurrency);

		const chunkResults = await Promise.allSettled(
			chunk.map(async ([path, content]) => {
				const result = await validateMdxContent(content, path);
				return { path, result };
			}),
		);

		// Collect results
		for (const settled of chunkResults) {
			if (settled.status === "fulfilled") {
				const { path, result } = settled.value;
				results.set(path, result);
			} /* v8 ignore start - defensive: validateMdxContent catches all errors internally */ else {
				// Validation threw an unexpected error
				const path = chunk[chunkResults.indexOf(settled)][0];
				results.set(path, {
					isValid: false,
					errors: [
						{
							message: `Validation crashed: ${settled.reason}`,
							path,
							severity: "error",
						},
					],
				});
			} /* v8 ignore stop */
		}
	}

	// Aggregate results
	let errorCount = 0;
	let warningCount = 0;
	let isValid = true;

	for (const result of results.values()) {
		if (!result.isValid) {
			isValid = false;
		}
		for (const error of result.errors) {
			if (error.severity === "error") {
				errorCount++;
			} /* v8 ignore start - MDX validation only produces errors, not warnings */ else {
				warningCount++;
			} /* v8 ignore stop */
		}
	}

	return {
		isValid,
		results,
		errorCount,
		warningCount,
	};
}

/**
 * Formats MDX validation errors for display
 *
 * @param errors - Array of validation errors
 * @returns Formatted error string
 */
export function formatMdxValidationErrors(errors: Array<OpenApiValidationError>): string {
	if (errors.length === 0) {
		return "No errors";
	}

	return errors
		.map(e => {
			const location = e.line ? ` (line ${e.line}${e.column ? `, column ${e.column}` : ""})` : "";
			const file = e.path ? `${e.path}` : "";
			const severity = e.severity === "warning" ? "[Warning]" : "[Error]";

			if (file && location) {
				return `${file}:${e.line}${e.column ? `:${e.column}` : ""}\n${severity} ${e.message}`;
			}
			if (file) {
				return `${file}\n${severity} ${e.message}`;
			}
			return `${severity}${location}: ${e.message}`;
		})
		.join("\n\n");
}
