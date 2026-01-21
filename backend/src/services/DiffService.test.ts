import { DiffService } from "./DiffService";
import { beforeEach, describe, expect, it } from "vitest";

describe("DiffService", () => {
	let diffService: DiffService;

	beforeEach(() => {
		diffService = new DiffService();
	});

	describe("generateDiff", () => {
		it("should return empty diffs for identical content", () => {
			const content = "Hello world";
			const result = diffService.generateDiff(content, content);

			expect(result.diffs).toEqual([]);
			expect(result.oldContent).toBe(content);
			expect(result.newContent).toBe(content);
		});

		it("should generate insert diff for empty old content", () => {
			const result = diffService.generateDiff("", "Hello world");

			expect(result.diffs).toHaveLength(1);
			expect(result.diffs[0]).toEqual({
				operation: "insert",
				position: 0,
				text: "Hello world",
			});
		});

		it("should generate delete diff for empty new content", () => {
			const result = diffService.generateDiff("Hello world", "");

			expect(result.diffs).toHaveLength(1);
			expect(result.diffs[0]).toEqual({
				operation: "delete",
				position: 0,
				length: 11,
			});
		});

		it("should generate insert diff for added text at end", () => {
			const result = diffService.generateDiff("Hello", "Hello world");

			expect(result.diffs).toHaveLength(1);
			expect(result.diffs[0]).toEqual({
				operation: "insert",
				position: 5,
				text: " world",
			});
		});

		it("should generate delete diff for removed text at end", () => {
			const result = diffService.generateDiff("Hello world", "Hello");

			expect(result.diffs).toHaveLength(1);
			expect(result.diffs[0]).toEqual({
				operation: "delete",
				position: 5,
				length: 6,
			});
		});

		it("should generate replace diff for changed text in middle", () => {
			const result = diffService.generateDiff("Hello world", "Hello there");

			expect(result.diffs).toHaveLength(1);
			expect(result.diffs[0]).toEqual({
				operation: "replace",
				position: 6,
				length: 5,
				text: "there",
			});
		});

		it("should generate insert diff for text added in middle", () => {
			const result = diffService.generateDiff("Hello!", "Hello world!");

			expect(result.diffs).toHaveLength(1);
			expect(result.diffs[0]).toEqual({
				operation: "insert",
				position: 5,
				text: " world",
			});
		});
	});

	describe("applyDiff", () => {
		it("should apply insert operation", () => {
			const content = "Hello";
			const diffs = [
				{
					operation: "insert" as const,
					position: 5,
					text: " world",
				},
			];

			const result = diffService.applyDiff(content, diffs);
			expect(result).toBe("Hello world");
		});

		it("should apply delete operation", () => {
			const content = "Hello world";
			const diffs = [
				{
					operation: "delete" as const,
					position: 5,
					length: 6,
				},
			];

			const result = diffService.applyDiff(content, diffs);
			expect(result).toBe("Hello");
		});

		it("should apply replace operation", () => {
			const content = "Hello world";
			const diffs = [
				{
					operation: "replace" as const,
					position: 6,
					length: 5,
					text: "there",
				},
			];

			const result = diffService.applyDiff(content, diffs);
			expect(result).toBe("Hello there");
		});

		it("should apply multiple diffs in correct order", () => {
			const content = "Hello world";
			const diffs = [
				{
					operation: "replace" as const,
					position: 0,
					length: 5,
					text: "Hi",
				},
				{
					operation: "delete" as const,
					position: 2,
					length: 6,
				},
			];

			const result = diffService.applyDiff(content, diffs);
			expect(result).toBe("Hi");
		});
	});

	describe("validateDiff", () => {
		it("should validate correct diffs", () => {
			const oldContent = "Hello world";
			const newContent = "Hello there";
			const diffResult = diffService.generateDiff(oldContent, newContent);

			const isValid = diffService.validateDiff(oldContent, newContent, diffResult.diffs);
			expect(isValid).toBe(true);
		});

		it("should invalidate incorrect diffs", () => {
			const oldContent = "Hello world";
			const newContent = "Hello there";
			const incorrectDiffs = [
				{
					operation: "insert" as const,
					position: 0,
					text: "Wrong",
				},
			];

			const isValid = diffService.validateDiff(oldContent, newContent, incorrectDiffs);
			expect(isValid).toBe(false);
		});
	});
});
