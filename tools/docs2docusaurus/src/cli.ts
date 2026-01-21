#!/usr/bin/env node
import { generateDocusaurus } from "./index.js";
import { program } from "commander";

program
	.name("docs2docusaurus")
	.description("Generate Docusaurus configuration from existing documentation folders")
	.version("1.0.0")
	.option("-d, --docs <path>", "Path to the docs folder", "./docs")
	.option("-o, --output <path>", "Output directory for Docusaurus config", ".")
	.option("-t, --title <title>", "Site title", "API Documentation")
	.option("-u, --url <url>", "Site URL", "https://example.com")
	.option("-b, --base-url <path>", "Base URL path", "/")
	.option("--org <name>", "Organization name", "your-org")
	.option("--project <name>", "Project name", "your-project")
	.option("--openapi", "Generate OpenAPI spec from docs metadata", false)
	.parse(process.argv);

const opts = program.opts();

const result = generateDocusaurus({
	docs: opts.docs,
	output: opts.output,
	title: opts.title,
	url: opts.url,
	baseUrl: opts.baseUrl,
	org: opts.org,
	project: opts.project,
});

if (!result.success) {
	console.error(`❌ ${result.error}`);
	process.exit(1);
}
