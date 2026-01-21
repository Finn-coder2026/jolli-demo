#!/usr/bin/env node
/**
 * CLI entry point for OpenAPI specification generation.
 *
 * Usage:
 *   node dist/Cli.js [options]
 *
 * Options:
 *   --repo <path>         Repository path to scan (required)
 *   --output <path>       Output file path (default: openapi.json or openapi.yaml)
 *   --format <type>       Output format: json or yaml (default: json)
 *   --title <string>      API title (default: inferred from repo name)
 *   --version <string>    API version (default: 1.0.0)
 *   --description <text>  API description
 *   --server <url>        Server URL to include in spec
 *   --mapping <path>      Path to operationId mapping JSON file
 *   --include <patterns>  Comma-separated glob patterns to include
 *   --exclude <patterns>  Comma-separated glob patterns to exclude
 *   --llm                 Enable LLM fallback for low-coverage extraction
 *   --no-llm              Disable LLM fallback (default)
 *   --llm-only            Use only LLM extraction (skip AST)
 *   --llm-threshold <n>   Coverage percentage below which to trigger LLM (default: 20)
 *   --estimate-cost       Estimate LLM cost without calling the API
 *   --help                Show help message
 */

import { resolve } from "node:path";
import { generateOpenApiSpec, writeSpec } from "./Generator.js";
import type { GeneratorOptions, LLMOptions } from "./types.js";

const HELP_TEXT = `
jolli-openapi-generator - Generate OpenAPI specification from source code

Usage:
  node dist/Cli.js --repo <path> [options]

Required:
  --repo <path>         Repository path to scan

Options:
  --output <path>       Output file path (default: openapi.json or openapi.yaml)
  --format <type>       Output format: json or yaml (default: json)
  --title <string>      API title (default: inferred from repo name)
  --version <string>    API version (default: 1.0.0)
  --description <text>  API description
  --server <url>        Server URL to include in spec
  --mapping <path>      Path to operationId mapping JSON file
  --include <patterns>  Comma-separated glob patterns to include
  --exclude <patterns>  Comma-separated glob patterns to exclude
  --help                Show this help message

LLM Options:
  --llm                 Enable LLM fallback for low-coverage extraction
  --no-llm              Disable LLM fallback (default)
  --llm-only            Use only LLM extraction (skip AST)
  --llm-threshold <n>   Coverage % below which to trigger LLM (default: 20)
  --estimate-cost       Estimate LLM cost without calling the API

Examples:
  # Basic usage
  node dist/Cli.js --repo ./my-api

  # Generate YAML output
  node dist/Cli.js --repo ./my-api --format yaml --output api-spec.yaml

  # With custom title and version
  node dist/Cli.js --repo ./my-api --title "My API" --version 2.0.0

  # With server URL
  node dist/Cli.js --repo ./my-api --server https://api.example.com

  # With LLM fallback enabled
  node dist/Cli.js --repo ./my-api --llm

  # LLM-only extraction
  node dist/Cli.js --repo ./my-api --llm-only

  # Estimate cost before running LLM
  node dist/Cli.js --repo ./my-api --estimate-cost

Output:
  Produces an OpenAPI 3.0.3 compliant specification file.

Supported Frameworks:
  - Express
  - Fastify
  - Koa
  - Hono
  - NestJS
  - Next.js App Router
`;

/**
 * Parsed CLI options.
 */
export interface CliOptions extends GeneratorOptions {
	help: boolean;
	estimateCost: boolean;
}

/**
 * Parse command line arguments.
 * @param args - Process arguments (process.argv.slice(2))
 * @returns Parsed options
 */
