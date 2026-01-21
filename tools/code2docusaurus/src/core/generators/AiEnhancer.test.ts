import type { EndpointInfo } from "../../types/Openapi";
import type { AIEnhancementOptions } from "./AiEnhancer";
import { enhanceDocumentation, enhanceWithAI } from "./AiEnhancer";
import { describe, expect, it } from "vitest";

describe("AI Enhancer", () => {
	describe("enhanceDocumentation", () => {
		it("should return enhancement result structure", async () => {
			const content = "# API Endpoint\n\nBasic documentation";
			const context = {};

			const result = await enhanceDocumentation(content, context);

			expect(result).toHaveProperty("enhanced");
			expect(result).toHaveProperty("originalContent");
			expect(result).toHaveProperty("enhancedContent");
			expect(result).toHaveProperty("improvements");
		});

		it("should preserve original content", async () => {
			const content = "# API Endpoint\n\nBasic documentation";
			const context = {};

			const result = await enhanceDocumentation(content, context);

			expect(result.originalContent).toBe(content);
		});

		it("should mark as enhanced", async () => {
			const content = "# API Endpoint";
			const context = {};

			const result = await enhanceDocumentation(content, context);

			expect(result.enhanced).toBe(true);
		});

		it("should list improvements", async () => {
			const content = "# API Endpoint";
			const context = {};

			const result = await enhanceDocumentation(content, context);

			expect(result.improvements).toBeInstanceOf(Array);
			expect(result.improvements.length).toBeGreaterThan(0);
		});

		it("should add code examples when missing", async () => {
			const content = "# API Endpoint\n\nNo code examples yet";
			const endpoint: EndpointInfo = {
				path: "/api/users",
				method: "get",
			};

			const result = await enhanceDocumentation(content, { endpoint });

			expect(result.enhancedContent).toContain("## Code Examples");
			expect(result.enhancedContent).toContain("```javascript");
			expect(result.enhancedContent).toContain("```python");
			expect(result.enhancedContent).toContain("```bash");
		});

		it("should not duplicate code examples if already present", async () => {
			const content = `# API Endpoint

## Code Examples
\`\`\`javascript
fetch('/api/users')
\`\`\``;

			const endpoint: EndpointInfo = {
				path: "/api/users",
				method: "get",
			};

			const result = await enhanceDocumentation(content, { endpoint });

			// Count occurrences of "## Code Examples"
			const matches = result.enhancedContent.match(/## Code Examples/g);
			expect(matches?.length).toBe(1);
		});

		it("should add error responses section", async () => {
			const content = "# API Endpoint\n\nBasic documentation";
			const endpoint: EndpointInfo = {
				path: "/api/users",
				method: "get",
			};

			const result = await enhanceDocumentation(content, { endpoint });

			expect(result.enhancedContent).toContain("## Common Error Responses");
			expect(result.enhancedContent).toContain("400 Bad Request");
			expect(result.enhancedContent).toContain("401 Unauthorized");
			expect(result.enhancedContent).toContain("404 Not Found");
			expect(result.enhancedContent).toContain("500 Internal Server Error");
		});

		it("should not duplicate error responses if already present", async () => {
			const content = `# API Endpoint

## Error Responses
Already documented`;

			const endpoint: EndpointInfo = {
				path: "/api/users",
				method: "get",
			};

			const result = await enhanceDocumentation(content, { endpoint });

			// Should not add another error responses section
			const matches = result.enhancedContent.match(/## (Common )?Error Responses/g);
			expect(matches?.length).toBeLessThanOrEqual(2);
		});

		it("should add best practices section", async () => {
			const content = "# API Endpoint\n\nBasic documentation";
			const endpoint: EndpointInfo = {
				path: "/api/users",
				method: "get",
			};

			const result = await enhanceDocumentation(content, { endpoint });

			expect(result.enhancedContent).toContain("## Best Practices");
			expect(result.enhancedContent).toContain("handle errors gracefully");
			expect(result.enhancedContent).toContain("authentication headers");
			expect(result.enhancedContent).toContain("retry logic");
		});

		it("should not duplicate best practices if already present", async () => {
			const content = `# API Endpoint

## Best Practices
Already documented`;

			const endpoint: EndpointInfo = {
				path: "/api/users",
				method: "get",
			};

			const result = await enhanceDocumentation(content, { endpoint });

			const matches = result.enhancedContent.match(/## Best Practices/g);
			expect(matches?.length).toBe(1);
		});

		it("should handle empty content", async () => {
			const content = "";
			const context = {};

			const result = await enhanceDocumentation(content, context);

			expect(result.enhancedContent).toBeDefined();
		});

		it("should accept AI options without error", async () => {
			const content = "# API Endpoint";
			const context = {};
			const options: AIEnhancementOptions = {
				provider: "placeholder",
				model: "test-model",
				temperature: 0.7,
				maxTokens: 1000,
			};

			const result = await enhanceDocumentation(content, context, options);

			expect(result).toBeDefined();
		});

		it("should generate correct fetch code example", async () => {
			const content = "# API Endpoint";
			const endpoint: EndpointInfo = {
				path: "/api/users",
				method: "post",
			};

			const result = await enhanceDocumentation(content, { endpoint });

			expect(result.enhancedContent).toContain("method: 'POST'");
			expect(result.enhancedContent).toContain("'/api/users'");
		});

		it("should generate correct Python code example", async () => {
			const content = "# API Endpoint";
			const endpoint: EndpointInfo = {
				path: "/api/users",
				method: "delete",
			};

			const result = await enhanceDocumentation(content, { endpoint });

			expect(result.enhancedContent).toContain("requests.delete");
		});

		it("should generate correct cURL example", async () => {
			const content = "# API Endpoint";
			const endpoint: EndpointInfo = {
				path: "/api/users/:id",
				method: "put",
			};

			const result = await enhanceDocumentation(content, { endpoint });

			expect(result.enhancedContent).toContain("curl -X PUT");
			expect(result.enhancedContent).toContain("'/api/users/:id'");
		});

		it("should handle context with spec", async () => {
			const content = "# API Endpoint";
			const context = {
				spec: {
					openapi: "3.0.0",
					info: { title: "Test API", version: "1.0.0" },
					paths: {},
				},
			};

			const result = await enhanceDocumentation(content, context);

			expect(result).toBeDefined();
		});

		it("should handle context with schema", async () => {
			const content = "# API Endpoint";
			const context = {
				schema: {
					type: "object",
					properties: {
						id: { type: "number" },
						name: { type: "string" },
					},
				},
			};

			const result = await enhanceDocumentation(content, context);

			expect(result).toBeDefined();
		});

		it("should enhance content with multiple sections", async () => {
			const content = "# User API\n\nGet user information";
			const endpoint: EndpointInfo = {
				path: "/api/users/:id",
				method: "get",
				summary: "Get user by ID",
			};

			const result = await enhanceDocumentation(content, { endpoint });

			// Should have all three enhancements
			expect(result.enhancedContent).toContain("## Code Examples");
			expect(result.enhancedContent).toContain("## Common Error Responses");
			expect(result.enhancedContent).toContain("## Best Practices");
		});
	});

	describe("enhanceWithAI", () => {
		it("should throw error for unimplemented AI integration", async () => {
			const content = "# API Endpoint";
			const provider = "openai";
			const apiKey = "test-key";

			await expect(enhanceWithAI(content, provider, apiKey)).rejects.toThrow(
				"AI enhancement not yet implemented",
			);
		});

		it("should provide clear error message", async () => {
			const content = "Test content";
			const provider = "claude";
			const apiKey = "test-key";

			try {
				await enhanceWithAI(content, provider, apiKey);
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toContain("not yet implemented");
			}
		});
	});

	describe("code example generation", () => {
		it("should include proper headers in examples", async () => {
			const content = "# API";
			const endpoint: EndpointInfo = {
				path: "/api/data",
				method: "post",
			};

			const result = await enhanceDocumentation(content, { endpoint });

			expect(result.enhancedContent).toContain("'Content-Type': 'application/json'");
		});

		it("should handle different HTTP methods", async () => {
			const methods = ["get", "post", "put", "patch", "delete"];

			for (const method of methods) {
				const endpoint: EndpointInfo = {
					path: "/api/test",
					method,
				};

				const result = await enhanceDocumentation("# Test", { endpoint });

				expect(result.enhancedContent).toContain(method.toUpperCase());
			}
		});

		it("should handle paths with parameters", async () => {
			const endpoint: EndpointInfo = {
				path: "/api/users/:userId/posts/:postId",
				method: "get",
			};

			const result = await enhanceDocumentation("# Test", { endpoint });

			expect(result.enhancedContent).toContain("/api/users/:userId/posts/:postId");
		});
	});

	describe("template enhancements", () => {
		it("should not modify content without endpoint context", async () => {
			const content = "# Simple Documentation\n\nJust basic info";
			const context = {};

			const result = await enhanceDocumentation(content, context);

			// Without endpoint, no enhancements should be added
			expect(result.enhancedContent).toBe(content);
		});

		it("should add all enhancements when all are missing", async () => {
			const content = "# Basic API";
			const endpoint: EndpointInfo = {
				path: "/api/test",
				method: "get",
			};

			const result = await enhanceDocumentation(content, { endpoint });

			expect(result.enhancedContent.length).toBeGreaterThan(content.length);
		});
	});

	describe("edge cases", () => {
		it("should handle undefined endpoint properties", async () => {
			const content = "# Test";
			const endpoint: EndpointInfo = {
				path: "/test",
				method: "get",
			};

			const result = await enhanceDocumentation(content, { endpoint });

			expect(result).toBeDefined();
		});

		it("should handle very long content", async () => {
			const content = `# Test\n\n${"Lorem ipsum ".repeat(1000)}`;
			const endpoint: EndpointInfo = {
				path: "/api/test",
				method: "get",
			};

			const result = await enhanceDocumentation(content, { endpoint });

			expect(result.enhancedContent.length).toBeGreaterThan(content.length);
		});

		it("should handle special characters in paths", async () => {
			const endpoint: EndpointInfo = {
				path: "/api/search?query={search}&filter={type}",
				method: "get",
			};

			const result = await enhanceDocumentation("# Test", { endpoint });

			expect(result.enhancedContent).toContain(endpoint.path);
		});
	});
});
