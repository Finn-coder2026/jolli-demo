import { copyFile, ensureDir, exists, readFile, resolvePath, writeFile } from "./file";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_DIR = path.join(process.cwd(), "test-output", "file-utils");

describe("File Utilities", () => {
	beforeEach(async () => {
		// Clean up test directory before each test
		try {
			await fs.rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Directory might not exist
		}
	});

	afterEach(async () => {
		// Clean up test directory after each test
		try {
			await fs.rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Directory might not exist
		}
	});

	describe("ensureDir", () => {
		it("should create a directory if it does not exist", async () => {
			const dirPath = path.join(TEST_DIR, "new-dir");

			await ensureDir(dirPath);

			const stats = await fs.stat(dirPath);
			expect(stats.isDirectory()).toBe(true);
		});

		it("should create nested directories recursively", async () => {
			const dirPath = path.join(TEST_DIR, "level1", "level2", "level3");

			await ensureDir(dirPath);

			const stats = await fs.stat(dirPath);
			expect(stats.isDirectory()).toBe(true);
		});

		it("should not throw if directory already exists", async () => {
			const dirPath = path.join(TEST_DIR, "existing-dir");
			await fs.mkdir(dirPath, { recursive: true });

			await expect(ensureDir(dirPath)).resolves.not.toThrow();
		});
	});

	describe("writeFile", () => {
		it("should write content to a file", async () => {
			const filePath = path.join(TEST_DIR, "test.txt");
			const content = "Hello, World!";

			await writeFile(filePath, content);

			const readContent = await fs.readFile(filePath, "utf-8");
			expect(readContent).toBe(content);
		});

		it("should create parent directories if they do not exist", async () => {
			const filePath = path.join(TEST_DIR, "nested", "dir", "test.txt");
			const content = "Nested content";

			await writeFile(filePath, content);

			const readContent = await fs.readFile(filePath, "utf-8");
			expect(readContent).toBe(content);
		});

		it("should overwrite existing file", async () => {
			const filePath = path.join(TEST_DIR, "overwrite.txt");

			await writeFile(filePath, "Original content");
			await writeFile(filePath, "New content");

			const readContent = await fs.readFile(filePath, "utf-8");
			expect(readContent).toBe("New content");
		});
	});

	describe("readFile", () => {
		it("should read content from a file", async () => {
			const filePath = path.join(TEST_DIR, "read-test.txt");
			const content = "Content to read";
			await fs.mkdir(TEST_DIR, { recursive: true });
			await fs.writeFile(filePath, content, "utf-8");

			const readContent = await readFile(filePath);

			expect(readContent).toBe(content);
		});

		it("should throw error for non-existent file", async () => {
			const filePath = path.join(TEST_DIR, "non-existent.txt");

			await expect(readFile(filePath)).rejects.toThrow();
		});
	});

	describe("exists", () => {
		it("should return true for existing file", async () => {
			const filePath = path.join(TEST_DIR, "exists-test.txt");
			await fs.mkdir(TEST_DIR, { recursive: true });
			await fs.writeFile(filePath, "content", "utf-8");

			const result = await exists(filePath);

			expect(result).toBe(true);
		});

		it("should return true for existing directory", async () => {
			await fs.mkdir(TEST_DIR, { recursive: true });

			const result = await exists(TEST_DIR);

			expect(result).toBe(true);
		});

		it("should return false for non-existent path", async () => {
			const filePath = path.join(TEST_DIR, "non-existent.txt");

			const result = await exists(filePath);

			expect(result).toBe(false);
		});
	});

	describe("copyFile", () => {
		it("should copy a file to destination", async () => {
			const srcPath = path.join(TEST_DIR, "source.txt");
			const destPath = path.join(TEST_DIR, "destination.txt");
			const content = "Content to copy";

			await fs.mkdir(TEST_DIR, { recursive: true });
			await fs.writeFile(srcPath, content, "utf-8");

			await copyFile(srcPath, destPath);

			const copiedContent = await fs.readFile(destPath, "utf-8");
			expect(copiedContent).toBe(content);
		});

		it("should create parent directories for destination", async () => {
			const srcPath = path.join(TEST_DIR, "source.txt");
			const destPath = path.join(TEST_DIR, "nested", "destination.txt");
			const content = "Content to copy";

			await fs.mkdir(TEST_DIR, { recursive: true });
			await fs.writeFile(srcPath, content, "utf-8");

			await copyFile(srcPath, destPath);

			const copiedContent = await fs.readFile(destPath, "utf-8");
			expect(copiedContent).toBe(content);
		});
	});

	describe("resolvePath", () => {
		it("should resolve path relative to output directory", () => {
			const result = resolvePath("/output", "pages", "index.mdx");

			expect(result).toBe(path.join("/output", "pages", "index.mdx"));
		});

		it("should handle single segment", () => {
			const result = resolvePath("/output", "package.json");

			expect(result).toBe(path.join("/output", "package.json"));
		});

		it("should handle multiple segments", () => {
			const result = resolvePath("/base", "a", "b", "c", "file.txt");

			expect(result).toBe(path.join("/base", "a", "b", "c", "file.txt"));
		});
	});
});