export function parseArgs(args: Array<string>): CliOptions {
	const options: CliOptions = {
		repo: "",
		output: "",
		format: "json",
		help: false,
		estimateCost: false,
	};

	// LLM options with defaults
	let llmEnabled = false;
	let llmOnly = false;
	let llmThreshold = 20;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--help" || arg === "-h") {
			options.help = true;
		} else if (arg === "--repo" && i + 1 < args.length) {
			options.repo = resolve(args[++i]);
		} else if (arg === "--output" && i + 1 < args.length) {
			options.output = args[++i];
		} else if (arg === "--format" && i + 1 < args.length) {
			const format = args[++i];
			if (format !== "json" && format !== "yaml") {
				throw new Error(`Invalid format: ${format}. Must be "json" or "yaml"`);
			}
			options.format = format;
		} else if (arg === "--title" && i + 1 < args.length) {
			options.title = args[++i];
		} else if (arg === "--version" && i + 1 < args.length) {
			options.version = args[++i];
		} else if (arg === "--description" && i + 1 < args.length) {
			options.description = args[++i];
		} else if (arg === "--server" && i + 1 < args.length) {
			options.serverUrl = args[++i];
		} else if (arg === "--mapping" && i + 1 < args.length) {
			options.operationIdMapping = resolve(args[++i]);
		} else if (arg === "--include" && i + 1 < args.length) {
			options.includePaths = args[++i].split(",").map((p) => p.trim());
		} else if (arg === "--exclude" && i + 1 < args.length) {
			options.excludePaths = args[++i].split(",").map((p) => p.trim());
		} else if (arg === "--llm") {
			llmEnabled = true;
		} else if (arg === "--no-llm") {
			llmEnabled = false;
		} else if (arg === "--llm-only") {
			llmEnabled = true;
			llmOnly = true;
		} else if (arg === "--llm-threshold" && i + 1 < args.length) {
			llmThreshold = Number.parseInt(args[++i], 10);
			if (Number.isNaN(llmThreshold) || llmThreshold < 0 || llmThreshold > 100) {
				throw new Error("--llm-threshold must be a number between 0 and 100");
			}
		} else if (arg === "--estimate-cost") {
			options.estimateCost = true;
			llmEnabled = true; // Implicitly enable LLM for cost estimation
		}
	}

	// Set LLM options if enabled
	if (llmEnabled) {
		options.llm = {
			enabled: true,
			threshold: llmThreshold,
			forceOnly: llmOnly,
			estimateCostOnly: options.estimateCost,
		};
	}

	// Set default output based on format if not specified
	if (!options.output) {
		options.output = options.format === "yaml" ? "openapi.yaml" : "openapi.json";
	}

	return options;
}

/**
 * Main CLI function.
 * @param args - Command line arguments
 * @returns Exit code (0 for success, 1 for error)
 */
export async function main(args: Array<string>): Promise<number> {
	let options: CliOptions;
	try {
		options = parseArgs(args);
	} catch (error) {
		console.error("Error parsing arguments:");
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}

	if (options.help) {
		console.log(HELP_TEXT);
		return 0;
	}

	if (!options.repo) {
		console.error("Error: --repo is required");
		console.error("Use --help for usage information");
		return 1;
	}

	try {
		console.log("Generating OpenAPI specification...");
		console.log(`  Repository: ${options.repo}`);
		console.log(`  Output: ${options.output}`);
		console.log(`  Format: ${options.format}`);
		if (options.title) {
			console.log(`  Title: ${options.title}`);
		}
		if (options.version) {
			console.log(`  Version: ${options.version}`);
		}
		if (options.serverUrl) {
			console.log(`  Server: ${options.serverUrl}`);
		}
		if (options.llm?.enabled) {
			console.log(`  LLM: enabled (threshold: ${options.llm.threshold}%)`);
			if (options.llm.forceOnly) {
				console.log(`  LLM Mode: only (skip AST extraction)`);
			}
		}
		console.log();

		const result = await generateOpenApiSpec(options);

		// If this was just a cost estimate, don't write files
		if (options.estimateCost) {
			console.log("Cost Estimation Complete!");
			if (result.summary.detection?.cost) {
				const cost = result.summary.detection.cost;
				console.log(`  Files to analyze: ${cost.chunksProcessed} chunks`);
				console.log(`  Estimated input tokens: ${cost.inputTokens}`);
				console.log(`  Estimated output tokens: ${cost.outputTokens}`);
				console.log(`  Estimated cost: $${cost.estimatedCost.toFixed(4)}`);
			}
			return 0;
		}

		// Write output file
		const outputPath = resolve(options.output);
		await writeSpec(result.spec, outputPath, options.format);

		// Print summary
		console.log("Generation complete!");
		console.log(`  Total routes: ${result.summary.totalRoutes}`);
		console.log(`  Routes with request body: ${result.summary.routesWithRequestBody}`);
		console.log(`  Routes with responses: ${result.summary.routesWithResponses}`);
		if (result.summary.frameworksDetected.length > 0) {
			console.log(`  Frameworks detected: ${result.summary.frameworksDetected.join(", ")}`);
		}
		console.log(`  Routes by method:`);
		for (const [method, count] of Object.entries(result.summary.routesByMethod)) {
			console.log(`    ${method}: ${count}`);
		}

		// Print detection metadata if available
		if (result.summary.detection) {
			const det = result.summary.detection;
			console.log();
			console.log("Detection:");
			console.log(`  Source: ${det.source}`);
			console.log(`  Language: ${det.language}`);
			console.log(`  Framework: ${det.framework} (${det.frameworkCategory})`);
			console.log(`  Confidence: ${(det.confidence * 100).toFixed(0)}%`);
			console.log(`  Coverage: ${det.coverage.routesFound}/${det.coverage.estimatedTotal} (${det.coverage.percentage.toFixed(0)}%)`);
			if (det.cost) {
				console.log(`  LLM Cost: $${det.cost.estimatedCost.toFixed(4)} (${det.cost.inputTokens} input, ${det.cost.outputTokens} output tokens)`);
			}
		}

		console.log();
		console.log(`Output written to: ${outputPath}`);

		return 0;
	} catch (error) {
		console.error("Error generating OpenAPI specification:");
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
