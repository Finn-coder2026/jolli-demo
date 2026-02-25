import { mockDoc } from "../model/Doc.mock";
import { DocHistoryService } from "./DocHistoryService";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the logger
vi.mock("../util/Logger", () => ({
	getLog: () => ({
		debug: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	}),
}));

describe("DocHistoryService", () => {
	let service: DocHistoryService;

	beforeEach(() => {
		service = new DocHistoryService();
	});

	describe("getReferVersion", () => {
		it("should return undefined when doc is null", () => {
			const result = service.getReferVersion(null);
			expect(result).toBeUndefined();
		});

		it("should return undefined when doc is undefined", () => {
			const result = service.getReferVersion(undefined);
			expect(result).toBeUndefined();
		});

		it("should return undefined when contentMetadata is undefined", () => {
			const doc = mockDoc({ contentMetadata: undefined });
			const result = service.getReferVersion(doc);
			expect(result).toBeUndefined();
		});

		it("should return undefined when contentMetadata is not an object", () => {
			const doc = mockDoc({ contentMetadata: "invalid" as never });
			const result = service.getReferVersion(doc);
			expect(result).toBeUndefined();
		});

		it("should return undefined when referVersion field is not present", () => {
			const doc = mockDoc({ contentMetadata: { title: "Test" } });
			const result = service.getReferVersion(doc);
			expect(result).toBeUndefined();
		});

		it("should return undefined when referVersion is null", () => {
			const doc = mockDoc({
				contentMetadata: { title: "Test", referVersion: null } as never,
			});
			const result = service.getReferVersion(doc);
			expect(result).toBeUndefined();
		});

		it("should return the number when referVersion is a valid number", () => {
			const doc = mockDoc({
				contentMetadata: { title: "Test", referVersion: 5 } as never,
			});
			const result = service.getReferVersion(doc);
			expect(result).toBe(5);
		});

		it("should return undefined when referVersion is NaN", () => {
			const doc = mockDoc({
				contentMetadata: { title: "Test", referVersion: Number.NaN } as never,
			});
			const result = service.getReferVersion(doc);
			expect(result).toBeUndefined();
		});

		it("should return undefined when referVersion is Infinity", () => {
			const doc = mockDoc({
				contentMetadata: { title: "Test", referVersion: Number.POSITIVE_INFINITY } as never,
			});
			const result = service.getReferVersion(doc);
			expect(result).toBeUndefined();
		});

		it("should parse and return number when referVersion is a valid numeric string", () => {
			const doc = mockDoc({
				contentMetadata: { title: "Test", referVersion: "10" } as never,
			});
			const result = service.getReferVersion(doc);
			expect(result).toBe(10);
		});

		it("should return undefined when referVersion is an invalid string", () => {
			const doc = mockDoc({
				contentMetadata: { title: "Test", referVersion: "invalid" } as never,
			});
			const result = service.getReferVersion(doc);
			expect(result).toBeUndefined();
		});

		it("should return undefined when referVersion has unexpected type", () => {
			const doc = mockDoc({
				contentMetadata: { title: "Test", referVersion: { nested: true } } as never,
			});
			const result = service.getReferVersion(doc);
			expect(result).toBeUndefined();
		});

		it("should return 0 when referVersion is 0", () => {
			const doc = mockDoc({
				contentMetadata: { title: "Test", referVersion: 0 } as never,
			});
			const result = service.getReferVersion(doc);
			expect(result).toBe(0);
		});

		it("should return negative number when referVersion is negative", () => {
			const doc = mockDoc({
				contentMetadata: { title: "Test", referVersion: -5 } as never,
			});
			const result = service.getReferVersion(doc);
			expect(result).toBe(-5);
		});
	});

	describe("compressDocSnapshot", () => {
		it("should compress a document to a gzip buffer", () => {
			const doc = mockDoc({
				id: 1,
				content: "Test content",
				contentMetadata: { title: "Test" },
			});

			const result = service.compressDocSnapshot(doc);

			expect(result).toBeInstanceOf(Buffer);
			expect(result.length).toBeGreaterThan(0);
			// Gzip magic number
			expect(result[0]).toBe(0x1f);
			expect(result[1]).toBe(0x8b);
		});

		it("should throw and log error when serialization fails", () => {
			const doc = mockDoc({ id: 99, content: "test" });
			// Create a circular reference so JSON.stringify throws
			(doc as unknown as Record<string, unknown>).self = doc;

			expect(() => service.compressDocSnapshot(doc)).toThrow();
		});

		it("should produce a smaller buffer for large content", () => {
			const largeContent = "x".repeat(10000);
			const doc = mockDoc({ id: 1, content: largeContent });

			const result = service.compressDocSnapshot(doc);
			const jsonLength = JSON.stringify(doc).length;

			expect(result.length).toBeLessThan(jsonLength);
		});
	});

	describe("decompressDocSnapshot", () => {
		it("should decompress a gzip buffer back to a document", () => {
			const originalDoc = mockDoc({
				id: 42,
				content: "Test content",
				contentMetadata: { title: "Test Title" },
			});

			const compressed = service.compressDocSnapshot(originalDoc);
			const decompressed = service.decompressDocSnapshot(compressed);

			expect(decompressed.id).toBe(originalDoc.id);
			expect(decompressed.content).toBe(originalDoc.content);
			expect(decompressed.contentMetadata).toEqual(originalDoc.contentMetadata);
		});

		it("should throw error for invalid buffer", () => {
			const invalidBuffer = Buffer.from("not gzip data");

			expect(() => service.decompressDocSnapshot(invalidBuffer)).toThrow();
		});
	});

	describe("removeReferVersion", () => {
		it("should return undefined when contentMetadata is undefined", () => {
			const result = service.removeReferVersion(undefined);
			expect(result).toBeUndefined();
		});

		it("should return same object when referVersion is not present", () => {
			const metadata = { title: "Test" };
			const result = service.removeReferVersion(metadata);

			expect(result).toEqual({ title: "Test" });
		});

		it("should remove referVersion from contentMetadata", () => {
			const metadata = { title: "Test", referVersion: 5 } as never;
			const result = service.removeReferVersion(metadata);

			expect(result).toEqual({ title: "Test" });
			expect(result).not.toHaveProperty("referVersion");
		});

		it("should not mutate the original object", () => {
			const metadata = { title: "Test", referVersion: 5 } as never;
			service.removeReferVersion(metadata);

			expect(metadata).toHaveProperty("referVersion");
		});
	});

	describe("shouldSaveVersionHistory", () => {
		it("should return false when doc is undefined", () => {
			const result = service.shouldSaveVersionHistory(undefined);
			expect(result).toBe(false);
		});

		it("should return false when doc has referVersion", () => {
			const doc = mockDoc({
				contentMetadata: { title: "Test", referVersion: 5 } as never,
			});
			const result = service.shouldSaveVersionHistory(doc);
			expect(result).toBe(false);
		});

		it("should return true when doc exists and has no referVersion", () => {
			const doc = mockDoc({
				contentMetadata: { title: "Test" },
			});
			const result = service.shouldSaveVersionHistory(doc);
			expect(result).toBe(true);
		});

		it("should return true when doc exists with undefined contentMetadata", () => {
			const doc = mockDoc({ contentMetadata: undefined });
			const result = service.shouldSaveVersionHistory(doc);
			expect(result).toBe(true);
		});
	});

	describe("setReferVersion", () => {
		it("should set referVersion on existing contentMetadata", () => {
			const metadata = { title: "Test" };
			const result = service.setReferVersion(metadata, 5);

			expect(result).toEqual({ title: "Test", referVersion: 5 });
		});

		it("should create contentMetadata with referVersion when undefined", () => {
			const result = service.setReferVersion(undefined, 10);

			expect(result).toEqual({ referVersion: 10 });
		});

		it("should overwrite existing referVersion", () => {
			const metadata = { title: "Test", referVersion: 3 } as never;
			const result = service.setReferVersion(metadata, 7);

			expect(result).toEqual({ title: "Test", referVersion: 7 });
		});

		it("should not mutate the original object", () => {
			const metadata = { title: "Test" };
			service.setReferVersion(metadata, 5);

			expect(metadata).not.toHaveProperty("referVersion");
		});

		it("should handle referVersion of 0", () => {
			const result = service.setReferVersion(undefined, 0);

			expect(result).toEqual({ referVersion: 0 });
		});
	});
});
