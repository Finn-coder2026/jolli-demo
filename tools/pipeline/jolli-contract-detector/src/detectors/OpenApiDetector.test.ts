import { describe, expect, it, vi } from "vitest";
import { git } from "../GitDiff.js";
import * as OperationIdMapper from "../mappers/OperationIdMapper.js";
import { detectOpenApiContracts, isRouteFile } from "./OpenApiDetector.js";

describe("OpenApiDetector", () => {
	describe("isRouteFile", () => {
		it("should match files in routes directory", () => {
			expect(isRouteFile("src/routes/users.ts")).toBe(true);
			expect(isRouteFile("backend/routes/auth.js")).toBe(true);
		});

		it("should match files in api directory", () => {
			expect(isRouteFile("src/api/rate-limit.ts")).toBe(true);
			expect(isRouteFile("api/v1/users.js")).toBe(true);
		});

		it("should only match .ts and .js files", () => {
			expect(isRouteFile("src/routes/users.ts")).toBe(true);
			expect(isRouteFile("src/routes/users.js")).toBe(true);
			expect(isRouteFile("src/routes/README.md")).toBe(false);
			expect(isRouteFile("src/routes/config.json")).toBe(false);
		});

		it("should not match files outside routes or api directories", () => {
			expect(isRouteFile("src/utils/helper.ts")).toBe(false);
			expect(isRouteFile("src/components/Button.ts")).toBe(false);
		});

		it("should handle Windows path separators", () => {
			expect(isRouteFile("src\\routes\\users.ts")).toBe(true);
			expect(isRouteFile("src\\api\\auth.js")).toBe(true);
		});
	});

	describe("detectOpenApiContracts", () => {
		it("should throw error if repo option is missing", async () => {
			await expect(
				detectOpenApiContracts({
					detector: "openapi",
					base: "origin/main",
					output: "out.json",
					cwd: "/test",
				}),
			).rejects.toThrow("OpenAPI detector requires --repo option");
		});

		it("should detect changed route files and map to operationIds", async () => {
			vi.spyOn(git, "execFileAsync").mockResolvedValue({
				stdout: "src/routes/rate-limit.get.ts\nsrc/api/users.post.ts\nREADME.md\n",
				stderr: "",
			});

			vi.spyOn(OperationIdMapper, "loadOperationIdMapping").mockReturnValue({});
			vi.spyOn(OperationIdMapper, "getOperationId").mockImplementation((filePath: string) => {
				if (filePath === "src/routes/rate-limit.get.ts") return "RateLimitService_get";
				if (filePath === "src/api/users.post.ts") return "UsersService_post";
				return "UnknownService_handler";
			});

			const result = await detectOpenApiContracts({
				detector: "openapi",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
				repo: "/external/repo",
			});

			expect(result.source).toBe("openapi");
			expect(result.summary.changed).toEqual(["RateLimitService_get", "UsersService_post"]);
			expect(result.changed_contract_refs).toEqual([
				{ type: "openapi", key: "RateLimitService_get" },
				{ type: "openapi", key: "UsersService_post" },
			]);

			vi.restoreAllMocks();
		});

		it("should handle no route file changes", async () => {
			vi.spyOn(git, "execFileAsync").mockResolvedValue({
				stdout: "README.md\npackage.json\n",
				stderr: "",
			});
			vi.spyOn(OperationIdMapper, "loadOperationIdMapping").mockReturnValue({});

			const result = await detectOpenApiContracts({
				detector: "openapi",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
				repo: "/external/repo",
			});

			expect(result.changed_contract_refs).toEqual([]);
			expect(result.summary.changed).toEqual([]);

			vi.restoreAllMocks();
		});

		it("should use operationId mapping if provided", async () => {
			vi.spyOn(git, "execFileAsync").mockResolvedValue({
				stdout: "api/special.ts\n",
				stderr: "",
			});
			vi.spyOn(OperationIdMapper, "loadOperationIdMapping").mockReturnValue({
				"api/special.ts": "CustomMappedOperation",
			});
			vi.spyOn(OperationIdMapper, "getOperationId").mockReturnValue("CustomMappedOperation");

			const result = await detectOpenApiContracts({
				detector: "openapi",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
				repo: "/external/repo",
			});

			expect(result.summary.changed).toEqual(["CustomMappedOperation"]);

			vi.restoreAllMocks();
		});

		it("should deduplicate operationIds if multiple files map to same operation", async () => {
			vi.spyOn(git, "execFileAsync").mockResolvedValue({
				stdout: "api/users.get.ts\napi/users.handler.ts\n",
				stderr: "",
			});
			vi.spyOn(OperationIdMapper, "loadOperationIdMapping").mockReturnValue({});
			vi.spyOn(OperationIdMapper, "getOperationId").mockReturnValue("UsersService_handler");

			const result = await detectOpenApiContracts({
				detector: "openapi",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
				repo: "/external/repo",
			});

			// Should only have one entry even though two files changed
			expect(result.summary.changed).toEqual(["UsersService_handler"]);
			expect(result.changed_contract_refs.length).toBe(1);

			vi.restoreAllMocks();
		});
	});
});
