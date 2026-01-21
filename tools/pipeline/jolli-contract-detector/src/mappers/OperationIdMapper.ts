/**
 * Maps route files to OpenAPI operationIds.
 * Supports multiple strategies:
 * 1. // operationId: ServiceName_methodName comments
 * 2. Filename convention (rate-limit.get.ts → RateLimitService_getLimits)
 * 3. operationid-mapping.json file
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

/** Mapping from file path to operationId */
export interface OperationIdMapping {
	[filePath: string]: string;
}

/**
 * Load operationId mapping from JSON file if it exists.
 * @param repoPath - Path to repository
 * @returns Mapping object or empty object if file doesn't exist
 */
export function loadOperationIdMapping(repoPath: string): OperationIdMapping {
	const mappingPath = join(repoPath, "operationid-mapping.json");

	if (!existsSync(mappingPath)) {
		return {};
	}

	try {
		const content = readFileSync(mappingPath, "utf-8");
		return JSON.parse(content) as OperationIdMapping;
	} catch {
		return {};
	}
}

/**
 * Extract operationId from file content using comment pattern.
 * Looks for: // operationId: ServiceName_methodName
 * @param fileContent - Content of the file
 * @returns operationId if found, null otherwise
 */
export function extractOperationIdFromComment(fileContent: string): string | null {
	const match = fileContent.match(/\/\/\s*operationId:\s*([A-Za-z_][A-Za-z0-9_]*)/);
	return match ? match[1] : null;
}

/**
 * Generate operationId from filename using convention.
 * Examples:
 * - rate-limit.get.ts → RateLimitService_get
 * - users.post.ts → UsersService_post
 * - auth/login.post.ts → AuthLoginService_post
 * @param filePath - Path to the file
 * @returns Generated operationId
 */
export function generateOperationIdFromFilename(filePath: string): string {
	// Normalize path separators
	const normalized = filePath.replace(/\\/g, "/");

	// Remove extension
	const withoutExt = normalized.replace(/\.(ts|js)$/, "");

	// Extract method from last part (e.g., "users.get" -> method="get", resource="users")
	const lastDot = withoutExt.lastIndexOf(".");
	const method = lastDot !== -1 ? withoutExt.slice(lastDot + 1) : "handler";
	const resourcePath = lastDot !== -1 ? withoutExt.slice(0, lastDot) : withoutExt;

	// Convert entire path to PascalCase for service name
	// Split by both / and -
	const serviceName = resourcePath
		.split(/[/-]/)
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join("");

	return `${serviceName}Service_${method}`;
}

/**
 * Get operationId for a route file.
 * Tries strategies in order:
 * 1. Check operationid-mapping.json
 * 2. Extract from file comment
 * 3. Generate from filename
 * @param filePath - Path to the route file
 * @param repoPath - Path to repository
 * @param mapping - Pre-loaded operationId mapping (optional)
 * @returns operationId
 */
export function getOperationId(filePath: string, repoPath: string, mapping?: OperationIdMapping): string {
	// Use provided mapping or load it
	const idMapping = mapping || loadOperationIdMapping(repoPath);

	// Strategy 1: Check mapping file
	if (idMapping[filePath]) {
		return idMapping[filePath];
	}

	// Strategy 2: Try to extract from file content
	const fullPath = join(repoPath, filePath);
	if (existsSync(fullPath)) {
		try {
			const content = readFileSync(fullPath, "utf-8");
			const commentId = extractOperationIdFromComment(content);
			if (commentId) {
				return commentId;
			}
		} catch {
			// If we can't read the file, fall through to filename strategy
		}
	}

	// Strategy 3: Generate from filename
	return generateOperationIdFromFilename(filePath);
}
