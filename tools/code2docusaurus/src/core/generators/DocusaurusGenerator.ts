import type { EndpointInfo, OpenAPISpec, ScanResult } from "../../types/Openapi";
import { GeneratorError } from "../../utils/Errors";
import { ensureDir, writeFile, writeJSON } from "../../utils/FileUtils";
import { MarkdownGenerator } from "./MarkdownGenerator";
import { EventEmitter } from "node:events";
import path from "node:path";
import { OpenAPIV3 } from "openapi-types";

export interface GeneratorProgress {
	current: number;
	total: number;
	percentage: number;
}

export interface GeneratorEvents {
	step: (message: string) => void;
	progress: (progress: GeneratorProgress) => void;
	fileGenerated: (filePath: string) => void;
	error: (error: Error) => void;
	complete: (outputPath: string) => void;
}

export declare interface DocusaurusGenerator {
	on<K extends keyof GeneratorEvents>(event: K, listener: GeneratorEvents[K]): this;
	emit<K extends keyof GeneratorEvents>(event: K, ...args: Parameters<GeneratorEvents[K]>): boolean;
}

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: This is a standard pattern for typed EventEmitter
export class DocusaurusGenerator extends EventEmitter {
	private markdownGen: MarkdownGenerator;
	private generatedFiles: Array<string> = [];

	constructor(aiEnabled = false) {
		super();
		this.markdownGen = new MarkdownGenerator(aiEnabled);
	}

	async generate(specs: Array<ScanResult>, outputPath: string): Promise<string> {
		this.generatedFiles = [];

		try {
			// Calculate total steps
			const totalSteps = 5 + specs.length * 2; // Base steps + (overview + endpoints) per spec
			let currentStep = 0;

			const updateProgress = () => {
				currentStep++;
				this.emit("progress", {
					current: currentStep,
					total: totalSteps,
					percentage: Math.round((currentStep / totalSteps) * 100),
				});
			};

			// Step 1: Create directory structure
			this.emit("step", "Creating directory structure");
			await this.createDirectoryStructure(outputPath);
			updateProgress();

			// Step 2: Generate intro page
			this.emit("step", "Generating introduction page");
			await this.generateIntroPage(specs, outputPath);
			updateProgress();

			// Step 3: Generate documentation for each spec
			for (const spec of specs) {
				if (!spec.valid) {
					continue;
				}

				this.emit("step", `Generating documentation for ${spec.title}`);
				await this.generateSpecDocs(spec, outputPath);
				updateProgress();

				// Generate endpoints
				this.emit("step", `Generating endpoint documentation for ${spec.title}`);
				await this.generateEndpoints(spec, outputPath);
				updateProgress();
			}

			// Step 4: Generate Docusaurus config
			this.emit("step", "Generating Docusaurus configuration");
			await this.generateDocusaurusConfig(specs, outputPath);
			updateProgress();

			// Step 5: Generate sidebar config
			this.emit("step", "Generating sidebar configuration");
			await this.generateSidebar(specs, outputPath);
			updateProgress();

			// Step 6: Generate package.json
			this.emit("step", "Generating package.json");
			await this.generatePackageJson(outputPath);
			updateProgress();

			this.emit("complete", outputPath);
			return outputPath;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			this.emit("error", new GeneratorError(`Generation failed: ${err.message}`));
			throw err;
		}
	}

	private async createDirectoryStructure(outputPath: string): Promise<void> {
		await ensureDir(outputPath);
		await ensureDir(path.join(outputPath, "docs"));
		await ensureDir(path.join(outputPath, "docs", "api"));
		await ensureDir(path.join(outputPath, "static"));
		await ensureDir(path.join(outputPath, "static", "img"));
		await ensureDir(path.join(outputPath, "src"));
		await ensureDir(path.join(outputPath, "src", "css"));
	}

	private async generateIntroPage(specs: Array<ScanResult>, outputPath: string): Promise<void> {
		const content = await this.markdownGen.generateIntro(specs);
		const filePath = path.join(outputPath, "docs", "intro.md");
		await writeFile(filePath, content);
		this.generatedFiles.push(filePath);
		this.emit("fileGenerated", filePath);
	}

