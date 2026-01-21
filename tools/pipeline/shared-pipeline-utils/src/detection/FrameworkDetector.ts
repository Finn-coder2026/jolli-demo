/**
 * Detects web frameworks in a repository.
 *
 * Phase 3 of the intelligent extraction flow - identify the framework(s) used
 * to apply appropriate extraction strategies.
 *
 * Supports multiple languages:
 * - JavaScript/TypeScript: Fastify, Express, NestJS, Hono, Koa, Next.js
 * - Python: FastAPI, Flask, Django
 * - Java: Spring Boot
 * - Go: Gin, Echo, Chi, Fiber
 * - Ruby: Rails, Sinatra, Grape
 * - C#: ASP.NET Core
 * - Rust: Actix-web, Axum, Rocket
 * - PHP: Laravel, Symfony, Slim
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

/** Framework category determining extraction strategy */
export type FrameworkCategory = "schema-enforced" | "semi-structured" | "minimal";

/** Supported programming languages */
export type SupportedLanguage =
	| "javascript"
	| "typescript"
	| "python"
	| "java"
	| "go"
	| "ruby"
	| "csharp"
	| "rust"
	| "php";

/** Framework profile with detection patterns */
export interface FrameworkProfile {
	/** Framework identifier */
	name: string;
	/** Display name */
	displayName: string;
	/** Primary language */
	language: string;
	/** Extraction category */
	category: FrameworkCategory;
	/** Dependencies that indicate this framework */
	dependencies: Array<string>;
	/** OpenAPI-related dependencies (if present, indicates schema-enforced) */
	openApiDependencies?: Array<string>;
	/** Expected extraction coverage (0-100) */
	expectedCoverage: number;
}

// ============================================================================
// JavaScript/TypeScript Frameworks
// ============================================================================

const JS_FRAMEWORKS: Array<FrameworkProfile> = [
	// Schema-enforced frameworks
	{
		name: "fastify-swagger",
		displayName: "Fastify + @fastify/swagger",
		language: "typescript",
		category: "schema-enforced",
		dependencies: ["fastify"],
		openApiDependencies: ["@fastify/swagger", "fastify-swagger"],
		expectedCoverage: 95,
	},
	{
		name: "nestjs-swagger",
		displayName: "NestJS + @nestjs/swagger",
		language: "typescript",
		category: "schema-enforced",
		dependencies: ["@nestjs/core"],
		openApiDependencies: ["@nestjs/swagger"],
		expectedCoverage: 90,
	},
	{
		name: "hono-openapi",
		displayName: "Hono + @hono/zod-openapi",
		language: "typescript",
		category: "schema-enforced",
		dependencies: ["hono"],
		openApiDependencies: ["@hono/zod-openapi"],
		expectedCoverage: 90,
	},

	// Semi-structured frameworks (with OpenAPI through docs/annotations)
	{
		name: "express-swagger-jsdoc",
		displayName: "Express + swagger-jsdoc",
		language: "javascript",
		category: "semi-structured",
		dependencies: ["express"],
		openApiDependencies: ["swagger-jsdoc", "swagger-ui-express"],
		expectedCoverage: 70,
	},
	{
		name: "koa-swagger",
		displayName: "Koa + koa2-swagger",
		language: "javascript",
		category: "semi-structured",
		dependencies: ["koa"],
		openApiDependencies: ["koa2-swagger-ui", "koa-swagger-decorator"],
		expectedCoverage: 60,
	},

	// Minimal frameworks (no built-in OpenAPI)
	{
		name: "fastify",
		displayName: "Fastify",
		language: "typescript",
		category: "minimal",
		dependencies: ["fastify"],
		expectedCoverage: 60,
	},
	{
		name: "nestjs",
		displayName: "NestJS",
		language: "typescript",
		category: "minimal",
		dependencies: ["@nestjs/core"],
		expectedCoverage: 50,
	},
	{
		name: "hono",
		displayName: "Hono",
		language: "typescript",
		category: "minimal",
		dependencies: ["hono"],
		expectedCoverage: 50,
	},
	{
		name: "express",
		displayName: "Express",
		language: "javascript",
		category: "minimal",
		dependencies: ["express"],
		expectedCoverage: 40,
	},
	{
		name: "koa",
		displayName: "Koa",
		language: "javascript",
		category: "minimal",
		dependencies: ["koa"],
		expectedCoverage: 30,
	},
	{
		name: "nextjs",
		displayName: "Next.js",
		language: "typescript",
		category: "minimal",
		dependencies: ["next"],
		expectedCoverage: 40,
	},
];

