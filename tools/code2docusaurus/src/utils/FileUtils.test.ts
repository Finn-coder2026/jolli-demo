import { copyDirectory, ensureDir, fileExists, readFile, readJSON, writeFile, writeJSON } from "./FileUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fs-extra as a whole module
vi.mock("fs-extra", () => ({
	default: {
		ensureDir: vi.fn(),
		writeJSON: vi.fn(),
		readJSON: vi.fn(),
		access: vi.fn(),
		copy: vi.fn(),
		writeFile: vi.fn(),
		readFile: vi.fn(),
	},
}));

import fs from "fs-extra";

describe("File Utils", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("ensureDir", () => {
		it("should create directory if it doesn't exist", async () => {
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined);

			await ensureDir("/test/dir");

			expect(fs.ensureDir).toHaveBeenCalledWith("/test/dir");
		});

		it("should handle errors", async () => {
			vi.mocked(fs.ensureDir).mockRejectedValue(new Error("Permission denied"));

			await expect(ensureDir("/test/dir")).rejects.toThrow("Permission denied");
		});
	});

	describe("writeJSON", () => {
		it("should write JSON file with proper formatting", async () => {
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
			vi.mocked(fs.writeJSON).mockResolvedValue(undefined);

			const data = { key: "value" };
			await writeJSON("/test/file.json", data);

			expect(fs.ensureDir).toHaveBeenCalledWith("/test");
			expect(fs.writeJSON).toHaveBeenCalledWith("/test/file.json", data, { spaces: 2 });
		});

		it("should create parent directory", async () => {
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
			vi.mocked(fs.writeJSON).mockResolvedValue(undefined);

			await writeJSON("/test/nested/file.json", {});

			expect(fs.ensureDir).toHaveBeenCalledWith("/test/nested");
		});
	});

	describe("readJSON", () => {
		it("should read and parse JSON file", async () => {
			const mockData = { key: "value" };
			vi.mocked(fs.readJSON).mockResolvedValue(mockData);

			const result = await readJSON("/test/file.json");

			expect(result).toEqual(mockData);
			expect(fs.readJSON).toHaveBeenCalledWith("/test/file.json");
		});

		it("should handle errors", async () => {
			vi.mocked(fs.readJSON).mockRejectedValue(new Error("File not found"));

			await expect(readJSON("/test/file.json")).rejects.toThrow("File not found");
		});
	});

	describe("fileExists", () => {
		it("should return true when file exists", async () => {
			vi.mocked(fs.access).mockResolvedValue(undefined);

			const result = await fileExists("/test/file.txt");

			expect(result).toBe(true);
		});

		it("should return false when file doesn't exist", async () => {
			vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

			const result = await fileExists("/test/file.txt");

			expect(result).toBe(false);
		});
	});

	describe("copyDirectory", () => {
		it("should copy directory recursively", async () => {
			vi.mocked(fs.copy).mockResolvedValue(undefined);

			await copyDirectory("/source", "/dest");

			expect(fs.copy).toHaveBeenCalledWith("/source", "/dest");
		});

		it("should handle errors", async () => {
			vi.mocked(fs.copy).mockRejectedValue(new Error("Permission denied"));

			await expect(copyDirectory("/source", "/dest")).rejects.toThrow("Permission denied");
		});
	});

	describe("writeFile", () => {
		it("should write file with UTF-8 encoding", async () => {
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
			vi.mocked(fs.writeFile).mockResolvedValue(undefined);

			await writeFile("/test/file.txt", "content");

			expect(fs.ensureDir).toHaveBeenCalledWith("/test");
			expect(fs.writeFile).toHaveBeenCalledWith("/test/file.txt", "content", "utf-8");
		});

		it("should create parent directory", async () => {
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
			vi.mocked(fs.writeFile).mockResolvedValue(undefined);

			await writeFile("/test/nested/dir/file.txt", "content");

			expect(fs.ensureDir).toHaveBeenCalledWith("/test/nested/dir");
		});
	});

	describe("readFile", () => {
		it("should read file with UTF-8 encoding", async () => {
			vi.mocked(fs.readFile).mockResolvedValue("file content" as never);

			const result = await readFile("/test/file.txt");

			expect(result).toBe("file content");
			expect(fs.readFile).toHaveBeenCalledWith("/test/file.txt", "utf-8");
		});

		it("should handle errors", async () => {
			vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"));

			await expect(readFile("/test/file.txt")).rejects.toThrow("File not found");
		});
	});
});
