import type { OpenApiSpec } from "../types";
import {
	extractApiInfo,
	generateApiOverviewPage,
	generateOpenApiMeta,
	generateOpenApiPage,
	loadOpenApiSpec,
} from "./openapi";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_DIR = path.join(process.cwd(), "test-output", "openapi");

describe("OpenAPI Utilities", () => {
	beforeEach(async () => {
		try {
			await fs.rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Directory might not exist
		}
		await fs.mkdir(TEST_DIR, { recursive: true });
	});

	afterEach(async () => {
		try {
			await fs.rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Directory might not exist
		}
	});

	describe("loadOpenApiSpec", () => {
		it("should load JSON OpenAPI spec", async () => {
			const specPath = path.join(TEST_DIR, "openapi.json");
			const spec = {
				openapi: "3.0.0",
				info: { title: "Test API", version: "1.0.0" },
				paths: {},
			};
			await fs.writeFile(specPath, JSON.stringify(spec), "utf-8");

			const result = await loadOpenApiSpec(specPath);

			expect(result).toEqual(spec);
		});

		it("should throw for YAML files (not yet supported)", async () => {
			const specPath = path.join(TEST_DIR, "openapi.yaml");
			await fs.writeFile(specPath, "openapi: 3.0.0", "utf-8");

			await expect(loadOpenApiSpec(specPath)).rejects.toThrow("YAML OpenAPI specs are not yet supported");
		});

		it("should throw for unsupported formats", async () => {
			const specPath = path.join(TEST_DIR, "openapi.txt");
			await fs.writeFile(specPath, "some content", "utf-8");

			await expect(loadOpenApiSpec(specPath)).rejects.toThrow("Unsupported OpenAPI spec format");
		});

		it("should throw for non-existent file", async () => {
			await expect(loadOpenApiSpec("/non/existent.json")).rejects.toThrow();
		});
	});

	describe("extractApiInfo", () => {
		it("should extract basic info from spec", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.0",
				info: {
					title: "My API",
					version: "2.0.0",
					description: "A test API",
				},
				paths: {},
			};

			const info = extractApiInfo(spec);

			expect(info.title).toBe("My API");
			expect(info.version).toBe("2.0.0");
			expect(info.description).toBe("A test API");
		});

		it("should extract endpoints from paths", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.0",
				info: { title: "API" },
				paths: {
					"/users": {
						get: { summary: "List users" },
						post: { summary: "Create user" },
					},
					"/users/{id}": {
						get: { summary: "Get user" },
						put: { summary: "Update user" },
						delete: { summary: "Delete user" },
					},
				},
			};

			const info = extractApiInfo(spec);

			expect(info.endpoints).toHaveLength(5);
			expect(info.endpoints).toContainEqual({ method: "GET", path: "/users", summary: "List users" });
			expect(info.endpoints).toContainEqual({ method: "POST", path: "/users", summary: "Create user" });
			expect(info.endpoints).toContainEqual({ method: "DELETE", path: "/users/{id}", summary: "Delete user" });
		});

		it("should handle missing info", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.0",
				paths: {},
			};

			const info = extractApiInfo(spec);

			expect(info.title).toBe("API Reference");
			expect(info.version).toBe("1.0.0");
			expect(info.description).toBeUndefined();
		});

		it("should handle PATCH method", () => {
			const spec: OpenApiSpec = {
				paths: {
					"/resource": {
						patch: { summary: "Partial update" },
					},
				},
			};

			const info = extractApiInfo(spec);

			expect(info.endpoints).toContainEqual({ method: "PATCH", path: "/resource", summary: "Partial update" });
		});

		it("should handle endpoints without summary", () => {
			const spec: OpenApiSpec = {
				paths: {
					"/simple": {
						get: {},
					},
				},
			};

			const info = extractApiInfo(spec);

			expect(info.endpoints[0].summary).toBeUndefined();
		});
	});

	describe("generateOpenApiPage", () => {
		it("should generate page for app router", () => {
			const result = generateOpenApiPage("app", "api-reference/interactive", "API Docs");

			expect(result.path).toBe("content/api-reference/interactive.mdx");
			expect(result.content).toContain("# API Docs");
			expect(result.content).toContain("ApiReference");
			expect(result.content).toContain("import ApiReference");
		});

		it("should generate page for page router", () => {
			const result = generateOpenApiPage("page", "api/interactive", "Interactive API");

			expect(result.path).toBe("pages/api/interactive.mdx");
			expect(result.content).toContain("# Interactive API");
			expect(result.content).toContain("ApiReference");
		});

		it("should use default title if not provided", () => {
			const result = generateOpenApiPage("app", "api");

			expect(result.content).toContain("# Interactive API Documentation");
		});

		it("should calculate correct relative import path", () => {
			// Deeply nested path
			const result = generateOpenApiPage("app", "docs/api/v2/endpoints");

			expect(result.content).toContain("../../../../");
		});
	});

	describe("generateOpenApiMeta", () => {
		it("should generate TypeScript meta for app router", () => {
			const result = generateOpenApiMeta("app", "api-reference", {
				index: "Overview",
				interactive: "Try It",
			});

			expect(result.path).toBe("content/api-reference/_meta.ts");
			expect(result.content).toContain("export default");
			expect(result.content).toContain("'index': 'Overview'");
			expect(result.content).toContain("'interactive': 'Try It'");
		});

		it("should generate JSON meta for page router", () => {
			const result = generateOpenApiMeta("page", "api-reference", {
				index: "Overview",
				interactive: "Try It",
			});

			expect(result.path).toBe("pages/api-reference/_meta.json");

			const parsed = JSON.parse(result.content);
			expect(parsed.index).toBe("Overview");
			expect(parsed.interactive).toBe("Try It");
		});
	});

	describe("generateApiOverviewPage", () => {
		it("should generate overview page for app router", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.0",
				info: {
					title: "My API",
					version: "1.0.0",
					description: "API description",
				},
				paths: {
					"/users": {
						get: { summary: "List users" },
					},
				},
			};

			const result = generateApiOverviewPage("app", spec, "api-reference");

			expect(result.path).toBe("content/api-reference/index.mdx");
			expect(result.content).toContain("# My API");
			expect(result.content).toContain("API description");
			expect(result.content).toContain("**Version:** 1.0.0");
			expect(result.content).toContain("| GET | `/users` | List users |");
			expect(result.content).toContain("[Interactive API](/api-reference/interactive)");
		});

		it("should generate overview page for page router", () => {
			const spec: OpenApiSpec = {
				info: { title: "Test" },
				paths: {},
			};

			const result = generateApiOverviewPage("page", spec, "docs/api");

			expect(result.path).toBe("pages/docs/api/index.mdx");
		});

		it("should handle missing description", () => {
			const spec: OpenApiSpec = {
				info: { title: "API" },
				paths: {},
			};

			const result = generateApiOverviewPage("app", spec);

			expect(result.content).toContain("API documentation.");
		});

		it("should use default page path", () => {
			const spec: OpenApiSpec = { paths: {} };

			const result = generateApiOverviewPage("app", spec);

			expect(result.path).toBe("content/api-reference/index.mdx");
			expect(result.content).toContain("/api-reference/interactive");
		});

		it("should handle endpoints without summary", () => {
			const spec: OpenApiSpec = {
				paths: {
					"/health": {
						get: {},
					},
				},
			};

			const result = generateApiOverviewPage("app", spec);

			expect(result.content).toContain("| GET | `/health` | - |");
		});
	});
});
