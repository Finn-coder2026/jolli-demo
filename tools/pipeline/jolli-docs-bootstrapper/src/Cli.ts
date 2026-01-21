#!/usr/bin/env node
/**
 * CLI entry point for documentation bootstrapper.
 *
 * Usage:
 *   node dist/Cli.js [options]
 *
 * Options:
 *   --source <name>     Source identifier (required)
 *   --repo <path>       Repository path to scan (required)
 *   --docsDir <path>    Documentation directory path (required)
 *   --ai-enhance        Enable AI enhancement (optional)
 *   --help              Show help message
 */

import { resolve } from "node:path";
import { bootstrapDocumentation } from "./Bootstrapper.js";
import type { BootstrapperOptions } from "./types.js";

const HELP_TEXT = `
jolli-docs-bootstrapper - Bootstrap initial MDX documentation from API contracts

Usage:
  node dist/Cli.js [options]

Options:
  --source <name>     Source identifier (e.g., "openapi-demo") (required)
  --repo <path>       Repository path to scan (required)
  --docsDir <path>    Documentation directory path (required)
  --ai-enhance        Enable AI enhancement (optional, non-critical)
  --help              Show this help message

Description:
  Scans a repository for API endpoints and generates initial MDX documentation
  with proper frontmatter and contract coverage.

  The tool will:
  1. Check if the docs directory is empty
  2. Scan the repository for route files in routes/ or api/ directories
  3. Generate MDX files with frontmatter covering OpenAPI operations
  4. Create overview, quickstart, and per-endpoint API reference docs

Example:
  jolli-docs-bootstrapper \\
    --source openapi-demo \\
    --repo ../openapi-demo \\
    --docsDir docs/openapi-demo
`;

/**
 * Parse command line arguments.
 * @param args - Process arguments (process.argv.slice(2))
 * @returns Parsed options
 */
export function parseArgs(args: Array<string>): BootstrapperOptions & { help: boolean } {
	const options: Partial<BootstrapperOptions> & { help: boolean } = {
		help: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--help" || arg === "-h") {
			options.help = true;
		} else if (arg === "--source" && i + 1 < args.length) {
			options.source = args[++i];
		} else if (arg === "--repo" && i + 1 < args.length) {
			options.repo = resolve(args[++i]);
		} else if (arg === "--docsDir" && i + 1 < args.length) {
			options.docsDir = resolve(args[++i]);
		} else if (arg === "--ai-enhance") {
			options.aiEnhance = true;
		}
	}

	return options as BootstrapperOptions & { help: boolean };
}

/**
 * Main CLI function.
 * @param args - Command line arguments
 * @returns Exit code (0 for success, 1 for error)
 */
export async function main(args: Array<string>): Promise<number> {
	const options = parseArgs(args);

	if (options.help) {
		console.log(HELP_TEXT);
		return 0;
	}

	// Validate required options
	if (!options.source || !options.repo || !options.docsDir) {
		console.error("Error: Missing required options");
		console.error("Required: --source, --repo, --docsDir");
		console.error("Run with --help for usage information");
		return 1;
	}

	try {
		console.log("Bootstrapping documentation...");
		console.log(`  Source: ${options.source}`);
		console.log(`  Repo: ${options.repo}`);
		console.log(`  Docs Dir: ${options.docsDir}`);
		if (options.aiEnhance) {
			console.log(`  AI Enhance: enabled`);
		}
		console.log();

		const result = await bootstrapDocumentation(options);

		console.log("Bootstrap complete!");
		console.log(`  Files created: ${result.filesCreated}`);
		console.log();
		console.log("Created files:");
		for (const file of result.createdFiles) {
			console.log(`  - ${file}`);
		}

		return 0;
	} catch (error) {
		console.error("Error bootstrapping documentation:");
		console.error(error instanceof Error ? error.message : String(error));
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
