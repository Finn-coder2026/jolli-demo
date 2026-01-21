#!/usr/bin/env node
/**
 * CLI for documentation compiler.
 */

import { resolve } from "node:path";
import type { CompilerOptions } from "./types.js";
import { compileDocumentation } from "./Compiler.js";

/**
 * Parse command line arguments.
 * @param args - Command line arguments
 * @returns Parsed compiler options and help flag
 */
export function parseArgs(
	args: Array<string>,
): CompilerOptions & { help: boolean } {
	const result: Partial<CompilerOptions> & { help: boolean } = {
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
			case "--docsDir":
				if (next) {
					result.docsDir = resolve(next);
					i++;
				}
				break;
			case "--version":
				if (next) {
					result.version = next;
					i++;
				}
				break;
			case "--out":
			case "--outputDir":
				if (next) {
					result.outputDir = resolve(next);
					i++;
				}
				break;
		}
	}

	return result as CompilerOptions & { help: boolean };
}

/**
 * Display help message.
 */
function displayHelp(): void {
	console.log(`
jolli-docs-compiler - Compile MDX documentation into versioned content graph

Usage:
  jolli-docs-compiler --source <name> --docsDir <path> --version <ver> --out <path>

Options:
  --source <name>      Source identifier (e.g., "openapi-demo")
  --docsDir <path>     Path to documentation directory
  --version <version>  Version identifier (e.g., "v1", "v2")
  --out <path>         Output directory for artifacts (default: "artifacts")
  --help, -h           Display this help message

Example:
  jolli-docs-compiler \\
    --source openapi-demo \\
    --docsDir docs/openapi-demo \\
    --version v1 \\
    --out artifacts

Output Files:
  artifacts/<source>/<version>/graph.json          - Full content graph
  artifacts/<source>/<version>/reverse_index.json  - Contract ref → section IDs
  artifacts/<source>/<version>/sections.jsonl      - Streaming section data
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
	if (!options.source || !options.docsDir || !options.version || !options.outputDir) {
		console.error("Error: Missing required options");
		console.error("Required: --source, --docsDir, --version, --out");
		console.error("Run with --help for usage information");
		return 1;
	}

	try {
		console.log("Compiling documentation...");
		console.log(`  Source: ${options.source}`);
		console.log(`  Docs Dir: ${options.docsDir}`);
		console.log(`  Version: ${options.version}`);
		console.log(`  Output Dir: ${options.outputDir}`);
		console.log();

		const result = compileDocumentation(options);

		console.log("Compilation complete!");
		console.log(`  Documents processed: ${result.documentsProcessed}`);
		console.log(`  Sections created: ${result.sectionsCreated}`);
		console.log();
		console.log("Output files:");
		console.log(`  Graph: ${result.outputFiles.graph}`);
		console.log(`  Reverse Index: ${result.outputFiles.reverseIndex}`);
		console.log(`  Sections: ${result.outputFiles.sections}`);

		return 0;
	} catch (error) {
		console.error("Error compiling documentation:");
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
