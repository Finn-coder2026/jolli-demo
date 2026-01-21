#!/usr/bin/env node
/**
 * CLI for documentation auto-updater.
 */

import { resolve } from "node:path";
import type { UpdaterOptions } from "./types.js";
import { runUpdater } from "./Updater.js";

/**
 * Parse command line arguments.
 * @param args - Command line arguments
 * @returns Parsed updater options and help flag
 */
export function parseArgs(
	args: Array<string>,
): Partial<UpdaterOptions> & { help: boolean } {
	const result: Partial<UpdaterOptions> & { help: boolean } = {
		help: false,
		dryRun: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const next = args[i + 1];

		switch (arg) {
			case "--help":
			case "-h":
				result.help = true;
				break;
			case "--source":
				if (next) {
					result.source = next;
					i++;
				}
				break;
			case "--artifactsDir":
				if (next) {
					result.artifactsDir = resolve(next);
					i++;
				}
				break;
			case "--docsDir":
				if (next) {
					result.docsDir = resolve(next);
					i++;
				}
				break;
			case "--repo":
			case "--repoPath":
				if (next) {
					result.repoPath = resolve(next);
					i++;
				}
				break;
			case "--dry-run":
				result.dryRun = true;
				break;
			case "--api-key":
				if (next) {
					result.apiKey = next;
					i++;
				}
				break;
			case "--model":
				if (next) {
					result.model = next;
					i++;
				}
				break;
		}
	}

	return result;
}

/**
 * Display help message.
 */
function displayHelp(): void {
	console.log(`
jolli-docs-auto-updater - LLM-powered automatic documentation updater

Usage:
  jolli-docs-auto-updater --source <name> --artifactsDir <path> --docsDir <path> --repo <path> [options]

Options:
  --source <name>         Source identifier (e.g., "openapi-demo")
  --artifactsDir <path>   Path to artifacts directory
  --docsDir <path>        Path to documentation directory
  --repo <path>           Path to external repository
  --dry-run               Preview changes without writing (default: false)
  --api-key <key>         Anthropic API key (default: from ANTHROPIC_API_KEY env var)
  --model <model>         Claude model to use (default: claude-sonnet-4-5-20250929)
  --help, -h              Display this help message

Environment:
  ANTHROPIC_API_KEY       API key for Anthropic (loaded from backend/.env.local)

Example (dry run):
  jolli-docs-auto-updater \\
    --source openapi-demo \\
    --artifactsDir artifacts \\
    --docsDir docs/openapi-demo \\
    --repo ../openapi-demo \\
    --dry-run

Example (apply changes):
  jolli-docs-auto-updater \\
    --source openapi-demo \\
    --artifactsDir artifacts \\
    --docsDir docs/openapi-demo \\
    --repo ../openapi-demo

Workflow:
  1. Run jolli-docs-impact-analyzer to generate impacted_sections.json
  2. Run this tool to automatically update documentation
  3. Review and commit changes
  4. Run jolli-docs-compiler to create new version
`);
}

/**
 * Main CLI entry point.
 * @param args - Command line arguments
 * @returns Exit code
 */
export async function main(args: Array<string>): Promise<number> {
	const options = parseArgs(args);

	if (options.help) {
		displayHelp();
		return 0;
	}

	// Validate required options
	if (!options.source || !options.artifactsDir || !options.docsDir || !options.repoPath) {
		console.error("Error: Missing required options");
		console.error("Required: --source, --artifactsDir, --docsDir, --repo");
		console.error("Run with --help for usage information");
		return 1;
	}

	try {
		console.log("Starting documentation auto-updater...");
		console.log(`  Source: ${options.source}`);
		console.log(`  Artifacts Dir: ${options.artifactsDir}`);
		console.log(`  Docs Dir: ${options.docsDir}`);
		console.log(`  Repo: ${options.repoPath}`);
		console.log(`  Mode: ${options.dryRun ? "DRY RUN" : "APPLY CHANGES"}`);
		console.log();

		const result = await runUpdater(options as UpdaterOptions);

		if (result.sections_updated === 0) {
			console.log("No sections needed updates.");
		}

		return 0;
	} catch (error) {
		console.error("Error running auto-updater:");
		console.error(error instanceof Error ? error.message : String(error));
		if (error instanceof Error && error.stack) {
			console.error(error.stack);
		}
		return 1;
	}
}

// Run if executed directly
/* v8 ignore start */
const isMainModule = process.argv[1]?.endsWith("Cli.js") || process.argv[1]?.endsWith("Cli.ts");
if (isMainModule) {
	main(process.argv.slice(2)).then(exitCode => {
		process.exit(exitCode);
	});
}
/* v8 ignore stop */