// ============================================================================
// Python Frameworks
// ============================================================================

const PYTHON_FRAMEWORKS: Array<FrameworkProfile> = [
	// Schema-enforced (FastAPI has built-in OpenAPI)
	{
		name: "fastapi",
		displayName: "FastAPI",
		language: "python",
		category: "schema-enforced",
		dependencies: ["fastapi"],
		expectedCoverage: 95,
	},

	// Semi-structured (with OpenAPI extensions)
	{
		name: "flask-openapi",
		displayName: "Flask + flask-openapi3",
		language: "python",
		category: "semi-structured",
		dependencies: ["flask"],
		openApiDependencies: ["flask-openapi3", "flasgger", "flask-restx", "flask-smorest"],
		expectedCoverage: 70,
	},
	{
		name: "django-drf-spectacular",
		displayName: "Django REST + drf-spectacular",
		language: "python",
		category: "semi-structured",
		dependencies: ["django", "djangorestframework"],
		openApiDependencies: ["drf-spectacular", "drf-yasg"],
		expectedCoverage: 80,
	},

	// Minimal
	{
		name: "flask",
		displayName: "Flask",
		language: "python",
		category: "minimal",
		dependencies: ["flask"],
		expectedCoverage: 40,
	},
	{
		name: "django",
		displayName: "Django",
		language: "python",
		category: "minimal",
		dependencies: ["django"],
		expectedCoverage: 35,
	},
	{
		name: "django-drf",
		displayName: "Django REST Framework",
		language: "python",
		category: "minimal",
		dependencies: ["django", "djangorestframework"],
		expectedCoverage: 50,
	},
	{
		name: "starlette",
		displayName: "Starlette",
		language: "python",
		category: "minimal",
		dependencies: ["starlette"],
		expectedCoverage: 40,
	},
];

// ============================================================================
// Java Frameworks
// ============================================================================

const JAVA_FRAMEWORKS: Array<FrameworkProfile> = [
	// Schema-enforced (Spring with springdoc)
	{
		name: "spring-springdoc",
		displayName: "Spring Boot + springdoc-openapi",
		language: "java",
		category: "schema-enforced",
		dependencies: ["spring-boot-starter-web"],
		openApiDependencies: ["springdoc-openapi-starter-webmvc-ui", "springdoc-openapi-ui"],
		expectedCoverage: 90,
	},

	// Semi-structured (with Swagger annotations)
	{
		name: "spring-swagger",
		displayName: "Spring Boot + Swagger",
		language: "java",
		category: "semi-structured",
		dependencies: ["spring-boot-starter-web"],
		openApiDependencies: ["springfox-swagger2", "swagger-annotations"],
		expectedCoverage: 75,
	},

	// Minimal
	{
		name: "spring-boot",
		displayName: "Spring Boot",
		language: "java",
		category: "minimal",
		dependencies: ["spring-boot-starter-web"],
		expectedCoverage: 50,
	},
	{
		name: "quarkus",
		displayName: "Quarkus",
		language: "java",
		category: "minimal",
		dependencies: ["quarkus-resteasy"],
		expectedCoverage: 45,
	},
	{
		name: "micronaut",
		displayName: "Micronaut",
		language: "java",
		category: "minimal",
		dependencies: ["micronaut-http-server-netty"],
		expectedCoverage: 45,
	},
];

// ============================================================================
// Go Frameworks
// ============================================================================

