/**
 * Tests for the web_search agent hub tool.
 */

import { createWebSearchToolDefinition, executeWebSearchTool, webSearchArgsSchema } from "./WebSearchTool";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Config to control TAVILY_API_KEY
vi.mock("../../config/Config", () => ({
	getConfig: vi.fn(),
}));

import { getConfig } from "../../config/Config";

/** Helper to create a mock fetch Response. */
function mockFetchResponse(status: number, body: unknown): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 200 ? "OK" : "Error",
		text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
	} as Response;
}

describe("WebSearchTool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	// ─── Schema Validation ──────────────────────────────────────────────────

	describe("webSearchArgsSchema", () => {
		it("accepts a valid query with defaults", () => {
			const result = webSearchArgsSchema.safeParse({ query: "test query" });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.query).toBe("test query");
				expect(result.data.max_results).toBe(5);
				expect(result.data.search_depth).toBe("basic");
			}
		});

		it("accepts custom max_results and search_depth", () => {
			const result = webSearchArgsSchema.safeParse({
				query: "test",
				max_results: 3,
				search_depth: "advanced",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.max_results).toBe(3);
				expect(result.data.search_depth).toBe("advanced");
			}
		});

		it("rejects empty query", () => {
			const result = webSearchArgsSchema.safeParse({ query: "" });

			expect(result.success).toBe(false);
		});

		it("rejects missing query", () => {
			const result = webSearchArgsSchema.safeParse({});

			expect(result.success).toBe(false);
		});

		it("rejects max_results below 1", () => {
			const result = webSearchArgsSchema.safeParse({ query: "test", max_results: 0 });

			expect(result.success).toBe(false);
		});

		it("rejects max_results above 10", () => {
			const result = webSearchArgsSchema.safeParse({ query: "test", max_results: 11 });

			expect(result.success).toBe(false);
		});

		it("rejects non-integer max_results", () => {
			const result = webSearchArgsSchema.safeParse({ query: "test", max_results: 2.5 });

			expect(result.success).toBe(false);
		});

		it("rejects invalid search_depth", () => {
			const result = webSearchArgsSchema.safeParse({ query: "test", search_depth: "deep" });

			expect(result.success).toBe(false);
		});
	});

	// ─── Tool Definition ────────────────────────────────────────────────────

	describe("createWebSearchToolDefinition", () => {
		it("returns a valid tool definition", () => {
			const def = createWebSearchToolDefinition();

			expect(def.name).toBe("web_search");
			expect(def.description).toBeTruthy();
			expect(def.parameters.type).toBe("object");
			expect(def.parameters.properties).toHaveProperty("query");
			expect(def.parameters.properties).toHaveProperty("max_results");
			expect(def.parameters.properties).toHaveProperty("search_depth");
			expect(def.parameters.required).toEqual(["query"]);
		});
	});

	// ─── Executor ───────────────────────────────────────────────────────────

	describe("executeWebSearchTool", () => {
		it("returns friendly message when API key is not configured", async () => {
			vi.mocked(getConfig).mockReturnValue({ TAVILY_API_KEY: undefined } as ReturnType<typeof getConfig>);

			const result = await executeWebSearchTool({ query: "test", max_results: 5, search_depth: "basic" });

			expect(result).toBe("Web search is not available — the TAVILY_API_KEY is not configured.");
			expect(fetch).not.toHaveBeenCalled();
		});

		it("returns friendly message when API key is empty string", async () => {
			vi.mocked(getConfig).mockReturnValue({ TAVILY_API_KEY: "" } as ReturnType<typeof getConfig>);

			const result = await executeWebSearchTool({ query: "test", max_results: 5, search_depth: "basic" });

			expect(result).toBe("Web search is not available — the TAVILY_API_KEY is not configured.");
		});

		it("returns formatted results on successful search", async () => {
			vi.mocked(getConfig).mockReturnValue({ TAVILY_API_KEY: "tvly-test-key" } as ReturnType<typeof getConfig>);
			vi.mocked(fetch).mockResolvedValue(
				mockFetchResponse(200, {
					results: [
						{ title: "Result One", url: "https://example.com/1", content: "First result snippet" },
						{ title: "Result Two", url: "https://example.com/2", content: "Second result snippet" },
					],
				}),
			);

			const result = await executeWebSearchTool({ query: "test query", max_results: 5, search_depth: "basic" });

			expect(result).toContain('Web search results for "test query":');
			expect(result).toContain("1. Result One (https://example.com/1) — First result snippet");
			expect(result).toContain("2. Result Two (https://example.com/2) — Second result snippet");
		});

		it("returns no-results message when results array is empty", async () => {
			vi.mocked(getConfig).mockReturnValue({ TAVILY_API_KEY: "tvly-test-key" } as ReturnType<typeof getConfig>);
			vi.mocked(fetch).mockResolvedValue(mockFetchResponse(200, { results: [] }));

			const result = await executeWebSearchTool({
				query: "obscure query",
				max_results: 5,
				search_depth: "basic",
			});

			expect(result).toBe('No web search results found for "obscure query".');
		});

		it("returns error message on non-200 response", async () => {
			vi.mocked(getConfig).mockReturnValue({ TAVILY_API_KEY: "tvly-test-key" } as ReturnType<typeof getConfig>);
			vi.mocked(fetch).mockResolvedValue(mockFetchResponse(401, "Unauthorized"));

			const result = await executeWebSearchTool({ query: "test", max_results: 5, search_depth: "basic" });

			expect(result).toBe("Web search API error (401): Unauthorized");
		});

		it("returns error message on network failure", async () => {
			vi.mocked(getConfig).mockReturnValue({ TAVILY_API_KEY: "tvly-test-key" } as ReturnType<typeof getConfig>);
			vi.mocked(fetch).mockRejectedValue(new Error("fetch failed"));

			const result = await executeWebSearchTool({ query: "test", max_results: 5, search_depth: "basic" });

			expect(result).toBe("Error calling web search API: fetch failed");
		});

		it("returns API error when response body has error field", async () => {
			vi.mocked(getConfig).mockReturnValue({ TAVILY_API_KEY: "tvly-test-key" } as ReturnType<typeof getConfig>);
			vi.mocked(fetch).mockResolvedValue(mockFetchResponse(200, { error: "Rate limit exceeded" }));

			const result = await executeWebSearchTool({ query: "test", max_results: 5, search_depth: "basic" });

			expect(result).toBe("Web search API error: Rate limit exceeded");
		});

		it("returns API error when response body has message field", async () => {
			vi.mocked(getConfig).mockReturnValue({ TAVILY_API_KEY: "tvly-test-key" } as ReturnType<typeof getConfig>);
			vi.mocked(fetch).mockResolvedValue(mockFetchResponse(200, { message: "Invalid API key" }));

			const result = await executeWebSearchTool({ query: "test", max_results: 5, search_depth: "basic" });

			expect(result).toBe("Web search API error: Invalid API key");
		});

		it("respects custom max_results by slicing results", async () => {
			vi.mocked(getConfig).mockReturnValue({ TAVILY_API_KEY: "tvly-test-key" } as ReturnType<typeof getConfig>);
			vi.mocked(fetch).mockResolvedValue(
				mockFetchResponse(200, {
					results: [
						{ title: "A", url: "https://a.com", content: "a" },
						{ title: "B", url: "https://b.com", content: "b" },
						{ title: "C", url: "https://c.com", content: "c" },
					],
				}),
			);

			const result = await executeWebSearchTool({ query: "test", max_results: 2, search_depth: "basic" });

			expect(result).toContain("1. A");
			expect(result).toContain("2. B");
			expect(result).not.toContain("3. C");
		});

		it("sends correct payload with search_depth advanced", async () => {
			vi.mocked(getConfig).mockReturnValue({ TAVILY_API_KEY: "tvly-key" } as ReturnType<typeof getConfig>);
			vi.mocked(fetch).mockResolvedValue(mockFetchResponse(200, { results: [] }));

			await executeWebSearchTool({ query: "deep search", max_results: 3, search_depth: "advanced" });

			expect(fetch).toHaveBeenCalledWith("https://api.tavily.com/search", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					api_key: "tvly-key",
					query: "deep search",
					search_depth: "advanced",
					max_results: 3,
				}),
			});
		});

		it("handles results with missing optional fields", async () => {
			vi.mocked(getConfig).mockReturnValue({ TAVILY_API_KEY: "tvly-test-key" } as ReturnType<typeof getConfig>);
			vi.mocked(fetch).mockResolvedValue(
				mockFetchResponse(200, {
					results: [{ title: "No URL" }, { url: "https://no-title.com" }, {}],
				}),
			);

			const result = await executeWebSearchTool({ query: "test", max_results: 5, search_depth: "basic" });

			expect(result).toContain("1. No URL");
			expect(result).toContain("2. Untitled (https://no-title.com)");
			expect(result).toContain("3. Untitled");
		});

		it("falls back to statusText when response body is empty on error", async () => {
			vi.mocked(getConfig).mockReturnValue({ TAVILY_API_KEY: "tvly-test-key" } as ReturnType<typeof getConfig>);
			vi.mocked(fetch).mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				text: () => Promise.resolve(""),
			} as Response);

			const result = await executeWebSearchTool({ query: "test", max_results: 5, search_depth: "basic" });

			expect(result).toBe("Web search API error (500): Internal Server Error");
		});

		it("handles empty response text gracefully", async () => {
			vi.mocked(getConfig).mockReturnValue({ TAVILY_API_KEY: "tvly-test-key" } as ReturnType<typeof getConfig>);
			vi.mocked(fetch).mockResolvedValue({
				ok: true,
				status: 200,
				text: () => Promise.resolve(""),
			} as Response);

			const result = await executeWebSearchTool({ query: "test", max_results: 5, search_depth: "basic" });

			expect(result).toBe('No web search results found for "test".');
		});

		it("handles non-Error thrown objects in catch", async () => {
			vi.mocked(getConfig).mockReturnValue({ TAVILY_API_KEY: "tvly-test-key" } as ReturnType<typeof getConfig>);
			vi.mocked(fetch).mockRejectedValue("string error");

			const result = await executeWebSearchTool({ query: "test", max_results: 5, search_depth: "basic" });

			expect(result).toBe("Error calling web search API: string error");
		});
	});
});
