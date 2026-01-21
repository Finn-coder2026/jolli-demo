#!/usr/bin/env npx tsx
/**
 * Cross-platform script to run OpenAPI generator tests against test repositories.
 *
 * Usage:
 *   npx tsx run-tests.ts [options]
 *
 * Options:
 *   --target-dir <path>   Target directory containing test repos (default: d:/opensource)
 *   --filter <pattern>    Filter repos by pattern (e.g., "typescript/fastify")
 *   --category <cat>      Filter by category (schema-enforced, semi-structured, minimal)
 *   --dry-run             Show what would be tested without running
 *   --llm                 Enable LLM fallback for all tests
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import * as os from "node:os";

/** Load config synchronously */
const configPath = path.join(import.meta.dirname, "test-repos-config.json");
const config = JSON.parse(await fs.readFile(configPath, "utf-8")) as {
	defaultTargetDir: { win32: string; default: string };
	structure: Record<string, Record<string, { category: string; repos: Array<{ name: string; hasOpenApiSpec?: boolean }> }>>;
	testMatrix: Record<string, Array<string>>;
};

interface TestResult {
	repo: string;
	language: string;
	framework: string;
	category: string;
	success: boolean;
	hasOpenApiSpec: boolean;
	routesFound?: number;
	source?: string;
	error?: string;
	duration: number;
}

/**
 * Gets the default target directory based on OS.
 */
function getDefaultTargetDir(): string {
	if (os.platform() === "win32") {
		return config.defaultTargetDir.win32;
	}
	return config.defaultTargetDir.default.replace("~", os.homedir());
}

/**
 * Parses command line arguments.
 */
function parseArgs(): {
	targetDir: string;
	filter?: string;
	category?: string;
	dryRun: boolean;
	llm: boolean;
} {
	const args = process.argv.slice(2);
	let targetDir = getDefaultTargetDir();
	let filter: string | undefined;
	let category: string | undefined;
	let dryRun = false;
	let llm = false;

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case "--target-dir":
				targetDir = args[++i];
				break;
			case "--filter":
				filter = args[++i];
				break;
			case "--category":
				category = args[++i];
				break;
			case "--dry-run":
				dryRun = true;
				break;
			case "--llm":
				llm = true;
				break;
		}
	}

	return { targetDir, filter, category, dryRun, llm };
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
 * Runs the OpenAPI generator CLI on a repo.
 */
function runGenerator(
	repoPath: string,
	options: { llm: boolean },
): Promise<{ success: boolean; output: string; duration: number }> {
	return new Promise((resolve) => {
		const startTime = Date.now();
		const cliPath = path.resolve(__dirname, "../jolli-openapi-generator/src/Cli.ts");

		const args = ["tsx", cliPath, "--repo", repoPath, "--verbose"];
		if (options.llm) {
			args.push("--llm");
		}

		let output = "";

		const proc = spawn("npx", args, {
			cwd: path.dirname(cliPath),
			shell: true,
		});

		proc.stdout?.on("data", (data) => {
			output += data.toString();
		});

		proc.stderr?.on("data", (data) => {
			output += data.toString();
		});

		proc.on("close", (code) => {
			resolve({
				success: code === 0,
				output,
				duration: Date.now() - startTime,
			});
		});

		proc.on("error", (error) => {
			resolve({
				success: false,
				output: error.message,
				duration: Date.now() - startTime,
			});
		});
	});
}

/**
 * Extracts metrics from generator output.
 */
function extractMetrics(output: string): { routesFound?: number; source?: string } {
	const routesMatch = output.match(/Total routes:\s*(\d+)/i);
	const sourceMatch = output.match(/Source:\s*(\w+)/i);

	return {
		routesFound: routesMatch ? Number.parseInt(routesMatch[1], 10) : undefined,
		source: sourceMatch ? sourceMatch[1] : undefined,
	};
}

/**
 * Gets all repos to test based on filters.
 */
