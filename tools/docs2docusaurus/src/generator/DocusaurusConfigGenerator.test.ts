import { type ConfigOptions, DocusaurusConfigGenerator } from "./DocusaurusConfigGenerator.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:fs
vi.mock("node:fs", () => ({
	mkdirSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

import { mkdirSync, writeFileSync } from "node:fs";

describe("DocusaurusConfigGenerator", () => {
	const defaultOptions: ConfigOptions = {
		title: "Test Documentation",
		url: "https://test.example.com",
		baseUrl: "/docs/",
		organizationName: "test-org",
		projectName: "test-project",
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("generate", () => {
		it("should generate all configuration files", () => {
			const generator = new DocusaurusConfigGenerator(defaultOptions);
			generator.generate("/output");

			// Should create directories
			expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining("src"), { recursive: true });
			expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining("static"), { recursive: true });

			// Should write files
			expect(writeFileSync).toHaveBeenCalledTimes(5); // config, package.json, css, .gitkeep, logo.svg
		});
	});

	describe("generateDocusaurusConfig", () => {
		it("should generate docusaurus.config.js with correct options", () => {
			const generator = new DocusaurusConfigGenerator(defaultOptions);
			generator.generate("/output");

			// Find the call that writes docusaurus.config.js
			const configCall = vi
				.mocked(writeFileSync)
				.mock.calls.find(call => (call[0] as string).includes("docusaurus.config.js"));

			expect(configCall).toBeDefined();
			const content = configCall?.[1] as string;

			expect(content).toContain("title: 'Test Documentation'");
			expect(content).toContain("url: 'https://test.example.com'");
			expect(content).toContain("baseUrl: '/docs/'");
			expect(content).toContain("organizationName: 'test-org'");
			expect(content).toContain("projectName: 'test-project'");
		});

		it("should include theme configuration", () => {
			const generator = new DocusaurusConfigGenerator(defaultOptions);
			generator.generate("/output");

			const configCall = vi
				.mocked(writeFileSync)
				.mock.calls.find(call => (call[0] as string).includes("docusaurus.config.js"));
			const content = configCall?.[1] as string;

			expect(content).toContain("themeConfig:");
			expect(content).toContain("navbar:");
			expect(content).toContain("footer:");
			expect(content).toContain("prism:");
		});

		it("should include i18n configuration", () => {
			const generator = new DocusaurusConfigGenerator(defaultOptions);
			generator.generate("/output");

			const configCall = vi
				.mocked(writeFileSync)
				.mock.calls.find(call => (call[0] as string).includes("docusaurus.config.js"));
			const content = configCall?.[1] as string;

			expect(content).toContain("i18n:");
			expect(content).toContain("defaultLocale: 'en'");
		});
	});

	describe("generatePackageJson", () => {
		it("should generate package.json with correct structure", () => {
			const generator = new DocusaurusConfigGenerator(defaultOptions);
			generator.generate("/output");

			const packageCall = vi
				.mocked(writeFileSync)
				.mock.calls.find(call => (call[0] as string).includes("package.json"));

			expect(packageCall).toBeDefined();
			const content = JSON.parse(packageCall?.[1] as string);

			expect(content.name).toBe("documentation-site");
			expect(content.private).toBe(true);
			expect(content.scripts).toBeDefined();
			expect(content.dependencies).toBeDefined();
			expect(content.devDependencies).toBeDefined();
		});

		it("should include all required scripts", () => {
			const generator = new DocusaurusConfigGenerator(defaultOptions);
			generator.generate("/output");

			const packageCall = vi
				.mocked(writeFileSync)
				.mock.calls.find(call => (call[0] as string).includes("package.json"));
			const content = JSON.parse(packageCall?.[1] as string);

			expect(content.scripts.start).toBe("docusaurus start");
			expect(content.scripts.build).toBe("docusaurus build");
			expect(content.scripts.serve).toBe("docusaurus serve");
			expect(content.scripts.deploy).toBe("docusaurus deploy");
		});

		it("should include Docusaurus dependencies", () => {
			const generator = new DocusaurusConfigGenerator(defaultOptions);
			generator.generate("/output");

			const packageCall = vi
				.mocked(writeFileSync)
				.mock.calls.find(call => (call[0] as string).includes("package.json"));
			const content = JSON.parse(packageCall?.[1] as string);

			expect(content.dependencies["@docusaurus/core"]).toBeDefined();
			expect(content.dependencies["@docusaurus/preset-classic"]).toBeDefined();
			expect(content.dependencies.react).toBeDefined();
			expect(content.dependencies["react-dom"]).toBeDefined();
		});
	});

	describe("generateCSS", () => {
		it("should generate custom.css file", () => {
			const generator = new DocusaurusConfigGenerator(defaultOptions);
			generator.generate("/output");

			const cssCall = vi
				.mocked(writeFileSync)
				.mock.calls.find(call => (call[0] as string).includes("custom.css"));

			expect(cssCall).toBeDefined();
			const content = cssCall?.[1] as string;

			expect(content).toContain(":root");
			expect(content).toContain("--ifm-color-primary");
		});

		it("should include dark theme styles", () => {
			const generator = new DocusaurusConfigGenerator(defaultOptions);
			generator.generate("/output");

			const cssCall = vi
				.mocked(writeFileSync)
				.mock.calls.find(call => (call[0] as string).includes("custom.css"));
			const content = cssCall?.[1] as string;

			expect(content).toContain("[data-theme='dark']");
		});

		it("should create css directory", () => {
			const generator = new DocusaurusConfigGenerator(defaultOptions);
			generator.generate("/output");

			expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining("css"), { recursive: true });
		});
	});

	describe("generateStaticAssets", () => {
		it("should create static/img directory", () => {
			const generator = new DocusaurusConfigGenerator(defaultOptions);
			generator.generate("/output");

			expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining("img"), { recursive: true });
		});

		it("should generate .gitkeep file", () => {
			const generator = new DocusaurusConfigGenerator(defaultOptions);
			generator.generate("/output");

			const gitkeepCall = vi
				.mocked(writeFileSync)
				.mock.calls.find(call => (call[0] as string).includes(".gitkeep"));

			expect(gitkeepCall).toBeDefined();
			const content = gitkeepCall?.[1] as string;

			expect(content).toContain("Static Assets");
			expect(content).toContain("logo.svg");
			expect(content).toContain("favicon.ico");
		});

		it("should generate logo.svg with title", () => {
			const generator = new DocusaurusConfigGenerator(defaultOptions);
			generator.generate("/output");

			const logoCall = vi.mocked(writeFileSync).mock.calls.find(call => (call[0] as string).includes("logo.svg"));

			expect(logoCall).toBeDefined();
			const content = logoCall?.[1] as string;

			expect(content).toContain("<svg");
			expect(content).toContain("Test Documentation");
		});
	});

	describe("with different options", () => {
		it("should handle special characters in title", () => {
			const options: ConfigOptions = {
				...defaultOptions,
				title: 'Test\'s "Documentation" & More',
			};
			const generator = new DocusaurusConfigGenerator(options);
			generator.generate("/output");

			const configCall = vi
				.mocked(writeFileSync)
				.mock.calls.find(call => (call[0] as string).includes("docusaurus.config.js"));
			const content = configCall?.[1] as string;

			expect(content).toContain('Test\'s "Documentation" & More');
		});

		it("should handle root baseUrl", () => {
			const options: ConfigOptions = {
				...defaultOptions,
				baseUrl: "/",
			};
			const generator = new DocusaurusConfigGenerator(options);
			generator.generate("/output");

			const configCall = vi
				.mocked(writeFileSync)
				.mock.calls.find(call => (call[0] as string).includes("docusaurus.config.js"));
			const content = configCall?.[1] as string;

			expect(content).toContain("baseUrl: '/'");
		});
	});
});
