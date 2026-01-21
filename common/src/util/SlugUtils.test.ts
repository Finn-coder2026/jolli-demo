import { buildPath, DEFAULT_SLUG_MAX_LENGTH, generateSlug, isValidSlug } from "./SlugUtils";
import { describe, expect, it, vi } from "vitest";

// Mock randomUUID for deterministic tests
vi.mock("node:crypto", () => ({
	randomUUID: vi.fn(() => "a1b2c3d4-e5f6-7890-abcd-ef1234567890"),
}));

describe("SlugUtils", () => {
	describe("generateSlug", () => {
		it("converts English text to lowercase with hyphens", () => {
			expect(generateSlug("Getting Started")).toBe("getting-started");
			expect(generateSlug("Hello World")).toBe("hello-world");
		});

		it("removes special characters and replaces with hyphens", () => {
			expect(generateSlug("Hello!@#World")).toBe("hello-world");
			expect(generateSlug("Test & Demo")).toBe("test-demo");
		});

		it("removes leading and trailing hyphens", () => {
			expect(generateSlug("--Hello--")).toBe("hello");
			expect(generateSlug("!Hello!")).toBe("hello");
		});

		it("handles multiple consecutive special characters", () => {
			expect(generateSlug("Hello   World")).toBe("hello-world");
			expect(generateSlug("Hello---World")).toBe("hello-world");
		});

		it("generates UUID prefix for Chinese text", () => {
			expect(generateSlug("用户认证")).toBe("a1b2c3d4");
			expect(generateSlug("工程文档")).toBe("a1b2c3d4");
		});

		it("generates UUID prefix for mixed Chinese and English text", () => {
			expect(generateSlug("Hello 世界")).toBe("a1b2c3d4");
		});

		it("respects maxLength parameter", () => {
			const longText = "a".repeat(150);
			expect(generateSlug(longText, 50)).toHaveLength(50);
			expect(generateSlug(longText)).toHaveLength(DEFAULT_SLUG_MAX_LENGTH);
		});

		it("has default max length of 80 to leave room for timestamps", () => {
			// Default is 80, leaving 20 chars for timestamp suffix (-1234567890123)
			expect(DEFAULT_SLUG_MAX_LENGTH).toBe(80);
		});

		it("handles empty string", () => {
			expect(generateSlug("")).toBe("");
		});

		it("handles numbers", () => {
			expect(generateSlug("Test 123")).toBe("test-123");
			expect(generateSlug("123")).toBe("123");
		});
	});

	describe("isValidSlug", () => {
		it("returns true for valid slugs starting with letter", () => {
			expect(isValidSlug("hello")).toBe(true);
			expect(isValidSlug("Hello")).toBe(true);
			expect(isValidSlug("hello-world")).toBe(true);
			expect(isValidSlug("hello_world")).toBe(true);
			expect(isValidSlug("hello.world")).toBe(true);
		});

		it("returns true for valid slugs starting with number", () => {
			expect(isValidSlug("123abc")).toBe(true);
			expect(isValidSlug("1-test")).toBe(true);
		});

		it("returns false for empty string", () => {
			expect(isValidSlug("")).toBe(false);
		});

		it("returns false for slugs starting with special characters", () => {
			expect(isValidSlug("-hello")).toBe(false);
			expect(isValidSlug("_hello")).toBe(false);
			expect(isValidSlug(".hello")).toBe(false);
		});

		it("returns false for slugs with invalid characters", () => {
			expect(isValidSlug("hello world")).toBe(false);
			expect(isValidSlug("hello@world")).toBe(false);
			expect(isValidSlug("hello#world")).toBe(false);
		});

		it("returns true for slugs with allowed special characters", () => {
			expect(isValidSlug("hello-world")).toBe(true);
			expect(isValidSlug("hello_world")).toBe(true);
			expect(isValidSlug("hello.world")).toBe(true);
			expect(isValidSlug("hello-world_test.md")).toBe(true);
		});
	});

	describe("buildPath", () => {
		it("builds root level path when parentPath is null", () => {
			expect(buildPath(null, "my-doc")).toBe("/my-doc");
		});

		it("builds root level path when parentPath is undefined", () => {
			expect(buildPath(undefined, "my-doc")).toBe("/my-doc");
		});

		it("builds root level path when parentPath is empty string", () => {
			expect(buildPath("", "my-doc")).toBe("/my-doc");
		});

		it("builds nested path when parentPath is provided", () => {
			expect(buildPath("/folder", "my-doc")).toBe("/folder/my-doc");
		});

		it("builds deeply nested path", () => {
			expect(buildPath("/folder1/folder2", "my-doc")).toBe("/folder1/folder2/my-doc");
		});

		it("handles UUID-style slugs for Chinese content", () => {
			expect(buildPath("/docs", "a1b2c3d4")).toBe("/docs/a1b2c3d4");
		});

		it("handles slugs with special characters", () => {
			expect(buildPath("/docs", "hello-world_test.md")).toBe("/docs/hello-world_test.md");
		});
	});
});
