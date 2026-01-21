import { describe, expect, it } from "vitest";
import { generateOverviewDocs } from "./QuickstartGenerator.js";
import type { EndpointInfo } from "../types.js";

describe("QuickstartGenerator", () => {
	describe("generateOverviewDocs", () => {
		it("should generate overview and quickstart docs", () => {
			const endpoints: Array<EndpointInfo> = [
				{
					operationId: "UsersService_get",
					filePath: "users.get.ts",
					method: "get",
					resource: "users",
					title: "Get Users",
				},
				{
					operationId: "PostsService_post",
					filePath: "posts.post.ts",
					method: "post",
					resource: "posts",
					title: "Post Posts",
				},
			];

			const result = generateOverviewDocs("test-api", endpoints);

			expect(result).toHaveLength(2);

			// Check overview doc
			const overview = result.find(doc => doc.filePath === "overview.mdx");
			expect(overview).toBeDefined();
			expect(overview?.content).toContain("test-api");
			expect(overview?.content).toContain("API Overview");
			// Endpoints are listed by title/method (not operationId in frontmatter)
			expect(overview?.content).toContain("Get Users");
			expect(overview?.content).toContain("Post Posts");

			// Check quickstart doc
			const quickstart = result.find(doc => doc.filePath === "quickstart.mdx");
			expect(quickstart).toBeDefined();
			expect(quickstart?.content).toContain("Quickstart");
			expect(quickstart?.content).toContain("test-api");
		});

		it("should handle empty endpoint list", () => {
			const result = generateOverviewDocs("empty-api", []);

			expect(result).toHaveLength(2);
			expect(result[0].filePath).toBe("overview.mdx");
			expect(result[1].filePath).toBe("quickstart.mdx");
		});

		it("should include all endpoints in overview", () => {
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
					operationId: "Op3_put",
					filePath: "op3.put.ts",
					method: "put",
					resource: "op3",
					title: "Put Op3",
				},
			];

			const result = generateOverviewDocs("multi-api", endpoints);
			const overview = result.find(doc => doc.filePath === "overview.mdx");

			// Endpoints are listed by title/method (not operationId in frontmatter)
			expect(overview?.content).toContain("Get Op1");
			expect(overview?.content).toContain("Post Op2");
			expect(overview?.content).toContain("Put Op3");
			expect(overview?.content).toContain("GET /op1");
			expect(overview?.content).toContain("POST /op2");
			expect(overview?.content).toContain("PUT /op3");
		});
	});
});
