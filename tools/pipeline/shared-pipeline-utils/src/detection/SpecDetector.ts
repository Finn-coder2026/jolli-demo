/**
 * Detects existing OpenAPI/Swagger specifications in a repository.
 *
 * Phase 1 of the intelligent extraction flow - before attempting code analysis,
 * check if the repository already has OpenAPI/Swagger specifications.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { glob } from "glob";

/** Patterns to search for existing OpenAPI specs */
const SPEC_PATTERNS = [
	// Root level specs
	"openapi.json",
	"openapi.yaml",
	"openapi.yml",
	"swagger.json",
	"swagger.yaml",
	"swagger.yml",
	"api-spec.json",
	"api-spec.yaml",
	"api-spec.yml",

	// Common directories
	"docs/openapi.*",
	"docs/api/**/*.yaml",
	"docs/api/**/*.json",
	"docs/swagger.*",
	"api/openapi.*",
	"api/openapi-spec/**/*.json",
	"api/openapi-spec/**/*.yaml",
	"api/swagger.*",
	"spec/openapi.*",
	"specs/**/*.yaml",
	"specs/**/*.json",

	// Public directories (like NodeBB)
	"public/openapi/**/*.yaml",
	"public/openapi/**/*.json",
	"public/swagger/**/*.yaml",

	// Generated output directories
	"dist/openapi.*",
	"build/openapi.*",
	".output/openapi.*",
];

/** Directories to exclude from search */
const EXCLUDE_DIRS = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"];

export interface SpecInfo {
	/** Path to the spec file relative to repo root */
	path: string;
	/** OpenAPI/Swagger version */
	version: "2.0" | "3.0.0" | "3.0.1" | "3.0.2" | "3.0.3" | "3.1.0";
	/** Number of paths defined */
	pathCount: number;
	/** API title from info section */
	title?: string;
	/** API description */
	description?: string;
}

export interface SpecDetectionResult {
	/** Whether any specs were found */
	found: boolean;
	/** List of detected specs */
	specs: Array<SpecInfo>;
	/** Merged spec if multiple were found */
	merged?: Record<string, unknown>;
	/** Primary spec (recommended to use) */
	primary?: SpecInfo;
}

/**
 * Detects existing OpenAPI specifications in a repository.
 * @param repoPath - Path to the repository root
 * @returns Detection result with found specs
 */
export async function detectExistingSpecs(repoPath: string): Promise<SpecDetectionResult> {
	const specs: Array<SpecInfo> = [];

	// Search for spec files
	const foundFiles: Array<string> = [];
	for (const pattern of SPEC_PATTERNS) {
		const matches = await glob(pattern, {
			cwd: repoPath,
			absolute: false,
			ignore: EXCLUDE_DIRS,
		});
		foundFiles.push(...matches);
	}

	// Remove duplicates
	const uniqueFiles = [...new Set(foundFiles)];

	// Parse each found file
	for (const file of uniqueFiles) {
		const fullPath = path.join(repoPath, file);
		const specInfo = await parseSpecFile(fullPath, file);
		if (specInfo) {
			specs.push(specInfo);
		}
	}

	// Sort by path count (most complete first)
	specs.sort((a, b) => b.pathCount - a.pathCount);

	const result: SpecDetectionResult = {
		found: specs.length > 0,
		specs,
	};

	if (specs.length > 0) {
		result.primary = specs[0];
	}

	return result;
}

/**
 * Parses a spec file and extracts metadata.
 * @param fullPath - Full path to the file
 * @param relativePath - Relative path for reporting
 * @returns Spec info or null if not a valid spec
 */
async function parseSpecFile(fullPath: string, relativePath: string): Promise<SpecInfo | null> {
	try {
		const content = await fs.readFile(fullPath, "utf-8");
		const ext = path.extname(fullPath).toLowerCase();

		let spec: Record<string, unknown>;

		if (ext === ".json") {
			spec = JSON.parse(content) as Record<string, unknown>;
		} else if (ext === ".yaml" || ext === ".yml") {
			spec = parseYaml(content);
		} else {
			return null;
		}

		// Validate it's an OpenAPI/Swagger spec
		const version = detectVersion(spec);
		if (!version) {
			return null;
		}

		// Count paths
		const paths = spec.paths as Record<string, unknown> | undefined;
		const pathCount = paths ? Object.keys(paths).length : 0;

		// Extract info
		const info = spec.info as Record<string, unknown> | undefined;

		return {
			path: relativePath,
			version,
			pathCount,
			title: info?.title as string | undefined,
			description: info?.description as string | undefined,
		};
	} catch {
		// File couldn't be parsed, skip it
		return null;
	}
}

/**
 * Detects the OpenAPI/Swagger version from a parsed spec.
 */
function detectVersion(spec: Record<string, unknown>): SpecInfo["version"] | null {
	// OpenAPI 3.x
	if (typeof spec.openapi === "string") {
		const version = spec.openapi;
		if (version.startsWith("3.0.0")) return "3.0.0";
		if (version.startsWith("3.0.1")) return "3.0.1";
		if (version.startsWith("3.0.2")) return "3.0.2";
		if (version.startsWith("3.0.3")) return "3.0.3";
		if (version.startsWith("3.1")) return "3.1.0";
		if (version.startsWith("3.0")) return "3.0.0";
	}

	// Swagger 2.0
	if (spec.swagger === "2.0") {
		return "2.0";
	}

	return null;
}

/**
 * Simple YAML parser for OpenAPI specs.
 * Handles the common YAML patterns used in OpenAPI files.
 */
function parseYaml(content: string): Record<string, unknown> {
	const lines = content.split("\n");
	const result: Record<string, unknown> = {};
	const stack: Array<{ indent: number; obj: Record<string, unknown> }> = [{ indent: -1, obj: result }];

	for (const line of lines) {
		// Skip empty lines and comments
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		// Calculate indentation
		const indent = line.search(/\S/);
		if (indent === -1) continue;

		// Pop stack until we find parent
		while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
			stack.pop();
		}

		const parent = stack[stack.length - 1].obj;

		// Parse key-value
		const colonIndex = trimmed.indexOf(":");
		if (colonIndex === -1) continue;

		const key = trimmed.substring(0, colonIndex).trim();
		const valueStr = trimmed.substring(colonIndex + 1).trim();

		if (valueStr) {
			// Inline value
			parent[key] = parseYamlValue(valueStr);
		} else {
			// Nested object
			const nested: Record<string, unknown> = {};
			parent[key] = nested;
			stack.push({ indent, obj: nested });
		}
	}

	return result;
}

/**
 * Parses a YAML inline value.
 */
function parseYamlValue(value: string): unknown {
	// Remove quotes
	if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
		return value.slice(1, -1);
	}

	// Boolean
	if (value === "true") return true;
	if (value === "false") return false;

	// Null
	if (value === "null" || value === "~") return null;

	// Number
	const num = Number(value);
	if (!Number.isNaN(num) && value !== "") return num;

	// String
	return value;
}

/**
 * Reads and parses an OpenAPI spec file.
 * @param specPath - Path to the spec file
 * @returns Parsed spec object
 */
export async function readSpec(specPath: string): Promise<Record<string, unknown>> {
	const content = await fs.readFile(specPath, "utf-8");
	const ext = path.extname(specPath).toLowerCase();

	if (ext === ".json") {
		return JSON.parse(content) as Record<string, unknown>;
	}

	return parseYaml(content);
}
