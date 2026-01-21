import { DocusaurusConfigGenerator } from "./generator/DocusaurusConfigGenerator.js";
import { SidebarGenerator } from "./generator/SidebarGenerator.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface GeneratorOptions {
	docs: string;
	output: string;
	title: string;
	url: string;
	baseUrl: string;
	org: string;
	project: string;
}

export interface GeneratorResult {
	success: boolean;
	error?: string;
	docsPath?: string;
	outputPath?: string;
}

/**
 * Generates Docusaurus configuration from docs folder.
 */
export function generateDocusaurus(options: GeneratorOptions): GeneratorResult {
	// Validate docs directory exists
	const docsPath = resolve(options.docs);
	if (!existsSync(docsPath)) {
		return {
			success: false,
			error: `Docs directory not found: ${docsPath}`,
		};
	}

	const outputPath = resolve(options.output);

	try {
		const sidebarGen = new SidebarGenerator();
		sidebarGen.generate(docsPath, outputPath);
		const configGen = new DocusaurusConfigGenerator({
			title: options.title,
			url: options.url,
			baseUrl: options.baseUrl,
			organizationName: options.org,
			projectName: options.project,
		});
		configGen.generate(outputPath);

		return {
			success: true,
			docsPath,
			outputPath,
		};
	} catch (error) {
		return {
			success: false,
			error: `Error generating configuration: ${error}`,
		};
	}
}
