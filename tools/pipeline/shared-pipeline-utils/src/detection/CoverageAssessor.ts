/**
 * Assesses the coverage quality of extracted routes.
 *
 * Phase 4 of the intelligent extraction flow - after extraction, assess
 * coverage quality to determine if LLM fallback is needed.
 */

import * as path from "node:path";
import { glob } from "glob";
import type { FrameworkCategory } from "./FrameworkDetector.js";

export interface CoverageAssessment {
	/** Number of routes found */
	routesFound: number;
	/** Estimated total routes in codebase */
	estimatedTotal: number;
	/** Coverage percentage (0-100) */
	percentage: number;
	/** Confidence in the extraction (0.0 - 1.0) */
	confidence: number;
	/** Files that likely contain routes but yielded none */
	suspiciousFiles: Array<string>;
	/** Recommendation for next steps */
	recommendation: "use" | "warn" | "fallback";
	/** Reason for the recommendation */
	reason: string;
}

/** Patterns for files that typically contain routes (multi-language) */
const ROUTE_FILE_PATTERNS = [
	// JavaScript/TypeScript
	"**/routes/**/*.{ts,js,mjs,cjs}",
	"**/controllers/**/*.{ts,js,mjs,cjs}",
	"**/api/**/*.{ts,js,mjs,cjs}",
	"**/*Router*.{ts,js,mjs,cjs}",
	"**/*Controller*.{ts,js,mjs,cjs}",
	"**/*Handler*.{ts,js,mjs,cjs}",
	"**/*Endpoint*.{ts,js,mjs,cjs}",
	"**/app/**/route.{ts,js}",
	// Java
	"**/controllers/**/*.java",
	"**/api/**/*.java",
	"**/*Controller*.java",
	"**/*Endpoint*.java",
	"**/*Resource*.java",
	// Go
	"**/handlers/**/*.go",
	"**/api/**/*.go",
	"**/*Handler*.go",
	"**/router.go",
	"**/routes.go",
	// Python
	"**/views.py",
	"**/urls.py",
	"**/routes.py",
	"**/api/**/*.py",
	"**/endpoints/**/*.py",
	// C#
	"**/Controllers/**/*.cs",
	"**/api/**/*.cs",
	"**/*Controller*.cs",
	"**/*Endpoint*.cs",
	// Ruby
	"**/controllers/**/*.rb",
	"**/config/routes.rb",
	"**/*Controller*.rb",
	// PHP
	"**/controllers/**/*.php",
	"**/routes/**/*.php",
	"**/*Controller*.php",
	// Rust
	"**/handlers/**/*.rs",
	"**/routes/**/*.rs",
];

/** Directories to exclude */
const EXCLUDE_PATTERNS = [
	// Build/dependency directories
	"**/node_modules/**",
	"**/dist/**",
	"**/build/**",
	"**/target/**",
	"**/bin/**",
	"**/obj/**",
	"**/vendor/**",
	"**/__pycache__/**",
	"**/venv/**",
	"**/.venv/**",
	// Test directories and files
	"**/test/**",
	"**/tests/**",
	"**/__tests__/**",
	"**/*.test.{ts,js}",
	"**/*.spec.{ts,js}",
	"**/*Test.java",
	"**/*_test.go",
	"**/test_*.py",
	"**/*_spec.rb",
];

/**
 * Assesses the extraction coverage.
 * @param repoPath - Path to the repository
 * @param routesFound - Number of routes extracted
 * @param category - Framework category
 * @param filesWithRoutes - Files that yielded routes
 * @returns Coverage assessment
 */