const GO_FRAMEWORKS: Array<FrameworkProfile> = [
	// Semi-structured (with swag)
	{
		name: "gin-swag",
		displayName: "Gin + swaggo/swag",
		language: "go",
		category: "semi-structured",
		dependencies: ["github.com/gin-gonic/gin"],
		openApiDependencies: ["github.com/swaggo/swag", "github.com/swaggo/gin-swagger"],
		expectedCoverage: 75,
	},
	{
		name: "echo-swagger",
		displayName: "Echo + swagger",
		language: "go",
		category: "semi-structured",
		dependencies: ["github.com/labstack/echo"],
		openApiDependencies: ["github.com/swaggo/echo-swagger"],
		expectedCoverage: 70,
	},

	// Minimal
	{
		name: "gin",
		displayName: "Gin",
		language: "go",
		category: "minimal",
		dependencies: ["github.com/gin-gonic/gin"],
		expectedCoverage: 45,
	},
	{
		name: "echo",
		displayName: "Echo",
		language: "go",
		category: "minimal",
		dependencies: ["github.com/labstack/echo"],
		expectedCoverage: 45,
	},
	{
		name: "chi",
		displayName: "Chi",
		language: "go",
		category: "minimal",
		dependencies: ["github.com/go-chi/chi"],
		expectedCoverage: 40,
	},
	{
		name: "fiber",
		displayName: "Fiber",
		language: "go",
		category: "minimal",
		dependencies: ["github.com/gofiber/fiber"],
		expectedCoverage: 45,
	},
	{
		name: "gorilla-mux",
		displayName: "Gorilla Mux",
		language: "go",
		category: "minimal",
		dependencies: ["github.com/gorilla/mux"],
		expectedCoverage: 35,
	},
];

// ============================================================================
// Ruby Frameworks
// ============================================================================

const RUBY_FRAMEWORKS: Array<FrameworkProfile> = [
	// Semi-structured (with rswag/grape-swagger)
	{
		name: "rails-rswag",
		displayName: "Rails + rswag",
		language: "ruby",
		category: "semi-structured",
		dependencies: ["rails"],
		openApiDependencies: ["rswag", "rswag-specs"],
		expectedCoverage: 70,
	},
	{
		name: "grape-swagger",
		displayName: "Grape + grape-swagger",
		language: "ruby",
		category: "semi-structured",
		dependencies: ["grape"],
		openApiDependencies: ["grape-swagger"],
		expectedCoverage: 75,
	},

	// Minimal
	{
		name: "rails",
		displayName: "Ruby on Rails",
		language: "ruby",
		category: "minimal",
		dependencies: ["rails"],
		expectedCoverage: 40,
	},
	{
		name: "sinatra",
		displayName: "Sinatra",
		language: "ruby",
		category: "minimal",
		dependencies: ["sinatra"],
		expectedCoverage: 35,
	},
	{
		name: "grape",
		displayName: "Grape",
		language: "ruby",
		category: "minimal",
		dependencies: ["grape"],
		expectedCoverage: 45,
	},
	{
		name: "hanami",
		displayName: "Hanami",
		language: "ruby",
		category: "minimal",
		dependencies: ["hanami"],
		expectedCoverage: 35,
	},
];

// ============================================================================
// C# / .NET Frameworks
// ============================================================================

const CSHARP_FRAMEWORKS: Array<FrameworkProfile> = [
	// Schema-enforced (ASP.NET with Swashbuckle)
	{
		name: "aspnet-swashbuckle",
		displayName: "ASP.NET Core + Swashbuckle",
		language: "csharp",
		category: "schema-enforced",
		dependencies: ["Microsoft.AspNetCore"],
		openApiDependencies: ["Swashbuckle.AspNetCore"],
		expectedCoverage: 90,
	},
	{
		name: "aspnet-nswag",
		displayName: "ASP.NET Core + NSwag",
		language: "csharp",
		category: "schema-enforced",
		dependencies: ["Microsoft.AspNetCore"],
		openApiDependencies: ["NSwag.AspNetCore"],
		expectedCoverage: 85,
	},

	// Minimal
	{
		name: "aspnet-core",
		displayName: "ASP.NET Core",
		language: "csharp",
		category: "minimal",
		dependencies: ["Microsoft.AspNetCore"],
		expectedCoverage: 50,
	},
	{
		name: "aspnet-minimal",
		displayName: "ASP.NET Minimal APIs",
		language: "csharp",
		category: "minimal",
		dependencies: ["Microsoft.AspNetCore.OpenApi"],
		expectedCoverage: 60,
	},
];

