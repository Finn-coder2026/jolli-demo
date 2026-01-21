#!/usr/bin/env node
/**
 * CLI for documentation impact analyzer.
 */

import { resolve } from "node:path";
import type { AnalyzerOptions } from "./types.js";
import { analyzeImpact } from "./Analyzer.js";

/**
 * Parse command line arguments.
 * @param args - Command line arguments
 * @returns Parsed analyzer options and help flag
 */
export function parseArgs(
	args: Array<string>,
): AnalyzerOptions & { help: boolean } {
	const result: Partial<AnalyzerOptions> & { help: boolean } = {
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
			case "--version":
				if (next) {
					result.version = next;
					i++;
				}
				break;
			case "--artifactsDir":
				if (next) {
					result.artifactsDir = resolve(next);
					i++;
				}
				break;
			case "--direct-only":
				result.directOnly = true;
				break;
		}
	}

	return result as AnalyzerOptions & { help: boolean };
}

/**
 * Display help message.
 */
function displayHelp(): void {
	console.log(`
jolli-docs-impact-analyzer - Analyze which documentation sections are impacted by code changes

Usage:
  jolli-docs-impact-analyzer --source <name> --version <ver> --artifactsDir <path> [--direct-only]

Options:
  --source <name>          Source identifier (e.g., "openapi-demo")
  --version <version>      Version identifier (e.g., "v1")
  --artifactsDir <path>    Path to artifacts directory (default: "artifacts")
  --direct-only            Only include sections with direct coverage (filters out listed/mentioned)
  --help, -h               Display this help message

Example:
  jolli-docs-impact-analyzer \\
    --source openapi-demo \\
    --version v1 \\
    --artifactsDir artifacts \\
    --direct-only

Input Files:
  artifacts/<source>/changed_contract_refs.json   - Changed contract references
  artifacts/<source>/<version>/reverse_index.json - Contract ref → section IDs

Output File:
  artifacts/<source>/impacted_sections.json       - Impacted sections analysis
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
	if (!options.source || !options.version || !options.artifactsDir) {
		console.error("Error: Missing required options");
		console.error("Required: --source, --version, --artifactsDir");
		console.error("Run with --help for usage information");
		return 1;
	}

	try {
		console.log("Analyzing documentation impact...");
		console.log(`  Source: ${options.source}`);
		console.log(`  Version: ${options.version}`);
		console.log(`  Artifacts Dir: ${options.artifactsDir}`);
		if (options.directOnly) {
			console.log("  Direct Only: enabled (filtering out listed/mentioned sections)");
		}
		console.log();

		const result = analyzeImpact(options);

		console.log("Analysis complete!");
		console.log(`  Contracts changed: ${result.contractsChanged}`);
		console.log(`  Sections impacted: ${result.sectionsImpacted}`);
		console.log();
		console.log(`Output file: ${result.outputFile}`);

		return 0;
	} catch (error) {
		console.error("Error analyzing impact:");
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
