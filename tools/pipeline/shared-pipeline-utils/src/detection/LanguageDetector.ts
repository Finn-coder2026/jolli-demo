/**
 * Detects the primary programming language(s) in a repository.
 *
 * Phase 2 of the intelligent extraction flow - identify languages to load
 * appropriate extractors.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { glob } from "glob";

/** Language indicator files and their associated languages */
const LANGUAGE_INDICATORS: Record<string, string> = {
	"package.json": "javascript",
	"package-lock.json": "javascript",
	"yarn.lock": "javascript",
	"pnpm-lock.yaml": "javascript",
	"tsconfig.json": "typescript",
	"jsconfig.json": "javascript",
	"requirements.txt": "python",
	"pyproject.toml": "python",
	"setup.py": "python",
	"Pipfile": "python",
	"pom.xml": "java",
	"build.gradle": "java",
	"build.gradle.kts": "kotlin",
	"go.mod": "go",
	"go.sum": "go",
	"Gemfile": "ruby",
	"Cargo.toml": "rust",
	"composer.json": "php",
};

/** C# project file patterns (checked via glob since they have variable names) */
const CSHARP_PROJECT_PATTERNS = ["*.csproj", "*.sln", "*.fsproj"];

/** TypeScript indicator patterns in package.json */
const TYPESCRIPT_INDICATORS = ["typescript", "@types/", "ts-node", "tsx"];

export interface LanguageDetectionResult {
	/** Primary language of the repository */
	primary: string;
	/** All detected languages */
	all: Array<string>;
	/** Confidence level (0.0 - 1.0) */
	confidence: number;
	/** Whether TypeScript is used (for JS/TS repos) */
	isTypeScript: boolean;
}

/**
 * Detects programming languages in a repository.
 * @param repoPath - Path to the repository root
 * @returns Detection result with languages
 */
export async function detectLanguage(repoPath: string): Promise<LanguageDetectionResult> {
	const detected: Map<string, number> = new Map();

	// Check for indicator files
	for (const [file, language] of Object.entries(LANGUAGE_INDICATORS)) {
		const filePath = path.join(repoPath, file);
		if (await fileExists(filePath)) {
			const current = detected.get(language) || 0;
			detected.set(language, current + 1);
		}
	}

	// Check for C# projects (need glob because filenames vary)
	for (const pattern of CSHARP_PROJECT_PATTERNS) {
		const matches = await glob(pattern, { cwd: repoPath, absolute: false });
		if (matches.length > 0) {
			const current = detected.get("csharp") || 0;
			detected.set("csharp", current + matches.length);
			break; // One pattern match is enough
		}
	}

	// Check for TypeScript in JS projects
	let isTypeScript = false;
	const packageJsonPath = path.join(repoPath, "package.json");
	if (await fileExists(packageJsonPath)) {
		try {
			const content = await fs.readFile(packageJsonPath, "utf-8");
			const pkg = JSON.parse(content) as Record<string, unknown>;

			// Check dependencies
			const deps = {
				...(pkg.dependencies as Record<string, unknown> | undefined),
				...(pkg.devDependencies as Record<string, unknown> | undefined),
			};

			for (const dep of Object.keys(deps)) {
				if (TYPESCRIPT_INDICATORS.some(indicator => dep.includes(indicator))) {
					isTypeScript = true;
					detected.set("typescript", (detected.get("typescript") || 0) + 1);
					break;
				}
			}
		} catch {
			// Ignore parse errors
		}
	}

	// Convert to sorted list
	const languages = Array.from(detected.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([lang]) => lang);

	// Normalize JS/TS
	if (languages.includes("typescript") || isTypeScript) {
		// TypeScript takes precedence
		const allLangs = languages.filter(l => l !== "javascript" && l !== "typescript");
		allLangs.unshift("typescript");

		return {
			primary: "typescript",
			all: allLangs,
			confidence: 0.9,
			isTypeScript: true,
		};
	}

	if (languages.includes("javascript")) {
		const allLangs = languages.filter(l => l !== "javascript");
		allLangs.unshift("javascript");

		return {
			primary: "javascript",
			all: allLangs,
			confidence: 0.8,
			isTypeScript: false,
		};
	}

	// Return primary or unknown
	if (languages.length > 0) {
		return {
			primary: languages[0],
			all: languages,
			confidence: 0.7,
			isTypeScript: false,
		};
	}

	return {
		primary: "unknown",
		all: [],
		confidence: 0.0,
		isTypeScript: false,
	};
}

/**
 * Checks if a file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Checks if a language is JavaScript or TypeScript.
 */
export function isJavaScriptFamily(language: string): boolean {
	return language === "javascript" || language === "typescript";
}

/**
 * Checks if a language is supported for framework detection and extraction.
 * Note: AST extraction only works for JS/TS; other languages use LLM fallback.
 */
export function isSupportedLanguage(language: string): boolean {
	const supported = ["javascript", "typescript", "python", "java", "go", "ruby", "rust", "php", "csharp"];
	return supported.includes(language);
}