// ============================================================================
// Rust Frameworks
// ============================================================================

const RUST_FRAMEWORKS: Array<FrameworkProfile> = [
	// Schema-enforced (with utoipa)
	{
		name: "actix-utoipa",
		displayName: "Actix-web + utoipa",
		language: "rust",
		category: "schema-enforced",
		dependencies: ["actix-web"],
		openApiDependencies: ["utoipa", "utoipa-swagger-ui"],
		expectedCoverage: 85,
	},
	{
		name: "axum-utoipa",
		displayName: "Axum + utoipa",
		language: "rust",
		category: "schema-enforced",
		dependencies: ["axum"],
		openApiDependencies: ["utoipa"],
		expectedCoverage: 85,
	},

	// Semi-structured (with paperclip)
	{
		name: "actix-paperclip",
		displayName: "Actix-web + paperclip",
		language: "rust",
		category: "semi-structured",
		dependencies: ["actix-web"],
		openApiDependencies: ["paperclip"],
		expectedCoverage: 70,
	},

	// Minimal
	{
		name: "actix-web",
		displayName: "Actix-web",
		language: "rust",
		category: "minimal",
		dependencies: ["actix-web"],
		expectedCoverage: 40,
	},
	{
		name: "axum",
		displayName: "Axum",
		language: "rust",
		category: "minimal",
		dependencies: ["axum"],
		expectedCoverage: 40,
	},
	{
		name: "rocket",
		displayName: "Rocket",
		language: "rust",
		category: "minimal",
		dependencies: ["rocket"],
		expectedCoverage: 45,
	},
	{
		name: "warp",
		displayName: "Warp",
		language: "rust",
		category: "minimal",
		dependencies: ["warp"],
		expectedCoverage: 35,
	},
];

// ============================================================================
// PHP Frameworks
// ============================================================================

const PHP_FRAMEWORKS: Array<FrameworkProfile> = [
	// Schema-enforced (with L5-Swagger)
	{
		name: "laravel-swagger",
		displayName: "Laravel + L5-Swagger",
		language: "php",
		category: "schema-enforced",
		dependencies: ["laravel/framework"],
		openApiDependencies: ["darkaonline/l5-swagger"],
		expectedCoverage: 80,
	},
	{
		name: "symfony-nelmio",
		displayName: "Symfony + NelmioApiDocBundle",
		language: "php",
		category: "schema-enforced",
		dependencies: ["symfony/framework-bundle"],
		openApiDependencies: ["nelmio/api-doc-bundle"],
		expectedCoverage: 80,
	},

	// Semi-structured (with swagger-php)
	{
		name: "laravel-swagger-php",
		displayName: "Laravel + swagger-php",
		language: "php",
		category: "semi-structured",
		dependencies: ["laravel/framework"],
		openApiDependencies: ["zircote/swagger-php"],
		expectedCoverage: 65,
	},

	// Minimal
	{
		name: "laravel",
		displayName: "Laravel",
		language: "php",
		category: "minimal",
		dependencies: ["laravel/framework"],
		expectedCoverage: 45,
	},
	{
		name: "symfony",
		displayName: "Symfony",
		language: "php",
		category: "minimal",
		dependencies: ["symfony/framework-bundle"],
		expectedCoverage: 45,
	},
	{
		name: "slim",
		displayName: "Slim",
		language: "php",
		category: "minimal",
		dependencies: ["slim/slim"],
		expectedCoverage: 40,
	},
	{
		name: "lumen",
		displayName: "Lumen",
		language: "php",
		category: "minimal",
		dependencies: ["laravel/lumen-framework"],
		expectedCoverage: 40,
	},
];

// ============================================================================
// All Frameworks by Language
// ============================================================================

const FRAMEWORKS_BY_LANGUAGE: Record<string, Array<FrameworkProfile>> = {
	javascript: JS_FRAMEWORKS,
	typescript: JS_FRAMEWORKS,
	python: PYTHON_FRAMEWORKS,
	java: JAVA_FRAMEWORKS,
	go: GO_FRAMEWORKS,
	ruby: RUBY_FRAMEWORKS,
	csharp: CSHARP_FRAMEWORKS,
	rust: RUST_FRAMEWORKS,
	php: PHP_FRAMEWORKS,
};

