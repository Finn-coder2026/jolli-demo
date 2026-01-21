#!/usr/bin/env npx tsx
/**
 * Cross-platform script to set up test repositories for OpenAPI generator testing.
 *
 * Usage:
 *   npx tsx setup-test-repos.ts [target-dir]
 *
 * Default target directory: d:/opensource (Windows) or ~/opensource (Unix)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import * as os from "node:os";

/** Repository definition */
interface RepoDefinition {
	name: string;
	url: string;
	hasOpenApiSpec?: boolean;
	description?: string;
}

/** Framework definition */
interface FrameworkDefinition {
	category: "schema-enforced" | "semi-structured" | "minimal";
	repos: Array<RepoDefinition>;
}

/** Test repository structure */
const TEST_STRUCTURE: Record<string, Record<string, FrameworkDefinition>> = {
	typescript: {
		express: {
			category: "minimal",
			repos: [
				{
					name: "Ghost",
					url: "https://github.com/TryGhost/Ghost.git",
					description: "Blogging/publishing platform",
				},
				{
					name: "NodeBB",
					url: "https://github.com/NodeBB/NodeBB.git",
					description: "Forum software",
				},
				{
					name: "parse-server",
					url: "https://github.com/parse-community/parse-server.git",
					description: "Backend server",
				},
			],
		},
		fastify: {
			category: "schema-enforced",
			repos: [
				{
					name: "guide-fastify-example",
					url: "https://github.com/fastify/fastify-example.git",
					hasOpenApiSpec: true,
					description: "Official Fastify example with OpenAPI",
				},
				{
					name: "platformatic",
					url: "https://github.com/platformatic/platformatic.git",
					description: "HTTP services toolkit",
				},
			],
		},
		hono: {
			category: "semi-structured",
			repos: [
				{
					name: "examples",
					url: "https://github.com/honojs/examples.git",
					description: "Official Hono examples",
				},
				{
					name: "honox",
					url: "https://github.com/honojs/honox.git",
					description: "Meta-framework built on Hono",
				},
				{
					name: "flarekit",
					url: "https://github.com/mockkey/flarekit.git",
					description: "SaaS starter kit using Hono",
				},
			],
		},
		koa: {
			category: "minimal",
			repos: [
				{
					name: "strapi",
					url: "https://github.com/strapi/strapi.git",
					description: "Headless CMS",
				},
				{
					name: "nocobase",
					url: "https://github.com/nocobase/nocobase.git",
					description: "No-code/low-code platform",
				},
			],
		},
		nestjs: {
			category: "schema-enforced",
			repos: [
				{
					name: "nestjs-openapi-example",
					url: "https://github.com/nestjs/nest.git",
					hasOpenApiSpec: true,
					description: "NestJS with OpenAPI example",
				},
				{
					name: "vendure",
					url: "https://github.com/vendure-ecommerce/vendure.git",
					description: "Headless commerce platform",
				},
				{
					name: "novu",
					url: "https://github.com/novuhq/novu.git",
					description: "Notification infrastructure",
				},
			],
		},
		nextjs: {
			category: "minimal",
			repos: [
				{
					name: "cal.com",
					url: "https://github.com/calcom/cal.com.git",
					description: "Scheduling platform",
				},
				{
					name: "commerce",
					url: "https://github.com/vercel/commerce.git",
					description: "E-commerce reference",
				},
			],
		},
	},
	go: {
		"gin-swag": {
			category: "semi-structured",
			repos: [
				{
					name: "swag",
					url: "https://github.com/swaggo/swag.git",
					hasOpenApiSpec: true,
					description: "Swagger generator for Go",
				},
			],
		},
		"net-http": {
			category: "minimal",
			repos: [
				{
					name: "kubernetes",
					url: "https://github.com/kubernetes/kubernetes.git",
					hasOpenApiSpec: true,
					description: "Container orchestration (has api/openapi-spec)",
				},
			],
		},
	},
	java: {
		"spring-springdoc": {
			category: "schema-enforced",
			repos: [
				{
					name: "springdoc-openapi-demos",
					url: "https://github.com/springdoc/springdoc-openapi-demos.git",
					description: "Spring Boot with springdoc demos",
				},
			],
		},
	},
	python: {
		fastapi: {
			category: "schema-enforced",
			repos: [
				{
					name: "full-stack-fastapi-template",
					url: "https://github.com/tiangolo/full-stack-fastapi-template.git",
					description: "FastAPI full-stack template",
				},
			],
		},
	},
	csharp: {
		"aspnet-swashbuckle": {
			category: "schema-enforced",
			repos: [
				{
					name: "AspNetCore.Docs.Samples",
					url: "https://github.com/dotnet/AspNetCore.Docs.Samples.git",
					description: "ASP.NET Core samples with Swashbuckle",
				},
			],
		},
	},
	ruby: {
		"rails-rswag": {
			category: "semi-structured",
			repos: [
				{
					name: "rswag",
					url: "https://github.com/rswag/rswag.git",
					hasOpenApiSpec: true,
					description: "Rails Swagger integration",
				},
			],
		},
	},
	php: {
		"laravel-l5swagger": {
			category: "semi-structured",
			repos: [
				{
					name: "L5-Swagger",
					url: "https://github.com/DarkaOnLine/L5-Swagger.git",
					description: "Laravel Swagger integration",
				},
			],
		},
	},
	rust: {
		"actix-utoipa": {
			category: "schema-enforced",
			repos: [
				{
					name: "utoipa",
					url: "https://github.com/juhaku/utoipa.git",
					description: "Actix OpenAPI generator",
				},
			],
		},
	},
};

