/**
 * Tests for SpecDetector module.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectExistingSpecs, readSpec } from "./SpecDetector.js";

describe("SpecDetector", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "spec-detector-test-"));
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	describe("detectExistingSpecs", () => {
		it("should return found=false when no specs exist", async () => {
			const result = await detectExistingSpecs(tempDir);
			expect(result.found).toBe(false);
			expect(result.specs).toHaveLength(0);
		});

		it("should detect openapi.json at root", async () => {
			const spec = {
				openapi: "3.0.3",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/users": { get: { operationId: "getUsers", responses: {} } },
					"/items": { get: { operationId: "getItems", responses: {} } },
				},
			};
			await fs.writeFile(path.join(tempDir, "openapi.json"), JSON.stringify(spec));

			const result = await detectExistingSpecs(tempDir);

			expect(result.found).toBe(true);
			expect(result.specs).toHaveLength(1);
			expect(result.specs[0].path).toBe("openapi.json");
			expect(result.specs[0].version).toBe("3.0.3");
			expect(result.specs[0].pathCount).toBe(2);
			expect(result.specs[0].title).toBe("Test API");
		});

		it("should detect swagger.yaml", async () => {
			const yamlContent = `
openapi: "3.0.0"
info:
  title: YAML API
  version: "2.0.0"
paths:
  /test:
    get:
      operationId: getTest
`;
			await fs.writeFile(path.join(tempDir, "swagger.yaml"), yamlContent);

			const result = await detectExistingSpecs(tempDir);

			expect(result.found).toBe(true);
			expect(result.specs[0].version).toBe("3.0.0");
			expect(result.specs[0].title).toBe("YAML API");
		});

		it("should detect Swagger 2.0 specs", async () => {
			const spec = {
				swagger: "2.0",
				info: { title: "Swagger 2 API", version: "1.0.0" },
				paths: { "/old": {} },
			};
			await fs.writeFile(path.join(tempDir, "swagger.json"), JSON.stringify(spec));

			const result = await detectExistingSpecs(tempDir);

			expect(result.found).toBe(true);
			expect(result.specs[0].version).toBe("2.0");
		});

		it("should sort specs by path count (most complete first)", async () => {
			const smallSpec = {
				openapi: "3.0.0",
				info: { title: "Small", version: "1.0.0" },
				paths: { "/one": {} },
			};
			const largeSpec = {
				openapi: "3.0.3",
				info: { title: "Large", version: "1.0.0" },
				paths: { "/a": {}, "/b": {}, "/c": {} },
			};

			await fs.writeFile(path.join(tempDir, "openapi.json"), JSON.stringify(smallSpec));
			await fs.writeFile(path.join(tempDir, "swagger.json"), JSON.stringify(largeSpec));

			const result = await detectExistingSpecs(tempDir);

			expect(result.specs[0].pathCount).toBe(3);
			expect(result.primary?.title).toBe("Large");
		});

		it("should detect specs in docs directory", async () => {
			await fs.mkdir(path.join(tempDir, "docs"), { recursive: true });
			const spec = {
				openapi: "3.0.3",
				info: { title: "Docs API", version: "1.0.0" },
				paths: { "/doc": {} },
			};
			await fs.writeFile(path.join(tempDir, "docs", "openapi.json"), JSON.stringify(spec));

			const result = await detectExistingSpecs(tempDir);

			expect(result.found).toBe(true);
			expect(result.specs[0].path).toContain("docs");
		});

		it("should ignore invalid JSON files", async () => {
			await fs.writeFile(path.join(tempDir, "openapi.json"), "not valid json");

			const result = await detectExistingSpecs(tempDir);

			expect(result.found).toBe(false);
		});

		it("should ignore non-OpenAPI JSON files", async () => {
			await fs.writeFile(path.join(tempDir, "openapi.json"), JSON.stringify({ name: "package" }));

			const result = await detectExistingSpecs(tempDir);

			expect(result.found).toBe(false);
		});
	});

	describe("readSpec", () => {
		it("should read and parse JSON spec", async () => {
			const spec = { openapi: "3.0.3", info: { title: "Test" }, paths: {} };
			const specPath = path.join(tempDir, "spec.json");
			await fs.writeFile(specPath, JSON.stringify(spec));

			const result = await readSpec(specPath);

			expect(result.openapi).toBe("3.0.3");
		});

		it("should read and parse YAML spec", async () => {
			const yaml = `
openapi: "3.0.3"
info:
  title: YAML Test
paths: {}
`;
			const specPath = path.join(tempDir, "spec.yaml");
			await fs.writeFile(specPath, yaml);

			const result = await readSpec(specPath);

			expect(result.openapi).toBe("3.0.3");
			expect((result.info as { title: string }).title).toBe("YAML Test");
		});
	});
});