function getReposToTest(options: {
	filter?: string;
	category?: string;
}): Array<{
	path: string;
	language: string;
	framework: string;
	category: string;
	name: string;
	hasOpenApiSpec: boolean;
}> {
	const repos: Array<{
		path: string;
		language: string;
		framework: string;
		category: string;
		name: string;
		hasOpenApiSpec: boolean;
	}> = [];

	for (const [language, frameworks] of Object.entries(config.structure)) {
		for (const [framework, def] of Object.entries(frameworks)) {
			// Apply category filter
			if (options.category && def.category !== options.category) {
				continue;
			}

			for (const repo of def.repos) {
				const repoPath = `${language}/${framework}/${repo.name}`;

				// Apply path filter
				if (options.filter && !repoPath.includes(options.filter)) {
					continue;
				}

				repos.push({
					path: repoPath,
					language,
					framework,
					category: def.category,
					name: repo.name,
					hasOpenApiSpec: repo.hasOpenApiSpec ?? false,
				});
			}
		}
	}

	return repos;
}

/**
 * Prints test results summary.
 */
function printSummary(results: Array<TestResult>): void {
	console.log("\n" + "=".repeat(80));
	console.log("TEST RESULTS SUMMARY");
	console.log("=".repeat(80));

	const passed = results.filter((r) => r.success);
	const failed = results.filter((r) => !r.success);

	console.log(`\nTotal: ${results.length} | Passed: ${passed.length} | Failed: ${failed.length}`);

	// Group by category
	const byCategory = new Map<string, Array<TestResult>>();
	for (const result of results) {
		const list = byCategory.get(result.category) || [];
		list.push(result);
		byCategory.set(result.category, list);
	}

	for (const [category, categoryResults] of byCategory) {
		const categoryPassed = categoryResults.filter((r) => r.success).length;
		console.log(`\n${category}: ${categoryPassed}/${categoryResults.length} passed`);

		for (const result of categoryResults) {
			const status = result.success ? "✅" : "❌";
			const routes = result.routesFound !== undefined ? `(${result.routesFound} routes)` : "";
			const source = result.source ? `[${result.source}]` : "";
			console.log(`  ${status} ${result.repo} ${routes} ${source}`);
			if (result.error) {
				console.log(`     Error: ${result.error}`);
			}
		}
	}

	// Print timing
	const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
	console.log(`\nTotal time: ${(totalDuration / 1000).toFixed(1)}s`);
}

/**
 * Main function.
 */
async function main(): Promise<void> {
	const options = parseArgs();

	console.log("🧪 OpenAPI Generator Test Runner");
	console.log(`📁 Target directory: ${options.targetDir}`);
	if (options.filter) console.log(`🔍 Filter: ${options.filter}`);
	if (options.category) console.log(`📂 Category: ${options.category}`);
	if (options.llm) console.log(`🤖 LLM fallback enabled`);
	console.log("");

	const repos = getReposToTest(options);

	if (repos.length === 0) {
		console.log("No repos match the specified filters.");
		return;
	}

	console.log(`Found ${repos.length} repos to test:\n`);

	if (options.dryRun) {
		for (const repo of repos) {
			console.log(`  📦 ${repo.path} (${repo.category})`);
		}
		console.log("\n[Dry run - no tests executed]");
		return;
	}

	const results: Array<TestResult> = [];

	for (const repo of repos) {
		const fullPath = path.join(options.targetDir, repo.path);

		if (!(await directoryExists(fullPath))) {
			console.log(`⏭️  Skipping ${repo.path} (not found)`);
			results.push({
				repo: repo.path,
				language: repo.language,
				framework: repo.framework,
				category: repo.category,
				success: false,
				hasOpenApiSpec: repo.hasOpenApiSpec,
				error: "Directory not found",
				duration: 0,
			});
			continue;
		}

		console.log(`🧪 Testing ${repo.path}...`);
		const result = await runGenerator(fullPath, { llm: options.llm });
		const metrics = extractMetrics(result.output);

		results.push({
			repo: repo.path,
			language: repo.language,
			framework: repo.framework,
			category: repo.category,
			success: result.success,
			hasOpenApiSpec: repo.hasOpenApiSpec,
			routesFound: metrics.routesFound,
			source: metrics.source,
			error: result.success ? undefined : "Generator failed",
			duration: result.duration,
		});

		const status = result.success ? "✅" : "❌";
		console.log(`   ${status} Completed in ${(result.duration / 1000).toFixed(1)}s`);
	}

	printSummary(results);
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
