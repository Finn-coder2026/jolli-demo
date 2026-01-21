import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import {
	extractOperationIdFromComment,
	generateOperationIdFromFilename,
	getOperationId,
	loadOperationIdMapping,
} from "./OperationIdMapper.js";

describe("OperationIdMapper", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("extractOperationIdFromComment", () => {
		it("should extract operationId from comment", () => {
			const content = `
// operationId: RateLimitService_getLimits
export function handler() {}
`;
			const result = extractOperationIdFromComment(content);
			expect(result).toBe("RateLimitService_getLimits");
		});

		it("should handle extra whitespace", () => {
			const content = "//   operationId:   UserService_create  \n";
			const result = extractOperationIdFromComment(content);
			expect(result).toBe("UserService_create");
		});

		it("should return null if no operationId comment found", () => {
			const content = "export function handler() {}";
			const result = extractOperationIdFromComment(content);
			expect(result).toBeNull();
		});

		it("should handle underscores and numbers in operationId", () => {
			const content = "// operationId: Test_Service_123_method";
			const result = extractOperationIdFromComment(content);
			expect(result).toBe("Test_Service_123_method");
		});
	});

	describe("generateOperationIdFromFilename", () => {
		it("should generate from simple route file", () => {
			const result = generateOperationIdFromFilename("rate-limit.get.ts");
			expect(result).toBe("RateLimitService_get");
		});

		it("should handle multiple dashes", () => {
			const result = generateOperationIdFromFilename("user-rate-limit.post.ts");
			expect(result).toBe("UserRateLimitService_post");
		});

		it("should handle path separators", () => {
			const result = generateOperationIdFromFilename("auth/login.post.ts");
			expect(result).toBe("AuthLoginService_post");
		});

		it("should handle .js files", () => {
			const result = generateOperationIdFromFilename("users.get.js");
			expect(result).toBe("UsersService_get");
		});

		it("should handle files without method extension", () => {
			const result = generateOperationIdFromFilename("webhook.ts");
			expect(result).toBe("WebhookService_handler");
		});

		it("should handle nested paths", () => {
			const result = generateOperationIdFromFilename("api/v1/users.get.ts");
			expect(result).toBe("ApiV1UsersService_get");
		});
	});

	describe("loadOperationIdMapping", () => {
		it("should load mapping from JSON file", () => {
			vi.spyOn(fs, "existsSync").mockReturnValue(true);
			vi.spyOn(fs, "readFileSync").mockReturnValue(
				JSON.stringify({
					"api/users.ts": "UserService_list",
					"api/auth.ts": "AuthService_login",
				}),
			);

			const result = loadOperationIdMapping("/test/repo");

			expect(result).toEqual({
				"api/users.ts": "UserService_list",
				"api/auth.ts": "AuthService_login",
			});
		});

		it("should return empty object if file doesn't exist", () => {
			vi.spyOn(fs, "existsSync").mockReturnValue(false);

			const result = loadOperationIdMapping("/test/repo");

			expect(result).toEqual({});
		});

		it("should return empty object if JSON is invalid", () => {
			vi.spyOn(fs, "existsSync").mockReturnValue(true);
			vi.spyOn(fs, "readFileSync").mockReturnValue("{ invalid json");

			const result = loadOperationIdMapping("/test/repo");

			expect(result).toEqual({});
		});

		it("should handle read errors gracefully", () => {
			vi.spyOn(fs, "existsSync").mockReturnValue(true);
			vi.spyOn(fs, "readFileSync").mockImplementation(() => {
				throw new Error("Read error");
			});

			const result = loadOperationIdMapping("/test/repo");

			expect(result).toEqual({});
		});
	});

	describe("getOperationId", () => {
		it("should use mapping file if available", () => {
			const mapping = {
				"api/rate-limit.ts": "CustomRateLimitOp",
			};

			const result = getOperationId("api/rate-limit.ts", "/repo", mapping);

			expect(result).toBe("CustomRateLimitOp");
		});

		it("should extract from file comment if no mapping", () => {
			vi.spyOn(fs, "existsSync").mockReturnValue(true);
			vi.spyOn(fs, "readFileSync").mockReturnValue("// operationId: CommentedOp\nfunction foo() {}");

			const result = getOperationId("api/test.ts", "/repo", {});

			expect(result).toBe("CommentedOp");
		});

		it("should generate from filename if no mapping or comment", () => {
			vi.spyOn(fs, "existsSync").mockReturnValue(true);
			vi.spyOn(fs, "readFileSync").mockReturnValue("export function handler() {}");

			const result = getOperationId("api/users.get.ts", "/repo", {});

			expect(result).toBe("ApiUsersService_get");
		});

		it("should generate from filename if file doesn't exist", () => {
			vi.spyOn(fs, "existsSync").mockReturnValue(false);

			const result = getOperationId("api/new-endpoint.post.ts", "/repo", {});

			expect(result).toBe("ApiNewEndpointService_post");
		});

		it("should generate from filename if file read fails", () => {
			vi.spyOn(fs, "existsSync").mockReturnValue(true);
			vi.spyOn(fs, "readFileSync").mockImplementation(() => {
				throw new Error("Read error");
			});

			const result = getOperationId("api/error.get.ts", "/repo", {});

			expect(result).toBe("ApiErrorService_get");
		});

		it("should load mapping if not provided", () => {
			vi.spyOn(fs, "existsSync").mockReturnValue(true);
			vi.spyOn(fs, "readFileSync").mockImplementation((path: unknown) => {
				if ((path as string).endsWith("operationid-mapping.json")) {
					return JSON.stringify({ "test.ts": "MappedOp" });
				}
				return "export function handler() {}";
			});

			const result = getOperationId("test.ts", "/repo");

			expect(result).toBe("MappedOp");
		});
	});
});