export interface FrameworkDetectionResult {
	/** Detected framework profile */
	framework: FrameworkProfile;
	/** Confidence level (0.0 - 1.0) */
	confidence: number;
	/** Whether OpenAPI dependencies were found */
	hasOpenApiSupport: boolean;
	/** All matching frameworks (for multi-framework repos) */
	allMatches: Array<FrameworkProfile>;
}

// ============================================================================
// Dependency Parsers for Each Language
// ============================================================================

/**
 * Parses JavaScript/TypeScript dependencies from package.json.
 */
async function parseJsDependencies(repoPath: string): Promise<Array<string>> {
	try {
		const content = await fs.readFile(path.join(repoPath, "package.json"), "utf-8");
		const pkg = JSON.parse(content) as Record<string, unknown>;
		const deps = {
			...(pkg.dependencies as Record<string, string> | undefined),
			...(pkg.devDependencies as Record<string, string> | undefined),
		};
		return Object.keys(deps);
	} catch {
		return [];
	}
}

/**
 * Parses Python dependencies from requirements.txt, pyproject.toml, or Pipfile.
 */
async function parsePythonDependencies(repoPath: string): Promise<Array<string>> {
	const deps: Array<string> = [];

	// Try requirements.txt
	try {
		const content = await fs.readFile(path.join(repoPath, "requirements.txt"), "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			// Extract package name (before ==, >=, etc.)
			const match = trimmed.match(/^([a-zA-Z0-9_-]+)/);
			if (match) deps.push(match[1].toLowerCase());
		}
	} catch {
		// File doesn't exist
	}

	// Try pyproject.toml
	try {
		const content = await fs.readFile(path.join(repoPath, "pyproject.toml"), "utf-8");
		// Simple parsing - look for dependencies section
		const depMatch = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
		if (depMatch) {
			const depList = depMatch[1];
			for (const match of depList.matchAll(/"([a-zA-Z0-9_-]+)/g)) {
				deps.push(match[1].toLowerCase());
			}
		}
	} catch {
		// File doesn't exist
	}

	return [...new Set(deps)];
}

/**
 * Parses Java dependencies from pom.xml or build.gradle.
 */
async function parseJavaDependencies(repoPath: string): Promise<Array<string>> {
	const deps: Array<string> = [];

	// Try pom.xml
	try {
		const content = await fs.readFile(path.join(repoPath, "pom.xml"), "utf-8");
		// Extract artifactId from dependencies
		for (const match of content.matchAll(/<artifactId>([^<]+)<\/artifactId>/g)) {
			deps.push(match[1]);
		}
	} catch {
		// File doesn't exist
	}

	// Try build.gradle
	try {
		const content = await fs.readFile(path.join(repoPath, "build.gradle"), "utf-8");
		// Extract dependencies like implementation 'org.springframework.boot:spring-boot-starter-web'
		for (const match of content.matchAll(/['"]([^'"]+):([^'"]+)['"]/g)) {
			deps.push(match[2]); // artifactId
		}
	} catch {
		// File doesn't exist
	}

	return [...new Set(deps)];
}

/**
 * Parses Go dependencies from go.mod.
 */
async function parseGoDependencies(repoPath: string): Promise<Array<string>> {
	try {
		const content = await fs.readFile(path.join(repoPath, "go.mod"), "utf-8");
		const deps: Array<string> = [];
		// Extract require statements
		for (const match of content.matchAll(/require\s+([^\s]+)/g)) {
			deps.push(match[1]);
		}
		// Also check for require block
		const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/);
		if (requireBlock) {
			for (const line of requireBlock[1].split("\n")) {
				const match = line.trim().match(/^([^\s]+)/);
				if (match && !match[1].startsWith("//")) {
					deps.push(match[1]);
				}
			}
		}
		return [...new Set(deps)];
	} catch {
		return [];
	}
}

/**
 * Parses Ruby dependencies from Gemfile.
 */
async function parseRubyDependencies(repoPath: string): Promise<Array<string>> {
	try {
		const content = await fs.readFile(path.join(repoPath, "Gemfile"), "utf-8");
		const deps: Array<string> = [];
		// Extract gem statements
		for (const match of content.matchAll(/gem\s+['"]([^'"]+)['"]/g)) {
			deps.push(match[1]);
		}
		return deps;
	} catch {
		return [];
	}
}

/**
 * Parses C# dependencies from .csproj files.
 */
async function parseCSharpDependencies(repoPath: string): Promise<Array<string>> {
	const deps: Array<string> = [];

	// Find .csproj files
	try {
		const entries = await fs.readdir(repoPath, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile() && entry.name.endsWith(".csproj")) {
				const content = await fs.readFile(path.join(repoPath, entry.name), "utf-8");
				// Extract PackageReference
				for (const match of content.matchAll(/PackageReference\s+Include="([^"]+)"/g)) {
					deps.push(match[1]);
				}
				// Also check for framework references
				for (const match of content.matchAll(/FrameworkReference\s+Include="([^"]+)"/g)) {
					deps.push(match[1]);
				}
			}
		}
	} catch {
		// Directory doesn't exist
	}

	return [...new Set(deps)];
}

