import { describe, expect, it } from "vitest";
import { generateApiReferenceDocs } from "./ApiReferenceGenerator.js";
import type { EndpointInfo } from "../types.js";

describe("ApiReferenceGenerator", () => {
	describe("generateApiReferenceDocs", () => {
		it("should generate docs for multiple endpoints", () => {
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

			const result = generateApiReferenceDocs(endpoints);

			expect(result).toHaveLength(2);
			expect(result[0].filePath).toBe("api/users/get.mdx");
			expect(result[0].content).toContain("title: Get Users");
			expect(result[0].content).toContain("openapi:UsersService_get");

			expect(result[1].filePath).toBe("api/posts/post.mdx");
			expect(result[1].content).toContain("title: Post Posts");
			expect(result[1].content).toContain("openapi:PostsService_post");
		});

		it("should handle empty endpoint list", () => {
			const result = generateApiReferenceDocs([]);

			expect(result).toHaveLength(0);
		});

		it("should handle endpoints with hyphens in resource name", () => {
			const endpoints: Array<EndpointInfo> = [
				{
					operationId: "RateLimitService_get",
					filePath: "rate-limit.get.ts",
					method: "get",
					resource: "rate-limit",
					title: "Get Rate Limit",
				},
			];

			const result = generateApiReferenceDocs(endpoints);

			expect(result).toHaveLength(1);
			expect(result[0].filePath).toBe("api/rate-limit/get.mdx");
		});
	});
});
