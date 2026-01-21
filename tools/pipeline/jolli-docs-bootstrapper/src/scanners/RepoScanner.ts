/**
 * Scans a repository for API endpoints.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { EndpointInfo, ScanResult } from "../types.js";

/**
 * Check if a file is a route file.
 * @param filePath - Path to check
 * @returns True if the file is a route file
 */
export function isRouteFile(filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, "/");
	return (
		(normalized.includes("/routes/") ||
			normalized.startsWith("routes/") ||
			normalized.includes("/api/") ||
			normalized.startsWith("api/")) &&
		/\.(ts|js)$/.test(normalized)
	);
}

/**
 * Extract endpoint info from a route file path.
 * @param filePath - Path to the route file
 * @returns Endpoint information
 */
export function extractEndpointInfo(filePath: string): EndpointInfo {
	const normalized = filePath.replace(/\\/g, "/");
	const withoutExt = normalized.replace(/\.(ts|js)$/, "");

	// Extract method from last part (e.g., "users.get" -> method="get")
	const lastDot = withoutExt.lastIndexOf(".");
	const method = lastDot !== -1 ? withoutExt.slice(lastDot + 1) : "handler";
	const resourcePath = lastDot !== -1 ? withoutExt.slice(0, lastDot) : withoutExt;

	// Extract resource name (last segment of path)
	const segments = resourcePath.split("/");
	const resource = segments[segments.length - 1] || "api";

	// Generate operation ID
	const operationId = resourcePath
		.split(/[/-]/)
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join("") + "Service_" + method;

	// Generate friendly title
	const titleWords = resource
		.split("-")
		.map(word => word.charAt(0).toUpperCase() + word.slice(1));
	const methodTitle = method.charAt(0).toUpperCase() + method.slice(1);
	const title = `${methodTitle} ${titleWords.join(" ")}`;

	return {
		operationId,
		filePath,
		method,
		resource,
		title,
	};
}

/**
 * Recursively find files matching a pattern.
 * @param dir - Directory to search
 * @param basePath - Base path for relative paths
 * @returns Array of file paths
 */
function findFilesRecursive(dir: string, basePath: string = ""): Array<string> {
	const results: Array<string> = [];

	try {
		const entries = readdirSync(dir);

		for (const entry of entries) {
			// Skip node_modules and hidden directories
			if (entry === "node_modules" || entry.startsWith(".")) {
				continue;
			}

			const fullPath = join(dir, entry);
			const relativePath = basePath ? join(basePath, entry) : entry;

			try {
				const stat = statSync(fullPath);

				if (stat.isDirectory()) {
					// Recursively search subdirectories
					results.push(...findFilesRecursive(fullPath, relativePath));
				} else if (stat.isFile() && /\.(ts|js)$/.test(entry)) {
					// Add TypeScript and JavaScript files
					results.push(relativePath);
				}
			} catch {
				// Skip files/dirs that can't be accessed
				continue;
			}
		}
	} catch {
		// If directory can't be read, return empty array
		return [];
	}

	return results;
}

/**
 * Scan a repository for API route files.
 * @param repoPath - Path to the repository
 * @param source - Source identifier
 * @returns Scan result with discovered endpoints
 */
export function scanRepository(repoPath: string, source: string): ScanResult {
	if (!existsSync(repoPath)) {
		throw new Error(`Repository path does not exist: ${repoPath}`);
	}

	// Find all TypeScript and JavaScript files recursively
	const files = findFilesRecursive(repoPath);

	const endpoints = files
		.filter(isRouteFile)
		.map(extractEndpointInfo)
		.sort((a, b) => a.resource.localeCompare(b.resource));

	return {
		endpoints,
		source,
	};
}
