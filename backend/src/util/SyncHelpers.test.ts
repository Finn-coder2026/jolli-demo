import { integrityHashFromContent } from "./SyncHelpers";
import { describe, expect, it } from "vitest";

describe("SyncHelpers", () => {
	describe("integrityHashFromContent", () => {
		it("should return a hex string hash", () => {
			const hash = integrityHashFromContent("# Test Content");
			expect(typeof hash).toBe("string");
			// Should be a valid hex string
			expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
		});

		it("should return consistent hash for same content", () => {
			const content = "# Hello World";
			const hash1 = integrityHashFromContent(content);
			const hash2 = integrityHashFromContent(content);
			expect(hash1).toBe(hash2);
		});

		it("should return different hashes for different content", () => {
			const hash1 = integrityHashFromContent("# Content A");
			const hash2 = integrityHashFromContent("# Content B");
			expect(hash1).not.toBe(hash2);
		});

		it("should handle empty string", () => {
			const hash = integrityHashFromContent("");
			expect(typeof hash).toBe("string");
			expect(hash.length).toBeGreaterThan(0);
		});

		it("should handle unicode content", () => {
			const hash = integrityHashFromContent("# 你好世界 🌍");
			expect(typeof hash).toBe("string");
			expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
		});
	});
});