export async function assessCoverage(
	repoPath: string,
	routesFound: number,
	category: FrameworkCategory,
	filesWithRoutes: Set<string> = new Set(),
): Promise<CoverageAssessment> {
	// Count files that likely contain routes
	const routeFiles = await findRouteFiles(repoPath);
	const suspiciousFiles = routeFiles.filter(f => !filesWithRoutes.has(f));

	// Estimate total routes (heuristic: ~3 routes per file)
	const estimatedTotal = Math.max(routeFiles.length * 3, routesFound);

	// Calculate percentage
	const percentage = estimatedTotal > 0 ? Math.round((routesFound / estimatedTotal) * 100) : 0;

	// Calculate confidence based on category and coverage
	let confidence = calculateConfidence(category, percentage, suspiciousFiles.length);

	// Determine recommendation
	const { recommendation, reason } = determineRecommendation(category, percentage, routesFound, suspiciousFiles.length);

	// Adjust confidence for edge cases
	if (routesFound === 0) {
		confidence = 0.1;
	}

	return {
		routesFound,
		estimatedTotal,
		percentage,
		confidence,
		suspiciousFiles: suspiciousFiles.slice(0, 10), // Limit to top 10
		recommendation,
		reason,
	};
}

/**
 * Finds files that likely contain route definitions.
 */
async function findRouteFiles(repoPath: string): Promise<Array<string>> {
	const allFiles: Array<string> = [];

	for (const pattern of ROUTE_FILE_PATTERNS) {
		const files = await glob(pattern, {
			cwd: repoPath,
			absolute: false,
			ignore: EXCLUDE_PATTERNS,
		});
		allFiles.push(...files);
	}

	// Remove duplicates
	return [...new Set(allFiles)];
}

/**
 * Calculates confidence based on framework category and coverage.
 */
function calculateConfidence(category: FrameworkCategory, percentage: number, suspiciousCount: number): number {
	let base: number;

	switch (category) {
		case "schema-enforced":
			base = 0.9;
			break;
		case "semi-structured":
			base = 0.7;
			break;
		case "minimal":
			base = 0.5;
			break;
	}

	// Adjust for coverage
	if (percentage >= 80) {
		base += 0.05;
	} else if (percentage < 30) {
		base -= 0.2;
	} else if (percentage < 50) {
		base -= 0.1;
	}

	// Penalize for suspicious files
	if (suspiciousCount > 10) {
		base -= 0.15;
	} else if (suspiciousCount > 5) {
		base -= 0.1;
	} else if (suspiciousCount > 0) {
		base -= 0.05;
	}

	return Math.max(0.1, Math.min(1.0, base));
}

/**
 * Determines the recommendation based on extraction results.
 */
function determineRecommendation(
	category: FrameworkCategory,
	percentage: number,
	routesFound: number,
	suspiciousCount: number,
): { recommendation: "use" | "warn" | "fallback"; reason: string } {
	// No routes found - definitely need fallback
	if (routesFound === 0) {
		return {
			recommendation: "fallback",
			reason: "No routes were extracted from the codebase",
		};
	}

	// Schema-enforced frameworks should have high coverage
	if (category === "schema-enforced") {
		if (percentage >= 70) {
			return {
				recommendation: "use",
				reason: `Good coverage (${percentage}%) from schema-enforced framework`,
			};
		}
		if (percentage >= 40) {
			return {
				recommendation: "warn",
				reason: `Moderate coverage (${percentage}%) - some routes may be missing`,
			};
		}
		return {
			recommendation: "fallback",
			reason: `Low coverage (${percentage}%) despite schema-enforced framework`,
		};
	}

	// Semi-structured frameworks
	if (category === "semi-structured") {
		if (percentage >= 50) {
			return {
				recommendation: "use",
				reason: `Acceptable coverage (${percentage}%) from annotated routes`,
			};
		}
		if (percentage >= 25) {
			return {
				recommendation: "warn",
				reason: `Limited coverage (${percentage}%) - many routes may lack annotations`,
			};
		}
		return {
			recommendation: "fallback",
			reason: `Poor coverage (${percentage}%) - most routes lack annotations`,
		};
	}

	// Minimal frameworks - lower expectations
	if (percentage >= 30 && suspiciousCount < 5) {
		return {
			recommendation: "use",
			reason: `Reasonable coverage (${percentage}%) for minimal framework`,
		};
	}
	if (percentage >= 15) {
		return {
			recommendation: "warn",
			reason: `Limited coverage (${percentage}%) - consider LLM enhancement`,
		};
	}
	return {
		recommendation: "fallback",
		reason: `Very low coverage (${percentage}%) - LLM analysis recommended`,
	};
}