	private async generateSpecDocs(spec: ScanResult, outputPath: string): Promise<void> {
		const specDir = path.join(outputPath, "docs", "api", this.slugify(spec.title));
		await ensureDir(specDir);

		// Generate overview
		const overview = await this.markdownGen.generateAPIOverview(spec);
		const overviewPath = path.join(specDir, "overview.md");
		await writeFile(overviewPath, overview);
		this.generatedFiles.push(overviewPath);
		this.emit("fileGenerated", overviewPath);
	}

	private async generateEndpoints(spec: ScanResult, outputPath: string): Promise<void> {
		const endpointsDir = path.join(outputPath, "docs", "api", this.slugify(spec.title), "endpoints");
		await ensureDir(endpointsDir);

		const endpoints = this.extractEndpoints(spec.spec);

		for (const endpoint of endpoints) {
			const content = await this.markdownGen.generateEndpoint(endpoint, spec.spec);
			const fileName = `${this.slugify(`${endpoint.method}-${endpoint.path}`)}.md`;
			const filePath = path.join(endpointsDir, fileName);
			await writeFile(filePath, content);
			this.generatedFiles.push(filePath);
			this.emit("fileGenerated", filePath);
		}
	}

	private extractEndpoints(spec: OpenAPISpec): Array<EndpointInfo> {
		const endpoints: Array<EndpointInfo> = [];

		if (!spec.paths) {
			return endpoints;
		}

		for (const [path, pathItem] of Object.entries(spec.paths)) {
			if (!pathItem || typeof pathItem !== "object") {
				continue;
			}

			const methods: Array<OpenAPIV3.HttpMethods> = [
				OpenAPIV3.HttpMethods.GET,
				OpenAPIV3.HttpMethods.POST,
				OpenAPIV3.HttpMethods.PUT,
				OpenAPIV3.HttpMethods.DELETE,
				OpenAPIV3.HttpMethods.PATCH,
				OpenAPIV3.HttpMethods.OPTIONS,
				OpenAPIV3.HttpMethods.HEAD,
			];

			for (const method of methods) {
				if (method in pathItem) {
					const operation = pathItem[method];
					if (operation) {
						endpoints.push({
							path,
							method,
							summary: operation.summary,
							description: operation.description,
							operationId: operation.operationId,
							tags: operation.tags,
							parameters: operation.parameters,
							requestBody: operation.requestBody,
							responses: operation.responses,
						});
					}
				}
			}
		}

		return endpoints;
	}

	private async generateDocusaurusConfig(_specs: Array<ScanResult>, outputPath: string): Promise<void> {
		const config = `// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'API Documentation',
  tagline: 'Auto-generated API documentation',
  url: 'https://your-site.com',
  baseUrl: '/',
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',

  organizationName: 'your-org',
  projectName: 'api-docs',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      '@docusaurus/preset-classic',
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
        items: [
          {
            type: 'doc',
            docId: 'intro',
            position: 'left',
            label: 'Documentation',
          },
        ],
      },
      footer: {
        style: 'dark',
        copyright: \`Copyright © \${new Date().getFullYear()} Your Organization.\`,
      },
      prism: {
        theme: require('prism-react-renderer').themes.github,
        darkTheme: require('prism-react-renderer').themes.dracula,
      },
    }),
};

module.exports = config;
`;

		const configPath = path.join(outputPath, "docusaurus.config.js");
		await writeFile(configPath, config);
		this.generatedFiles.push(configPath);
		this.emit("fileGenerated", configPath);
	}

