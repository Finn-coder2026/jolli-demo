import { SidebarGenerator } from "./SidebarGenerator.js";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("SidebarGenerator", () => {
	let testDir: string;
	let docsDir: string;
	let outputDir: string;

	beforeEach(() => {
		// Create temporary test directories
		testDir = join(tmpdir(), `test-sidebar-${Date.now()}`);
		docsDir = join(testDir, "docs");
		outputDir = join(testDir, "output");

		mkdirSync(docsDir, { recursive: true });
		mkdirSync(outputDir, { recursive: true });
	});

	afterEach(() => {
		// Clean up test directories
		rmSync(testDir, { recursive: true, force: true });
	});

	it("should generate sidebar with intro.md", async () => {
		// Create test structure
		writeFileSync(join(docsDir, "intro.md"), "# Introduction");
		writeFileSync(join(docsDir, "getting-started.md"), "# Getting Started");

		const generator = new SidebarGenerator();
		await generator.generate(docsDir, outputDir);

		// Check sidebar was created
		const sidebarPath = join(outputDir, "sidebars.js");
		const content = readFileSync(sidebarPath, "utf-8");

		expect(content).toContain('"intro"');
		expect(content).toContain('"getting-started"');
		expect(content).toContain("module.exports = sidebars");
	});

	it("should handle nested directories", async () => {
		// Create nested structure
		const apiDir = join(docsDir, "api");
		const endpointsDir = join(apiDir, "endpoints");

		mkdirSync(apiDir, { recursive: true });
		mkdirSync(endpointsDir, { recursive: true });

		writeFileSync(join(docsDir, "intro.md"), "# Intro");
		writeFileSync(join(apiDir, "overview.md"), "# API Overview");
		writeFileSync(join(endpointsDir, "users.md"), "# Users Endpoint");

		const generator = new SidebarGenerator();
		await generator.generate(docsDir, outputDir);

		const sidebarPath = join(outputDir, "sidebars.js");
		const content = readFileSync(sidebarPath, "utf-8");

		expect(content).toContain('"intro"');
		expect(content).toContain('"type": "category"');
		expect(content).toContain('"label": "API"');
		expect(content).toContain('"api/overview"');
		expect(content).toContain('"api/endpoints/users"');
	});

	it("should humanize directory names", async () => {
		// Create directories with various naming styles
		const userApiDir = join(docsDir, "user-api");
		const authSystemDir = join(docsDir, "auth_system");

		mkdirSync(userApiDir, { recursive: true });
		mkdirSync(authSystemDir, { recursive: true });

		writeFileSync(join(userApiDir, "index.md"), "# User API");
		writeFileSync(join(authSystemDir, "index.md"), "# Auth System");

		const generator = new SidebarGenerator();
		await generator.generate(docsDir, outputDir);

		const content = readFileSync(join(outputDir, "sidebars.js"), "utf-8");

		expect(content).toContain('"label": "User API"');
		expect(content).toContain('"label": "Auth System"');
	});

	it("should skip hidden files and directories", async () => {
		// Create hidden files/directories
		const hiddenDir = join(docsDir, ".hidden");
		mkdirSync(hiddenDir, { recursive: true });

		writeFileSync(join(docsDir, "visible.md"), "# Visible");
		writeFileSync(join(docsDir, ".hidden.md"), "# Hidden");
		writeFileSync(join(hiddenDir, "file.md"), "# Hidden File");

		const generator = new SidebarGenerator();
		await generator.generate(docsDir, outputDir);

		const content = readFileSync(join(outputDir, "sidebars.js"), "utf-8");

		expect(content).toContain('"visible"');
		expect(content).not.toContain('".hidden"');
		expect(content).not.toContain("hidden/file");
	});

	it("should generate sidebar with index.md when intro.md is missing", async () => {
		// Create test structure with index.md at root (no intro.md)
		writeFileSync(join(docsDir, "index.md"), "# Index Page");
		writeFileSync(join(docsDir, "getting-started.md"), "# Getting Started");

		const generator = new SidebarGenerator();
		await generator.generate(docsDir, outputDir);

		// Check sidebar was created
		const sidebarPath = join(outputDir, "sidebars.js");
		const content = readFileSync(sidebarPath, "utf-8");

		expect(content).toContain('"index"');
		expect(content).toContain('"getting-started"');
		expect(content).not.toContain('"intro"');
	});

	it("should handle .mdx files at root level", async () => {
		// Create test structure with .mdx files
		writeFileSync(join(docsDir, "intro.md"), "# Introduction");
		writeFileSync(join(docsDir, "advanced.mdx"), "# Advanced Guide with JSX");

		const generator = new SidebarGenerator();
		await generator.generate(docsDir, outputDir);

		const content = readFileSync(join(outputDir, "sidebars.js"), "utf-8");

		expect(content).toContain('"intro"');
		expect(content).toContain('"advanced"');
	});

	it("should handle .mdx files in subdirectories", async () => {
		// Create nested structure with .mdx files
		const apiDir = join(docsDir, "api");
		mkdirSync(apiDir, { recursive: true });

		writeFileSync(join(docsDir, "intro.md"), "# Intro");
		writeFileSync(join(apiDir, "overview.md"), "# API Overview");
		writeFileSync(join(apiDir, "components.mdx"), "# Components with JSX");

		const generator = new SidebarGenerator();
		await generator.generate(docsDir, outputDir);

		const content = readFileSync(join(outputDir, "sidebars.js"), "utf-8");

		expect(content).toContain('"intro"');
		expect(content).toContain('"api/overview"');
		expect(content).toContain('"api/components"');
	});
});
