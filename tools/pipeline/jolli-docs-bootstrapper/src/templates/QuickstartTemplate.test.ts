import { describe, expect, it } from "vitest";
import { generateOverviewMdx, generateQuickstartMdx } from "./QuickstartTemplate.js";
import type { EndpointInfo } from "../types.js";

describe("QuickstartTemplate", () => {
	describe("generateOverviewMdx", () => {
		it("should generate overview with frontmatter", () => {
			const endpoints: Array<EndpointInfo> = [
				{
					operationId: "UsersService_get",
					filePath: "users.get.ts",
					method: "get",
					resource: "users",
					title: "Get Users",
				},
			];

			const result = generateOverviewMdx("test-api", endpoints);

			expect(result).toContain("---");
			expect(result).toContain("title: API Overview");
			// Note: Page-level covers are intentionally omitted.
			// Section-level covers will be inferred by the compiler.
			expect(result).not.toContain("covers:");
			expect(result).toContain("tags: [overview, api]");
		});

		it("should list all endpoints in summary section", () => {
			const endpoints: Array<EndpointInfo> = [
				{
					operationId: "Op1_get",
					filePath: "op1.get.ts",
					method: "get",
					resource: "op1",
					title: "Get Op1",
				},
				{
					operationId: "Op2_post",
					filePath: "op2.post.ts",
					method: "post",
					resource: "op2",
					title: "Post Op2",
				},
				{
					operationId: "Op3_delete",
					filePath: "op3.delete.ts",
					method: "delete",
					resource: "op3",
					title: "Delete Op3",
				},
			];

			const result = generateOverviewMdx("multi-api", endpoints);

			// Endpoints are listed in content (not in frontmatter covers)
			expect(result).toContain("**Get Op1**");
			expect(result).toContain("**Post Op2**");
			expect(result).toContain("**Delete Op3**");
			expect(result).toContain("GET /op1");
			expect(result).toContain("POST /op2");
			expect(result).toContain("DELETE /op3");
		});

		it("should handle empty endpoint list", () => {
			const result = generateOverviewMdx("empty-api", []);

			expect(result).toContain("title: API Overview");
			expect(result).toContain("# empty-api API Overview");
			expect(result).toContain("## API Architecture");
		});

		it("should include content sections", () => {
			const endpoints: Array<EndpointInfo> = [
				{
					operationId: "TestService_get",
					filePath: "test.get.ts",
					method: "get",
					resource: "test",
					title: "Get Test",
				},
			];

			const result = generateOverviewMdx("test", endpoints);

			expect(result).toContain("# test API Overview");
			expect(result).toContain("## API Architecture");
			expect(result).toContain("## Endpoints Summary");
		});
	});

	describe("generateQuickstartMdx", () => {
		it("should generate quickstart with frontmatter", () => {
			const endpoints: Array<EndpointInfo> = [];
			const result = generateQuickstartMdx("demo-api", endpoints);

			expect(result).toContain("---");
			expect(result).toContain("title: Quickstart Guide");
			expect(result).toContain("tags: [quickstart, getting-started]");
		});

		it("should include content sections", () => {
			const endpoints: Array<EndpointInfo> = [];
			const result = generateQuickstartMdx("api", endpoints);

			expect(result).toContain("# Quickstart Guide");
			expect(result).toContain("## Prerequisites");
			expect(result).toContain("## Authentication");
			expect(result).toContain("## Available Endpoints");
			expect(result).toContain("## Next Steps");
		});

		it("should use the source name in content", () => {
			const endpoints: Array<EndpointInfo> = [];
			const result = generateQuickstartMdx("custom-api", endpoints);

			expect(result).toContain("custom-api");
		});

		it("should include endpoints when provided", () => {
			const endpoints: Array<EndpointInfo> = [
				{
					operationId: "UsersService_get",
					filePath: "users.get.ts",
					method: "get",
					resource: "users",
					title: "Get Users",
				},
			];
			const result = generateQuickstartMdx("test", endpoints);

			expect(result).toContain("### Get Users");
			expect(result).toContain("GET /users");
		});
	});
});
