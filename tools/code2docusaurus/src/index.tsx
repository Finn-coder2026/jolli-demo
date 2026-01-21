import { SimpleProgressBar } from "./components/SimpleProgressBar";
import { SimpleTable } from "./components/SimpleTable";
import { DocusaurusGenerator } from "./core/generators/DocusaurusGenerator";
import { OpenAPIFromCodeGenerator } from "./core/generators/OpenapiFromCode";
import { CodeScanner, type CodeScanResult } from "./core/scanners/CodeScanner";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { program } from "commander";
import { Box, render, Text } from "ink";
import Spinner from "ink-spinner";
import type React from "react";
import { useEffect, useState } from "react";
import * as yaml from "yaml";

/**
 * Generate a placeholder Docusaurus site when no APIs are found
 */
async function generatePlaceholderDocs(outputDir: string): Promise<void> {
	// Create docs directory
	await fs.mkdir(path.join(outputDir, "docs"), { recursive: true });

	// Create "No APIs Found" markdown page
	const noApisMarkdown = `---
sidebar_position: 1
---

# No APIs Found

No API endpoints were detected in this repository.

## What does this mean?

The code scanner looked for Express/Router route definitions but couldn't find any.

## Common reasons:

- The repository doesn't contain API endpoints
- API routes are defined in a format not yet supported by the scanner
- The route files are in a location that wasn't scanned

## Supported patterns:

The scanner looks for patterns like:
\`\`\`javascript
router.get('/api/users', ...)
app.post('/api/chat', ...)
express.Router().put('/api/items/:id', ...)
\`\`\`

If you believe your repository has APIs, please check the route definitions or contact support.
`;

	await fs.writeFile(path.join(outputDir, "docs", "no-apis.md"), noApisMarkdown);

	// Create docusaurus.config.js
	const docusaurusConfig = `// @ts-check

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'API Documentation',
  tagline: 'Generated API Documentation',
  url: 'https://example.com',
  baseUrl: '/',
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',
  organizationName: 'your-org',
  projectName: 'your-project',

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'API Documentation',
        items: [],
      },
      footer: {
        style: 'dark',
        copyright: \`Copyright © \${new Date().getFullYear()}\`,
      },
    }),
};

module.exports = config;
`;

	await fs.writeFile(path.join(outputDir, "docusaurus.config.js"), docusaurusConfig);

	// Create sidebars.js
	const sidebarsConfig = `/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  apiSidebar: [
    {
      type: 'doc',
      id: 'no-apis',
      label: 'No APIs Found',
    },
  ],
};

module.exports = sidebars;
`;

	await fs.writeFile(path.join(outputDir, "sidebars.js"), sidebarsConfig);

	// Create package.json
	const packageJson = {
		name: "api-documentation",
		version: "1.0.0",
		private: true,
		scripts: {
			docusaurus: "docusaurus",
			start: "docusaurus start",
			build: "docusaurus build",
			swizzle: "docusaurus swizzle",
			deploy: "docusaurus deploy",
			clear: "docusaurus clear",
			serve: "docusaurus serve",
			"write-translations": "docusaurus write-translations",
			"write-heading-ids": "docusaurus write-heading-ids",
		},
		dependencies: {
			"@docusaurus/core": "^3.0.0",
			"@docusaurus/preset-classic": "^3.0.0",
			"@mdx-js/react": "^3.0.0",
			clsx: "^2.0.0",
			"prism-react-renderer": "^2.1.0",
			react: "^18.2.0",
			"react-dom": "^18.2.0",
		},
		engines: {
			node: ">=18.0",
		},
	};

	await fs.writeFile(path.join(outputDir, "package.json"), JSON.stringify(packageJson, null, 2));

	// Create src/css/custom.css
	await fs.mkdir(path.join(outputDir, "src", "css"), { recursive: true });
	const customCss = `/**
 * Custom CSS for API documentation
 */

:root {
  --ifm-color-primary: #2e8555;
  --ifm-color-primary-dark: #29784c;
  --ifm-color-primary-darker: #277148;
  --ifm-color-primary-darkest: #205d3b;
  --ifm-color-primary-light: #33925d;
  --ifm-color-primary-lighter: #359962;
  --ifm-color-primary-lightest: #3cad6e;
  --ifm-code-font-size: 95%;
}
`;

	await fs.writeFile(path.join(outputDir, "src", "css", "custom.css"), customCss);
}

interface Code2DocusaurusProps {
	repoPath: string;
	options: {
		output?: string;
		format?: "yaml" | "json";
		generateDocs?: boolean;
	};
}