/**
 * Parses Rust dependencies from Cargo.toml.
 */
async function parseRustDependencies(repoPath: string): Promise<Array<string>> {
	try {
		const content = await fs.readFile(path.join(repoPath, "Cargo.toml"), "utf-8");
		const deps: Array<string> = [];
		// Look for [dependencies] section
		const depsSection = content.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
		if (depsSection) {
			for (const line of depsSection[1].split("\n")) {
				const match = line.match(/^([a-zA-Z0-9_-]+)\s*=/);
				if (match) deps.push(match[1]);
			}
		}
		return deps;
	} catch {
		return [];
	}
}

/**
 * Parses PHP dependencies from composer.json.
 */
async function parsePhpDependencies(repoPath: string): Promise<Array<string>> {
	try {
		const content = await fs.readFile(path.join(repoPath, "composer.json"), "utf-8");
		const pkg = JSON.parse(content) as Record<string, unknown>;
		const deps = {
			...(pkg.require as Record<string, string> | undefined),
			...(pkg["require-dev"] as Record<string, string> | undefined),
		};
		return Object.keys(deps);
	} catch {
		return [];
	}
}

// ============================================================================
// Framework Detection Functions
// ============================================================================

/**
 * Detects the web framework in a JavaScript/TypeScript repository.
 * @param repoPath - Path to the repository root
 * @returns Detection result with framework info
 */
export async function detectFramework(repoPath: string): Promise<FrameworkDetectionResult> {
	const depNames = await parseJsDependencies(repoPath);
	return matchFrameworks(depNames, JS_FRAMEWORKS, "javascript");
}

/**
 * Detects the web framework for any supported language.
 * @param repoPath - Path to the repository root
 * @param language - The detected language
 * @returns Detection result with framework info
 */
export async function detectFrameworkForLanguage(
	repoPath: string,
	language: string,
): Promise<FrameworkDetectionResult> {
	const frameworks = FRAMEWORKS_BY_LANGUAGE[language];
	if (!frameworks) {
		return {
			framework: getUnknownFramework(language),
			confidence: 0.0,
			hasOpenApiSupport: false,
			allMatches: [],
		};
	}

	let depNames: Array<string>;

	switch (language) {
		case "javascript":
		case "typescript":
			depNames = await parseJsDependencies(repoPath);
			break;
		case "python":
			depNames = await parsePythonDependencies(repoPath);
			break;
		case "java":
			depNames = await parseJavaDependencies(repoPath);
			break;
		case "go":
			depNames = await parseGoDependencies(repoPath);
			break;
		case "ruby":
			depNames = await parseRubyDependencies(repoPath);
			break;
		case "csharp":
			depNames = await parseCSharpDependencies(repoPath);
			break;
		case "rust":
			depNames = await parseRustDependencies(repoPath);
			break;
		case "php":
			depNames = await parsePhpDependencies(repoPath);
			break;
		default:
			return {
				framework: getUnknownFramework(language),
				confidence: 0.0,
				hasOpenApiSupport: false,
				allMatches: [],
			};
	}

	return matchFrameworks(depNames, frameworks, language);
}

