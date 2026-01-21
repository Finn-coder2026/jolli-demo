import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractEndpointInfo, isRouteFile, scanRepository } from "./RepoScanner.js";

describe("RepoScanner", () => {
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

	describe("extractEndpointInfo", () => {
		it("should extract info from simple route file", () => {
			const result = extractEndpointInfo("rate-limit.get.ts");

			expect(result.method).toBe("get");
			expect(result.resource).toBe("rate-limit");
			expect(result.operationId).toBe("RateLimitService_get");
			expect(result.title).toBe("Get Rate Limit");
		});

		it("should handle nested paths", () => {
			const result = extractEndpointInfo("api/v1/users.post.ts");

			expect(result.method).toBe("post");
			expect(result.resource).toBe("users");
			expect(result.operationId).toBe("ApiV1UsersService_post");
			expect(result.title).toBe("Post Users");
		});

		it("should handle files without method extension", () => {
			const result = extractEndpointInfo("webhook.ts");

			expect(result.method).toBe("handler");
			expect(result.resource).toBe("webhook");
			expect(result.operationId).toBe("WebhookService_handler");
			expect(result.title).toBe("Handler Webhook");
		});

		it("should handle multi-word resources", () => {
			const result = extractEndpointInfo("rate-limit-config.get.ts");

			expect(result.resource).toBe("rate-limit-config");
			expect(result.title).toBe("Get Rate Limit Config");
		});

		it("should preserve file path", () => {
			const filePath = "api/v1/users.get.ts";
			const result = extractEndpointInfo(filePath);

			expect(result.filePath).toBe(filePath);
		});
	});

	describe("scanRepository", () => {
		let tempDir: string;

		beforeEach(() => {
			tempDir = mkdtempSync(join(tmpdir(), "repo-scanner-test-"));
		});

		afterEach(() => {
			rmSync(tempDir, { recursive: true, force: true });
		});

		it("should scan repository and find route files", () => {
			// Create test repository structure
			mkdirSync(join(tempDir, "routes"), { recursive: true });
			writeFileSync(join(tempDir, "routes", "users.get.ts"), "export default {}");
			writeFileSync(join(tempDir, "routes", "posts.post.ts"), "export default {}");

			const result = scanRepository(tempDir, "test-api");

			expect(result.source).toBe("test-api");
			expect(result.endpoints.length).toBe(2);
			expect(result.endpoints[0].resource).toBe("posts");
			expect(result.endpoints[1].resource).toBe("users");
		});

		it("should throw error for non-existent path", () => {
			expect(() => {
				scanRepository("/nonexistent/path", "test");
			}).toThrow("does not exist");
		});

		it("should handle empty repository", () => {
			const result = scanRepository(tempDir, "empty");

			expect(result.endpoints).toHaveLength(0);
		});

		it("should filter out non-route files", () => {
			mkdirSync(join(tempDir, "routes"), { recursive: true });
			writeFileSync(join(tempDir, "routes", "users.get.ts"), "export default {}");
			writeFileSync(join(tempDir, "routes", "README.md"), "# Docs");
			writeFileSync(join(tempDir, "routes", "config.json"), "{}");

			const result = scanRepository(tempDir, "test");

			expect(result.endpoints.length).toBe(1);
			expect(result.endpoints[0].resource).toBe("users");
		});

		it("should sort endpoints by resource name", () => {
			mkdirSync(join(tempDir, "routes"), { recursive: true });
			writeFileSync(join(tempDir, "routes", "zebra.get.ts"), "export default {}");
			writeFileSync(join(tempDir, "routes", "alpha.get.ts"), "export default {}");
			writeFileSync(join(tempDir, "routes", "beta.get.ts"), "export default {}");

			const result = scanRepository(tempDir, "test");

			expect(result.endpoints.length).toBe(3);
			expect(result.endpoints[0].resource).toBe("alpha");
			expect(result.endpoints[1].resource).toBe("beta");
			expect(result.endpoints[2].resource).toBe("zebra");
		});
	});
});