	private async generateSidebar(specs: Array<ScanResult>, outputPath: string): Promise<void> {
		// Filter valid specs
		const validSpecs = specs.filter(spec => spec.valid);

		// If no valid specs, create a simple sidebar with just intro
		if (validSpecs.length === 0) {
			const sidebar: { docs: Array<string> } = {
				docs: ["intro"],
			};

			const sidebarContent = `/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = ${JSON.stringify(sidebar, null, 2)};

module.exports = sidebars;
`;

			const sidebarPath = path.join(outputPath, "sidebars.js");
			await writeFile(sidebarPath, sidebarContent);
			this.generatedFiles.push(sidebarPath);
			this.emit("fileGenerated", sidebarPath);
			return;
		}

		interface SidebarItem {
			type?: string;
			label?: string;
			items?: Array<SidebarItem | string>;
		}

		interface SidebarConfig {
			docs: Array<string | SidebarItem>;
		}

		const sidebar: SidebarConfig = {
			docs: [
				"intro",
				{
					type: "category",
					label: "APIs",
					items: validSpecs.map(spec => {
						const endpoints = this.extractEndpoints(spec.spec);
						return {
							type: "category",
							label: spec.title,
							items: [
								`api/${this.slugify(spec.title)}/overview`,
								{
									type: "category",
									label: "Endpoints",
									items: endpoints.map(ep => {
										const endpointSlug = this.slugify(`${ep.method}-${ep.path}`);
										return `api/${this.slugify(spec.title)}/endpoints/${endpointSlug}`;
									}),
								},
							],
						};
					}),
				},
			],
		};

		const sidebarContent = `/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = ${JSON.stringify(sidebar, null, 2)};

module.exports = sidebars;
`;

		const sidebarPath = path.join(outputPath, "sidebars.js");
		await writeFile(sidebarPath, sidebarContent);
		this.generatedFiles.push(sidebarPath);
		this.emit("fileGenerated", sidebarPath);
	}

	private async generatePackageJson(outputPath: string): Promise<void> {
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
			devDependencies: {
				"@docusaurus/module-type-aliases": "^3.0.0",
				"@docusaurus/types": "^3.0.0",
			},
			browserslist: {
				production: [">0.5%", "not dead", "not op_mini all"],
				development: ["last 1 chrome version", "last 1 firefox version", "last 1 safari version"],
			},
			engines: {
				node: ">=18.0",
			},
		};

		const packagePath = path.join(outputPath, "package.json");
		await writeJSON(packagePath, packageJson);
		this.generatedFiles.push(packagePath);
		this.emit("fileGenerated", packagePath);

		// Also create custom CSS
		const customCss = `/**
 * Custom CSS for API Documentation
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
  --docusaurus-highlighted-code-line-bg: rgba(0, 0, 0, 0.1);
}

[data-theme='dark'] {
  --ifm-color-primary: #25c2a0;
  --ifm-color-primary-dark: #21af90;
  --ifm-color-primary-darker: #1fa588;
  --ifm-color-primary-darkest: #1a8870;
  --ifm-color-primary-light: #29d5b0;
  --ifm-color-primary-lighter: #32d8b4;
  --ifm-color-primary-lightest: #4fddbf;
  --docusaurus-highlighted-code-line-bg: rgba(0, 0, 0, 0.3);
}
`;

		const cssPath = path.join(outputPath, "src", "css", "custom.css");
		await writeFile(cssPath, customCss);
		this.generatedFiles.push(cssPath);
		this.emit("fileGenerated", cssPath);

		// Create placeholder file in static/img to prevent webpack warning
		const gitkeep = `# Static Assets

Place your static files (images, PDFs, etc.) in this directory.
They will be copied to the root of the build output.

Example:
- static/img/logo.png -> website.com/img/logo.png
- static/my-file.pdf -> website.com/my-file.pdf
`;

		const gitkeepPath = path.join(outputPath, "static", "img", ".gitkeep");
		await writeFile(gitkeepPath, gitkeep);
		this.generatedFiles.push(gitkeepPath);
		this.emit("fileGenerated", gitkeepPath);

		// Also create a default favicon placeholder
		const faviconPlaceholder = `<!-- Favicon placeholder -->
<!-- Replace static/img/favicon.ico with your own favicon -->
`;

		const faviconPath = path.join(outputPath, "static", "img", "favicon.placeholder.txt");
		await writeFile(faviconPath, faviconPlaceholder);
		this.generatedFiles.push(faviconPath);
		this.emit("fileGenerated", faviconPath);
	}

	private slugify(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
	}

	getGeneratedFiles(): Array<string> {
		return this.generatedFiles;
	}

	removeAllListeners(): this {
		return super.removeAllListeners();
	}
}
