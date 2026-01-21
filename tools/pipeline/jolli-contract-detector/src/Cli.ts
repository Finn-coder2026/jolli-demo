#!/usr/bin/env node
/**
 * CLI entry point for contract detection (environment variables and OpenAPI).
 *
 * Usage:
 *   node dist/Cli.js [options]
 *
 * Options:
 *   --detector <type> Detector type: env or openapi (default: env)
 *   --base <ref>      Base branch/ref to compare against (default: origin/main)
 *   --output <path>   Output file path (default: changed_contract_refs.json)
 *   --cwd <path>      Working directory (default: current directory)
 *   --repo <path>     Repository path for external repo scanning (required for openapi)
 *   --help            Show help message
 *
 * Environment Variable Detection (--detector env):
 *   - Environment variable additions/removals in .env files
 *   - process.env.X references in changed JS/TS source files
 *
 * OpenAPI Detection (--detector openapi):
 *   - API route file changes in routes or api directories (.ts, .js files)
 *   - Maps route files to operationIds using:
 *     1. operationid-mapping.json file in repo root
 *     2. // operationId: ServiceName_methodName comments
 *     3. Filename convention (rate-limit.get.ts → RateLimitService_get)
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectContractChanges } from "./Detector.js";
import type { DetectorOptions } from "./types.js";

const HELP_TEXT = `
contract-detector - Detect contract changes (environment variables and OpenAPI) in PRs

Usage:
  node dist/Cli.js [options]

Options:
  --detector <type> Detector type: env or openapi (default: env)
  --base <ref>      Base branch/ref to compare against (default: origin/main)
  --output <path>   Output file path (default: changed_contract_refs.json)
  --cwd <path>      Working directory (default: current directory)
  --repo <path>     Repository path for external repo scanning (required for openapi)
  --help            Show this help message

Environment Variable Detection (--detector env):
  - Environment variable additions/removals in .env, .env.example, .env.template
  - process.env.X references in changed JS/TS source files

OpenAPI Detection (--detector openapi):
  - API route file changes in routes or api directories (.ts, .js files)
  - Maps route files to operationIds using:
    1. operationid-mapping.json file in repo root
    2. // operationId: ServiceName_methodName comments
    3. Filename convention (rate-limit.get.ts → RateLimitService_get)

Output:
  Produces a JSON file with the structure:
  {
    "source": "env" | "openapi",
    "changed_contract_refs": [
      { "type": "config" | "openapi", "key": "VAR_NAME or operationId" }
    ],
    "summary": {
      "added": ["NEW_ITEM"],
      "removed": ["OLD_ITEM"],
      "changed": ["MODIFIED_ITEM"]
    }
  }
`;

/**
 * Parse command line arguments.
 * @param args - Process arguments (process.argv.slice(2))
 * @returns Parsed options
 */
export function parseArgs(args: Array<string>): DetectorOptions & { help: boolean } {
	const options: DetectorOptions & { help: boolean } = {
		detector: "env",
		base: "origin/main",
		output: "changed_contract_refs.json",
		cwd: process.cwd(),
		help: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--help" || arg === "-h") {
			options.help = true;
		} else if (arg === "--detector" && i + 1 < args.length) {
			const detectorType = args[++i];
			if (detectorType !== "env" && detectorType !== "openapi") {
				throw new Error(`Invalid detector type: ${detectorType}. Must be "env" or "openapi"`);
			}
			options.detector = detectorType;
		} else if (arg === "--base" && i + 1 < args.length) {
			options.base = args[++i];
		} else if (arg === "--output" && i + 1 < args.length) {
			options.output = args[++i];
		} else if (arg === "--cwd" && i + 1 < args.length) {
			options.cwd = resolve(args[++i]);
		} else if (arg === "--repo" && i + 1 < args.length) {
			options.repo = resolve(args[++i]);
		}
	}

	return options;
}

/**
 * Main CLI function.
 * @param args - Command line arguments
 * @returns Promise resolving to exit code (0 for success, 1 for error)
 */
export async function main(args: Array<string>): Promise<number> {
	const options = parseArgs(args);

	if (options.help) {
		console.log(HELP_TEXT);
		return 0;
	}

	try {
		console.log(`Detecting ${options.detector} contract changes...`);
		console.log(`  Detector: ${options.detector}`);
		console.log(`  Base: ${options.base}`);
		console.log(`  Output: ${options.output}`);
		console.log(`  CWD: ${options.cwd}`);
		if (options.repo) {
			console.log(`  Repo: ${options.repo}`);
		}
		console.log();

		const result = await detectContractChanges(options);

		// Write output file
		const outputPath = resolve(options.cwd, options.output);
		writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n", "utf-8");

		// Print summary
		const totalChanges = result.changed_contract_refs.length;
		console.log(`Detection complete!`);
		console.log(`  Total contract changes: ${totalChanges}`);
		console.log(`  Added: ${result.summary.added.length}`);
		console.log(`  Removed: ${result.summary.removed.length}`);
		console.log(`  Changed: ${result.summary.changed.length}`);
		console.log();
		console.log(`Output written to: ${outputPath}`);

		return 0;
	} catch (error) {
		console.error("Error detecting contract changes:");
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

// Run if executed directly
/* v8 ignore start */
const isMainModule = process.argv[1]?.endsWith("Cli.js") || process.argv[1]?.endsWith("Cli.ts");
if (isMainModule) {
	main(process.argv.slice(2)).then((exitCode) => {
		process.exit(exitCode);
	});
}
/* v8 ignore stop */
