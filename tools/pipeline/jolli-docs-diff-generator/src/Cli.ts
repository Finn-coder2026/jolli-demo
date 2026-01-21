#!/usr/bin/env node
/**
 * CLI for documentation diff generator.
 */

import { resolve } from "node:path";
import type { DiffGeneratorOptions } from "./types.js";
import { generateDiff } from "./DiffGenerator.js";

/**
 * Parse command line arguments.
 * @param args - Command line arguments
 * @returns Parsed diff generator options and help flag
 */
export function parseArgs(
	args: Array<string>,
): DiffGeneratorOptions & { help: boolean } {
	const result: Partial<DiffGeneratorOptions> & { help: boolean } = {
		help: false,
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
			case "--from":
				if (next) {
					result.fromVersion = next;
					i++;
				}
				break;
			case "--to":
				if (next) {
					result.toVersion = next;
					i++;
				}
				break;
			case "--artifactsDir":
				if (next) {
					result.artifactsDir = resolve(next);
					i++;
				}
				break;
		}
	}

	return result as DiffGeneratorOptions & { help: boolean };
}

/**
 * Display help message.
 */
function displayHelp(): void {
	console.log(`
jolli-docs-diff-generator - Generate version-to-version diffs for documentation

Usage:
  jolli-docs-diff-generator --source <name> --from <ver1> --to <ver2> --artifactsDir <path>

Options:
  --source <name>          Source identifier (e.g., "openapi-demo")
  --from <version>         From version (e.g., "v1")
  --to <version>           To version (e.g., "v2")
  --artifactsDir <path>    Path to artifacts directory (default: "artifacts")
  --help, -h               Display this help message

Example:
  jolli-docs-diff-generator \\
    --source openapi-demo \\
    --from v1 \\
    --to v2 \\
    --artifactsDir artifacts

Input Files:
  artifacts/<source>/<from>/graph.json  - Source version content graph
  artifacts/<source>/<to>/graph.json    - Target version content graph

Output File:
  artifacts/<source>/diffs/<from>__<to>.json  - Version diff
`);
}

/**
 * Main CLI entry point.
 * @param args - Command line arguments
 * @returns Exit code
 */
export function main(args: Array<string>): number {
	const options = parseArgs(args);

	if (options.help) {
		displayHelp();
		return 0;
	}

	// Validate required options
	if (
		!options.source ||
		!options.fromVersion ||
		!options.toVersion ||
		!options.artifactsDir
	) {
		console.error("Error: Missing required options");
		console.error("Required: --source, --from, --to, --artifactsDir");
		console.error("Run with --help for usage information");
		return 1;
	}

	try {
		console.log("Generating documentation diff...");
		console.log(`  Source: ${options.source}`);
		console.log(`  From: ${options.fromVersion}`);
		console.log(`  To: ${options.toVersion}`);
		console.log(`  Artifacts Dir: ${options.artifactsDir}`);
		console.log();

		const result = generateDiff(options);

		console.log("Diff generation complete!");
		console.log(`  Added sections: ${result.addedCount}`);
		console.log(`  Removed sections: ${result.removedCount}`);
		console.log(`  Modified sections: ${result.modifiedCount}`);
		console.log();
		console.log(`Output file: ${result.outputFile}`);

		return 0;
	} catch (error) {
		console.error("Error generating diff:");
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

// Run if executed directly
/* v8 ignore start */
const isMainModule = process.argv[1]?.endsWith("Cli.js") || process.argv[1]?.endsWith("Cli.ts");
if (isMainModule) {
	const exitCode = main(process.argv.slice(2));
	process.exit(exitCode);
}
/* v8 ignore stop */
