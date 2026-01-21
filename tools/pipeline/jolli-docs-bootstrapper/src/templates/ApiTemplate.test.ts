import { describe, expect, it } from "vitest";
import { generateApiReferenceMdx } from "./ApiTemplate.js";
import type { EndpointInfo } from "../types.js";

describe("ApiTemplate", () => {
	describe("generateApiReferenceMdx", () => {
		it("should generate complete MDX with frontmatter", () => {
			const endpoint: EndpointInfo = {
				operationId: "RateLimitService_get",
				filePath: "rate-limit.get.ts",
				method: "get",
				resource: "rate-limit",
				title: "Get Rate Limit",
			};

			const result = generateApiReferenceMdx(endpoint);

			// Should include frontmatter
			expect(result).toContain("---");
			expect(result).toContain("title: Get Rate Limit");
			expect(result).toContain("covers:");
			expect(result).toContain("- openapi:RateLimitService_get");
			expect(result).toContain("tags: [api, get, rate-limit]");

			// Should include content sections
			expect(result).toContain("# Get Rate Limit");
			expect(result).toContain("## Overview");
			expect(result).toContain("## Request");
			expect(result).toContain("## Response");
			expect(result).toContain("## Examples");

			// Should include operation ID
			expect(result).toContain("`RateLimitService_get`");

			// Should include HTTP method
			expect(result).toContain("GET /rate-limit");
		});

		it("should handle POST methods", () => {
			const endpoint: EndpointInfo = {
				operationId: "UsersService_post",
				filePath: "users.post.ts",
				method: "post",
				resource: "users",
				title: "Post Users",
			};

			const result = generateApiReferenceMdx(endpoint);

			expect(result).toContain("POST /users");
			expect(result).toContain("tags: [api, post, users]");
		});

		it("should escape special characters in title", () => {
			const endpoint: EndpointInfo = {
				operationId: "Test_Op",
				filePath: "test.ts",
				method: "get",
				resource: "test",
				title: "Get Test",
			};

			const result = generateApiReferenceMdx(endpoint);

			expect(result).toContain("title: Get Test");
		});
	});
});