/**
 * Gets the default target directory based on OS.
 */
function getDefaultTargetDir(): string {
	if (os.platform() === "win32") {
		return "d:/opensource";
	}
	return path.join(os.homedir(), "opensource");
}

/**
 * Runs a git command and returns a promise.
 */
function runGit(args: Array<string>, cwd: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn("git", args, {
			cwd,
			stdio: "inherit",
			shell: true,
		});

		proc.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`git ${args.join(" ")} failed with code ${code}`));
			}
		});

		proc.on("error", reject);
	});
}

/**
 * Checks if a directory exists.
 */
async function directoryExists(dirPath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(dirPath);
		return stat.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Creates a directory recursively.
 */
async function ensureDir(dirPath: string): Promise<void> {
	await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Clones a repository (shallow clone for speed).
 */
async function cloneRepo(url: string, targetPath: string, name: string): Promise<boolean> {
	if (await directoryExists(targetPath)) {
		console.log(`  ⏭️  ${name} already exists, skipping`);
		return false;
	}

	console.log(`  📦 Cloning ${name}...`);
	try {
		await runGit(["clone", "--depth", "1", url, targetPath], path.dirname(targetPath));
		console.log(`  ✅ ${name} cloned successfully`);
		return true;
	} catch (error) {
		console.error(`  ❌ Failed to clone ${name}: ${error}`);
		return false;
	}
}

/**
 * Generates a summary markdown file.
 */
async function generateSummary(targetDir: string): Promise<void> {
	const lines: Array<string> = [
		"# Test Repositories Structure",
		"",
		"This folder contains test repositories organized by language and framework.",
		"",
		"## Structure",
		"",
		"| Language | Framework | Category | Repos |",
		"|----------|-----------|----------|-------|",
	];

	for (const [language, frameworks] of Object.entries(TEST_STRUCTURE)) {
		for (const [framework, def] of Object.entries(frameworks)) {
			const repoNames = def.repos.map((r) => r.name).join(", ");
			lines.push(`| ${language} | ${framework} | ${def.category} | ${repoNames} |`);
		}
	}

	lines.push("");
	lines.push("## Repos with Existing OpenAPI Specs");
	lines.push("");

	for (const [language, frameworks] of Object.entries(TEST_STRUCTURE)) {
		for (const [framework, def] of Object.entries(frameworks)) {
			for (const repo of def.repos) {
				if (repo.hasOpenApiSpec) {
					lines.push(`- \`${language}/${framework}/${repo.name}\` - ${repo.description}`);
				}
			}
		}
	}

	lines.push("");
	lines.push("## Quick Test Commands");
	lines.push("");
	lines.push("```bash");
	lines.push("cd /path/to/jolli/tools/pipeline/jolli-openapi-generator");
	lines.push("");
	lines.push("# Test TypeScript/Fastify (AST extraction)");
	lines.push(`npx tsx src/Cli.ts --repo ${targetDir}/typescript/fastify/guide-fastify-example --verbose`);
	lines.push("");
	lines.push("# Test Go (existing spec detection)");
	lines.push(`npx tsx src/Cli.ts --repo ${targetDir}/go/net-http/kubernetes --verbose`);
	lines.push("");
	lines.push("# Test Java (LLM fallback)");
	lines.push(`npx tsx src/Cli.ts --repo ${targetDir}/java/spring-springdoc/springdoc-openapi-demos --verbose --llm`);
	lines.push("```");
	lines.push("");

	await fs.writeFile(path.join(targetDir, "README.md"), lines.join("\n"));
	console.log("\n📄 Generated README.md");
}

/**
 * Prints usage information.
 */
function printUsage(): void {
	console.log(`
Usage: npx tsx setup-test-repos.ts [options] [target-dir]

Options:
  --help, -h     Show this help message
  --dry-run      Show what would be done without cloning

Arguments:
  target-dir     Target directory for repos (default: d:/opensource on Windows, ~/opensource on Unix)

Examples:
  npx tsx setup-test-repos.ts
  npx tsx setup-test-repos.ts /path/to/test-repos
  npx tsx setup-test-repos.ts --dry-run
`);
}

/**
 * Main function to set up test repositories.
 */
async function main(): Promise<void> {
	const args = process.argv.slice(2);

	// Handle help
	if (args.includes("--help") || args.includes("-h")) {
		printUsage();
		return;
	}

	// Handle dry run
	const dryRun = args.includes("--dry-run");
	const nonFlagArgs = args.filter((a) => !a.startsWith("-"));
	const targetDir = nonFlagArgs[0] || getDefaultTargetDir();

	console.log("🚀 Setting up test repositories");
	console.log(`📁 Target directory: ${targetDir}`);
	if (dryRun) {
		console.log("🔍 Dry run mode - no repos will be cloned");
	}
	console.log("");

	// Create base directory
	if (!dryRun) {
		await ensureDir(targetDir);
	}

	let clonedCount = 0;
	let skippedCount = 0;

	// Iterate through structure
	for (const [language, frameworks] of Object.entries(TEST_STRUCTURE)) {
		console.log(`\n📂 ${language}/`);

		for (const [framework, def] of Object.entries(frameworks)) {
			const frameworkDir = path.join(targetDir, language, framework);
			if (!dryRun) {
				await ensureDir(frameworkDir);
			}
			console.log(`  📂 ${framework}/ (${def.category})`);

			for (const repo of def.repos) {
				const repoPath = path.join(frameworkDir, repo.name);
				if (dryRun) {
					console.log(`    📦 Would clone: ${repo.name} -> ${repoPath}`);
					clonedCount++;
				} else {
					const cloned = await cloneRepo(repo.url, repoPath, repo.name);
					if (cloned) {
						clonedCount++;
					} else {
						skippedCount++;
					}
				}
			}
		}
	}

	// Generate summary
	if (!dryRun) {
		await generateSummary(targetDir);
	}

	console.log("\n✨ Setup complete!");
	if (dryRun) {
		console.log(`   Would clone: ${clonedCount} repos`);
		console.log(`   Target: ${targetDir}`);
		console.log("\n   Run without --dry-run to actually clone repos.");
	} else {
		console.log(`   Cloned: ${clonedCount} repos`);
		console.log(`   Skipped: ${skippedCount} repos (already exist)`);
		console.log(`   Target: ${targetDir}`);
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
