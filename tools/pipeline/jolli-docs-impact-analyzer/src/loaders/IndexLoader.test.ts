import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadReverseIndex } from "./IndexLoader.js";

describe("IndexLoader", () => {
	describe("loadReverseIndex", () => {
		let tempDir: string;
		let artifactsDir: string;

		beforeEach(() => {
			tempDir = mkdtempSync(join(tmpdir(), "index-loader-test-"));
			artifactsDir = tempDir;
		});

		afterEach(() => {
			rmSync(tempDir, { recursive: true, force: true });
		});

		it("should load reverse index from file", () => {
			const versionDir = join(artifactsDir, "test-api", "v1");
			mkdirSync(versionDir, { recursive: true });

			const index = {
				"openapi:UsersService_get": [
					"api/users/get::overview",
					"api/users/get::request",
				],
				"openapi:PostsService_post": ["api/posts/post::overview"],
			};

			writeFileSync(
				join(versionDir, "reverse_index.json"),
				JSON.stringify(index),
				"utf-8",
			);

			const result = loadReverseIndex(artifactsDir, "test-api", "v1");

			expect(result["openapi:UsersService_get"]).toHaveLength(2);
			expect(result["openapi:PostsService_post"]).toHaveLength(1);
		});

		it("should throw error if file does not exist", () => {
			expect(() => {
				loadReverseIndex(artifactsDir, "nonexistent", "v1");
			}).toThrow("not found");
		});

		it("should load empty index", () => {
			const versionDir = join(artifactsDir, "empty", "v1");
			mkdirSync(versionDir, { recursive: true });

			writeFileSync(
				join(versionDir, "reverse_index.json"),
				JSON.stringify({}),
				"utf-8",
			);

			const result = loadReverseIndex(artifactsDir, "empty", "v1");

			expect(Object.keys(result)).toHaveLength(0);
		});

		it("should handle different versions", () => {
			const v1Dir = join(artifactsDir, "api", "v1");
			const v2Dir = join(artifactsDir, "api", "v2");
			mkdirSync(v1Dir, { recursive: true });
			mkdirSync(v2Dir, { recursive: true });

			const indexV1 = { "openapi:Op1": ["doc1::sec1"] };
			const indexV2 = { "openapi:Op2": ["doc2::sec2"] };

			writeFileSync(
				join(v1Dir, "reverse_index.json"),
				JSON.stringify(indexV1),
				"utf-8",
			);
			writeFileSync(
				join(v2Dir, "reverse_index.json"),
				JSON.stringify(indexV2),
				"utf-8",
			);

			const resultV1 = loadReverseIndex(artifactsDir, "api", "v1");
			const resultV2 = loadReverseIndex(artifactsDir, "api", "v2");

			expect(resultV1["openapi:Op1"]).toBeDefined();
			expect(resultV2["openapi:Op2"]).toBeDefined();
			expect(resultV1["openapi:Op2"]).toBeUndefined();
		});
	});
});