const Code2Docusaurus: React.FC<Code2DocusaurusProps> = ({ repoPath, options }) => {
	const [stage, setStage] = useState<"scanning" | "generating" | "complete" | "error">("scanning");
	const [currentFile, setCurrentFile] = useState("");
	const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0 });
	const [scanResult, setScanResult] = useState<CodeScanResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [outputPath, setOutputPath] = useState<string | null>(null);
	const [parseErrors, setParseErrors] = useState<Array<{ file: string; error: string }>>([]);

	useEffect(() => {
		const runScan = async () => {
			try {
				// Stage 1: Scan code
				setStage("scanning");
				const scanner = new CodeScanner();

				scanner.on("file", (filePath: string) => {
					setCurrentFile(filePath);
				});

				scanner.on("progress", (prog: { current: number; total: number }) => {
					setProgress({
						current: prog.current,
						total: prog.total,
						percentage: Math.round((prog.current / prog.total) * 100),
					});
				});

				scanner.on("routeFound", () => {
					// Could show real-time route discovery here
				});

				scanner.on("error", (err: { filePath: string; error: Error }) => {
					// Track parse errors but don't fail the whole scan
					setParseErrors(prev => [...prev, { file: err.filePath, error: err.error.message }]);
				});

				const result = await scanner.scan(repoPath);
				setScanResult(result);

				// Stage 2: Generate OpenAPI spec or placeholder
				setStage("generating");
				const outputDir = options.output || "./api-docs";
				await fs.mkdir(outputDir, { recursive: true });

				if (result.routes.length === 0) {
					// No routes found - create placeholder documentation if requested
					if (options.generateDocs) {
						await generatePlaceholderDocs(outputDir);
					}
					setError("No routes found in the repository. A placeholder documentation site has been created.");
					setStage("complete");
					return;
				}
				const generator = new OpenAPIFromCodeGenerator();
				const openApiSpec = generator.generate(result);

				// Save OpenAPI spec

				const format = options.format || "yaml";
				const specFileName = format === "yaml" ? "openapi.yaml" : "openapi.json";
				const specPath = path.join(outputDir, specFileName);

				const specContent =
					format === "yaml" ? yaml.stringify(openApiSpec) : JSON.stringify(openApiSpec, null, 2);

				await fs.writeFile(specPath, specContent);
				setOutputPath(specPath);

				// Stage 3: Generate Docusaurus docs (if requested)
				if (options.generateDocs) {
					const docGenerator = new DocusaurusGenerator(false);

					// Convert to ScanResult format for compatibility
					const scanResults = [
						{
							fileName: specFileName,
							filePath: specPath,
							valid: true,
							version: openApiSpec.openapi,
							title: openApiSpec.info.title,
							description: openApiSpec.info.description || "",
							endpointCount: result.routes.length,
							spec: openApiSpec,
						},
					];

					await docGenerator.generate(scanResults, outputDir);
				}

				setStage("complete");
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				setError(errorMessage);
				setStage("error");
			}
		};

		runScan();
	}, [repoPath, options]);

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold color="cyan">
				🤖 Code to Docusaurus
			</Text>
			<Text dimColor>Analyzing your codebase to extract API documentation...</Text>
			<Text> </Text>

			{stage === "scanning" && (
				<>
					<Box>
						<Text color="green">
							<Spinner type="dots" />
						</Text>
						<Text> Scanning: {currentFile || "Looking for route files..."}</Text>
					</Box>

					{progress.total > 0 && (
						<Box flexDirection="column" marginTop={1}>
							<Text>
								Progress: {progress.current}/{progress.total} files ({progress.percentage}%)
							</Text>
							<SimpleProgressBar percent={progress.percentage / 100} columns={50} />
						</Box>
					)}
				</>
			)}

			{stage === "generating" && (
				<Box>
					<Text color="green">
						<Spinner type="dots" />
					</Text>
					<Text> Generating OpenAPI specification...</Text>
				</Box>
			)}

			{stage === "complete" && scanResult && (
				<Box flexDirection="column">
					<Text color="green">✓ Scan complete!</Text>
					<Text> </Text>

					<Text bold>Found {scanResult.routes.length} API endpoints:</Text>
					<Text> </Text>

					<SimpleTable
						data={scanResult.routes.map(route => ({
							Method: route.method,
							Path: route.path,
							"Request Body": route.handler.requestBody ? "✓" : "-",
							"Query Params": route.handler.queryParams?.length || 0,
							Responses: route.handler.responses?.length || 0,
						}))}
					/>

					<Text> </Text>
					<Text color="green">✓ OpenAPI spec saved to: {outputPath}</Text>

					{options.generateDocs && (
						<Text color="green">✓ Docusaurus documentation generated in: {options.output}</Text>
					)}

					{parseErrors.length > 0 && (
						<>
							<Text> </Text>
							<Text color="yellow">⚠ Skipped {parseErrors.length} file(s) with parsing errors</Text>
							<Text dimColor> (These files had syntax issues but scan continued)</Text>
						</>
					)}

					<Text> </Text>
					<Text dimColor>💡 No code changes were made to your repository!</Text>
				</Box>
			)}

			{stage === "error" && (
				<Box flexDirection="column">
					<Text color="red">✗ Error: {error}</Text>
					<Text> </Text>
					<Text dimColor>Make sure your repository contains Express or Router route definitions like:</Text>
					<Text dimColor> router.get('/api/users', ...)</Text>
					<Text dimColor> app.post('/api/chat', ...)</Text>
				</Box>
			)}
		</Box>
	);
};

program
	.name("code2docusaurus")
	.description("Scan code to automatically extract API documentation and generate Docusaurus docs")
	.version("1.0.0")
	.argument("<repo-path>", "Path to repository")
	.option("-o, --output <path>", "Output directory", "./api-docs")
	.option("-f, --format <format>", "Output format (yaml|json)", "yaml")
	.option("--generate-docs", "Generate Docusaurus documentation")
	.action((repoPath, options) => {
		render(<Code2Docusaurus repoPath={repoPath} options={options} />);
	});

program.parse();
