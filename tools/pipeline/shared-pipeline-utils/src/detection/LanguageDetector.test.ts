/**
 * Tests for LanguageDetector module.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectLanguage, isJavaScriptFamily, isSupportedLanguage } from "./LanguageDetector.js";

describe("LanguageDetector", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lang-detector-test-"));
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	describe("detectLanguage", () => {
		it("should return unknown for empty directory", async () => {
			const result = await detectLanguage(tempDir);

			expect(result.primary).toBe("unknown");
			expect(result.all).toHaveLength(0);
			expect(result.confidence).toBe(0.0);
		});

		it("should detect JavaScript from package.json", async () => {
			await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "test" }));

			const result = await detectLanguage(tempDir);

			expect(result.primary).toBe("javascript");
			expect(result.isTypeScript).toBe(false);
		});

		it("should detect TypeScript from tsconfig.json", async () => {
			await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "test" }));
			await fs.writeFile(path.join(tempDir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }));

			const result = await detectLanguage(tempDir);

			expect(result.primary).toBe("typescript");
			expect(result.isTypeScript).toBe(true);
			expect(result.confidence).toBe(0.9);
		});

		it("should detect TypeScript from dependencies", async () => {
			const pkg = {
				name: "test",
				devDependencies: {
					typescript: "^5.0.0",
				},
			};
			await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify(pkg));

			const result = await detectLanguage(tempDir);

			expect(result.primary).toBe("typescript");
			expect(result.isTypeScript).toBe(true);
		});

		it("should detect TypeScript from @types packages", async () => {
			const pkg = {
				name: "test",
				devDependencies: {
					"@types/node": "^20.0.0",
				},
			};
			await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify(pkg));

			const result = await detectLanguage(tempDir);

			expect(result.primary).toBe("typescript");
		});

		it("should detect Python from requirements.txt", async () => {
			await fs.writeFile(path.join(tempDir, "requirements.txt"), "fastapi==0.100.0");

			const result = await detectLanguage(tempDir);

			expect(result.primary).toBe("python");
			expect(result.confidence).toBe(0.7);
		});

		it("should detect Go from go.mod", async () => {
			await fs.writeFile(path.join(tempDir, "go.mod"), "module example.com/test");

			const result = await detectLanguage(tempDir);

			expect(result.primary).toBe("go");
		});

		it("should detect Java from pom.xml", async () => {
			await fs.writeFile(path.join(tempDir, "pom.xml"), "<project></project>");

			const result = await detectLanguage(tempDir);

			expect(result.primary).toBe("java");
		});

		it("should detect Ruby from Gemfile", async () => {
			await fs.writeFile(path.join(tempDir, "Gemfile"), "source 'https://rubygems.org'");

			const result = await detectLanguage(tempDir);

			expect(result.primary).toBe("ruby");
		});

		it("should detect Rust from Cargo.toml", async () => {
			await fs.writeFile(path.join(tempDir, "Cargo.toml"), "[package]\nname = 'test'");

			const result = await detectLanguage(tempDir);

			expect(result.primary).toBe("rust");
		});

		it("should detect PHP from composer.json", async () => {
			await fs.writeFile(path.join(tempDir, "composer.json"), JSON.stringify({ name: "test/pkg" }));

			const result = await detectLanguage(tempDir);

			expect(result.primary).toBe("php");
		});

		it("should detect C# from .csproj file", async () => {
			await fs.writeFile(
				path.join(tempDir, "MyProject.csproj"),
				'<Project Sdk="Microsoft.NET.Sdk.Web"></Project>',
			);

			const result = await detectLanguage(tempDir);

			expect(result.primary).toBe("csharp");
			expect(result.confidence).toBe(0.7);
		});

		it("should detect C# from .sln file", async () => {
			await fs.writeFile(path.join(tempDir, "MySolution.sln"), "Microsoft Visual Studio Solution File");

			const result = await detectLanguage(tempDir);

			expect(result.primary).toBe("csharp");
		});

		it("should handle multiple languages", async () => {
			await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "test" }));
			await fs.writeFile(path.join(tempDir, "requirements.txt"), "flask");

			const result = await detectLanguage(tempDir);

			expect(result.all.length).toBeGreaterThan(1);
		});
	});

	describe("isJavaScriptFamily", () => {
		it("should return true for javascript", () => {
			expect(isJavaScriptFamily("javascript")).toBe(true);
		});

		it("should return true for typescript", () => {
			expect(isJavaScriptFamily("typescript")).toBe(true);
		});

		it("should return false for python", () => {
			expect(isJavaScriptFamily("python")).toBe(false);
		});
	});

	describe("isSupportedLanguage", () => {
		it("should return true for javascript", () => {
			expect(isSupportedLanguage("javascript")).toBe(true);
		});

		it("should return true for python", () => {
			expect(isSupportedLanguage("python")).toBe(true);
		});

		it("should return true for csharp", () => {
			expect(isSupportedLanguage("csharp")).toBe(true);
		});

		it("should return false for unknown languages", () => {
			expect(isSupportedLanguage("cobol")).toBe(false);
		});
	});
});
