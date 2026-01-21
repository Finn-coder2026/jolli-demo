/**
 * code2openapi - CLI tool to extract OpenAPI specification from code
 *
 * Scans a codebase for API route definitions and generates an OpenAPI 3.0 spec.
 * Supports Express, Fastify, Koa, Hono, NestJS, and Next.js App Router.
 */

import { OpenAPIFromCodeGenerator } from "./core/generators/OpenapiFromCode";
import { CodeScanner } from "./core/scanners/CodeScanner";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { stringify as yamlStringify } from "yaml";

interface CliOptions {
	output: string;
	format: "yaml" | "json";
	quiet: boolean;
}

const program = new Command();

program
	.name("code2openapi")
	.description("Extract OpenAPI specification from code")
	.version("1.0.0")
	.argument("<repo-path>", "Path to the repository to scan")
	.option("-o, --output <path>", "Output file path", "openapi.yaml")
	.option("-f, --format <format>", "Output format (yaml or json)", "yaml")
	.option("-q, --quiet", "Suppress progress output", false)
	.action(async (repoPath: string, options: CliOptions) => {
		const absolutePath = resolve(repoPath);
		// biome-ignore lint/suspicious/noConsole: CLI tool needs console output
		// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op for quiet mode
		const log = options.quiet ? () => {} : console.log;
		const logError = process.stderr.write.bind(process.stderr);

		log(`Scanning ${absolutePath}...`);

		const scanner = new CodeScanner();
		let fileCount = 0;

		// Set up event listeners for progress
		scanner.on("filesFound", ({ count }) => {
			fileCount = count;
			log(`Found ${count} files to scan`);
		});

		scanner.on("progress", ({ current, total, percentage }) => {
			if (!options.quiet) {
				process.stdout.write(`\rScanning: ${current}/${total} (${percentage}%)`);
			}
		});

		scanner.on("routeFound", route => {
			log(`\n  Found: ${route.method} ${route.path}`);
		});

		scanner.on("error", ({ filePath, error }) => {
			log(`\n  Warning: Error parsing ${filePath}: ${(error as Error).message}`);
		});

		try {
			// Scan the codebase
			const scanResult = await scanner.scan(absolutePath);

			if (!options.quiet && fileCount > 0) {
				process.stdout.write("\n");
			}

			log(`\nFound ${scanResult.routes.length} routes`);

			// Generate OpenAPI spec
			const generator = new OpenAPIFromCodeGenerator();
			const spec = generator.generate(scanResult);

			// Determine output path and format
			let outputPath = options.output;
			const format = options.format.toLowerCase() as "yaml" | "json";

			// Adjust file extension based on format
			if (format === "json" && !outputPath.endsWith(".json")) {
				outputPath = outputPath.replace(/\.ya?ml$/, ".json");
				if (!outputPath.endsWith(".json")) {
					outputPath = `${outputPath}.json`;
				}
			} else if (format === "yaml" && !outputPath.endsWith(".yaml") && !outputPath.endsWith(".yml")) {
				outputPath = outputPath.replace(/\.json$/, ".yaml");
			}

			// Serialize and write
			const content = format === "json" ? JSON.stringify(spec, null, 2) : yamlStringify(spec);

			writeFileSync(outputPath, content, "utf-8");

			log(`OpenAPI spec written to: ${outputPath}`);
			log(`\nAPI: ${spec.info.title} v${spec.info.version}`);
			log(`Endpoints: ${Object.keys(spec.paths).length} paths`);
		} catch (error) {
			logError(`Error: ${(error as Error).message}\n`);
			process.exit(1);
		}
	});

program.parse();