/**
 * Checks if a dependency matches based on language-specific rules.
 * - JS/TS: strict equality
 * - Other languages: partial matching (depName contains requiredDep)
 */
function depMatches(depName: string, requiredDep: string, language: string): boolean {
	// For JS/TS, use strict equality
	if (language === "javascript" || language === "typescript") {
		return depName === requiredDep;
	}

	// For other languages, allow partial matches where dependency name contains required dep
	// This handles Go paths like "github.com/gin-gonic/gin" containing "gin-gonic/gin"
	// But avoids matching "flask" against "flask-openapi3" (where required contains dep)
	return depName.includes(requiredDep);
}

/**
 * Matches dependencies against framework profiles.
 */
function matchFrameworks(
	depNames: Array<string>,
	frameworks: Array<FrameworkProfile>,
	language: string,
): FrameworkDetectionResult {
	if (depNames.length === 0) {
		return {
			framework: getUnknownFramework(language),
			confidence: 0.0,
			hasOpenApiSupport: false,
			allMatches: [],
		};
	}

	const matches: Array<{ profile: FrameworkProfile; score: number; hasOpenApi: boolean }> = [];

	// Check each framework profile
	for (const profile of frameworks) {
		const hasDeps = profile.dependencies.every(dep => depNames.some(d => depMatches(d, dep, language)));
		if (!hasDeps) continue;

		// Check for OpenAPI dependencies
		const hasOpenApi = profile.openApiDependencies
			? profile.openApiDependencies.some(dep => depNames.some(d => depMatches(d, dep, language)))
			: false;

		// For profiles with openApiDependencies, only match if at least one is present
		if (profile.openApiDependencies && !hasOpenApi) {
			continue;
		}

		// Calculate score based on specificity
		let score = profile.dependencies.length;
		if (hasOpenApi) {
			score += 10; // Strong indicator
		}

		matches.push({ profile, score, hasOpenApi });
	}

	if (matches.length === 0) {
		return {
			framework: getUnknownFramework(language),
			confidence: 0.0,
			hasOpenApiSupport: false,
			allMatches: [],
		};
	}

	// Sort by score (highest first)
	matches.sort((a, b) => b.score - a.score);

	// Prefer schema-enforced frameworks
	const schemaEnforced = matches.filter(m => m.profile.category === "schema-enforced");
	const best = schemaEnforced.length > 0 ? schemaEnforced[0] : matches[0];

	return {
		framework: best.profile,
		confidence: best.hasOpenApi ? 0.95 : 0.7,
		hasOpenApiSupport: best.hasOpenApi,
		allMatches: matches.map(m => m.profile),
	};
}

/**
 * Returns the unknown framework profile for a language.
 */
function getUnknownFramework(language = "javascript"): FrameworkProfile {
	return {
		name: "unknown",
		displayName: "Unknown",
		language,
		category: "minimal",
		dependencies: [],
		expectedCoverage: 20,
	};
}

/**
 * Gets the extraction strategy based on framework category.
 */
export function getExtractionStrategy(category: FrameworkCategory): string {
	switch (category) {
		case "schema-enforced":
			return "full-schema";
		case "semi-structured":
			return "jsdoc-annotation";
		case "minimal":
			return "basic-pattern";
	}
}

/**
 * Gets all supported JS/TS frameworks.
 */
export function getSupportedFrameworks(): Array<FrameworkProfile> {
	return [...JS_FRAMEWORKS];
}

/**
 * Gets all supported frameworks for a language.
 */
export function getSupportedFrameworksForLanguage(language: string): Array<FrameworkProfile> {
	return [...(FRAMEWORKS_BY_LANGUAGE[language] || [])];
}

/**
 * Gets all supported frameworks across all languages.
 */
export function getAllSupportedFrameworks(): Array<FrameworkProfile> {
	const all: Array<FrameworkProfile> = [];
	for (const frameworks of Object.values(FRAMEWORKS_BY_LANGUAGE)) {
		all.push(...frameworks);
	}
	return all;
}
