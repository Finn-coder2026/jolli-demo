import { RevisionManager } from "./RevisionManager";
import { beforeEach, describe, expect, it } from "vitest";

describe("RevisionManager", () => {
	let manager: RevisionManager;

	beforeEach(() => {
		manager = new RevisionManager(5); // Use smaller max for testing
	});

	describe("addRevision", () => {
		it("should add a new revision", () => {
			manager.addRevision(1, "content1", 100, "Initial version");

			expect(manager.getCurrentContent(1)).toBe("content1");
			expect(manager.getRevisionCount(1)).toBe(1);
			expect(manager.getCurrentIndex(1)).toBe(0);
		});

		it("should add multiple revisions", () => {
			manager.addRevision(1, "content1", 100, "Version 1");
			manager.addRevision(1, "content2", 100, "Version 2");
			manager.addRevision(1, "content3", 100, "Version 3");

			expect(manager.getCurrentContent(1)).toBe("content3");
			expect(manager.getRevisionCount(1)).toBe(3);
			expect(manager.getCurrentIndex(1)).toBe(2);
		});

		it("should clear forward history when adding after undo", () => {
			manager.addRevision(1, "content1", 100, "Version 1");
			manager.addRevision(1, "content2", 100, "Version 2");
			manager.addRevision(1, "content3", 100, "Version 3");

			manager.undo(1);
			manager.undo(1);

			expect(manager.getCurrentContent(1)).toBe("content1");

			manager.addRevision(1, "content4", 100, "Version 4");

			expect(manager.getCurrentContent(1)).toBe("content4");
			expect(manager.getRevisionCount(1)).toBe(2);
			expect(manager.canRedo(1)).toBe(false);
		});

		it("should trim old revisions when exceeding max", () => {
			for (let i = 0; i < 10; i++) {
				manager.addRevision(1, `content${i}`, 100, `Version ${i}`);
			}

			expect(manager.getRevisionCount(1)).toBe(5);
			expect(manager.getCurrentContent(1)).toBe("content9");
		});

		it("should handle multiple drafts independently", () => {
			manager.addRevision(1, "draft1-content1", 100, "Draft 1 Version 1");
			manager.addRevision(2, "draft2-content1", 200, "Draft 2 Version 1");

			expect(manager.getCurrentContent(1)).toBe("draft1-content1");
			expect(manager.getCurrentContent(2)).toBe("draft2-content1");
		});
	});

	describe("undo", () => {
		it("should undo to previous revision", () => {
			manager.addRevision(1, "content1", 100, "Version 1");
			manager.addRevision(1, "content2", 100, "Version 2");

			const result = manager.undo(1);

			expect(result).toEqual({ content: "content1", undoneChangeIds: undefined });
			expect(manager.getCurrentContent(1)).toBe("content1");
		});

		it("should return undefined when nothing to undo", () => {
			manager.addRevision(1, "content1", 100, "Version 1");

			const result = manager.undo(1);

			expect(result).toBeUndefined();
		});

		it("should return undefined for non-existent draft", () => {
			const result = manager.undo(999);

			expect(result).toBeUndefined();
		});

		it("should allow multiple undos", () => {
			manager.addRevision(1, "content1", 100, "Version 1");
			manager.addRevision(1, "content2", 100, "Version 2");
			manager.addRevision(1, "content3", 100, "Version 3");

			manager.undo(1);
			const result = manager.undo(1);

			expect(result).toEqual({ content: "content1", undoneChangeIds: undefined });
			expect(manager.getCurrentContent(1)).toBe("content1");
		});
	});

	describe("redo", () => {
		it("should redo to next revision", () => {
			manager.addRevision(1, "content1", 100, "Version 1");
			manager.addRevision(1, "content2", 100, "Version 2");

			manager.undo(1);
			const next = manager.redo(1);

			expect(next).toEqual({ content: "content2", reappliedChangeIds: undefined });
			expect(manager.getCurrentContent(1)).toBe("content2");
		});

		it("should return undefined when nothing to redo", () => {
			manager.addRevision(1, "content1", 100, "Version 1");

			const result = manager.redo(1);

			expect(result).toBeUndefined();
		});

		it("should return undefined for non-existent draft", () => {
			const result = manager.redo(999);

			expect(result).toBeUndefined();
		});

		it("should allow multiple redos", () => {
			manager.addRevision(1, "content1", 100, "Version 1");
			manager.addRevision(1, "content2", 100, "Version 2");
			manager.addRevision(1, "content3", 100, "Version 3");

			manager.undo(1);
			manager.undo(1);
			manager.redo(1);
			const result = manager.redo(1);

			expect(result).toEqual({ content: "content3", reappliedChangeIds: undefined });
			expect(manager.getCurrentContent(1)).toBe("content3");
		});
	});

	describe("canUndo", () => {
		it("should return true when undo is available", () => {
			manager.addRevision(1, "content1", 100, "Version 1");
			manager.addRevision(1, "content2", 100, "Version 2");

			expect(manager.canUndo(1)).toBe(true);
		});

		it("should return false when at first revision", () => {
			manager.addRevision(1, "content1", 100, "Version 1");

			expect(manager.canUndo(1)).toBe(false);
		});

		it("should return false for non-existent draft", () => {
			expect(manager.canUndo(999)).toBe(false);
		});
	});

	describe("canRedo", () => {
		it("should return true when redo is available", () => {
			manager.addRevision(1, "content1", 100, "Version 1");
			manager.addRevision(1, "content2", 100, "Version 2");

			manager.undo(1);

			expect(manager.canRedo(1)).toBe(true);
		});

		it("should return false when at last revision", () => {
			manager.addRevision(1, "content1", 100, "Version 1");

			expect(manager.canRedo(1)).toBe(false);
		});

		it("should return false for non-existent draft", () => {
			expect(manager.canRedo(999)).toBe(false);
		});
	});

	describe("getCurrentContent", () => {
		it("should return current content", () => {
			manager.addRevision(1, "content1", 100, "Version 1");

			expect(manager.getCurrentContent(1)).toBe("content1");
		});

		it("should return undefined for non-existent draft", () => {
			expect(manager.getCurrentContent(999)).toBeUndefined();
		});
	});

	describe("getRevisionInfo", () => {
		it("should return revision metadata without content", () => {
			manager.addRevision(1, "content1", 100, "Version 1");
			manager.addRevision(1, "content2", 200, "Version 2");

			const info = manager.getRevisionInfo(1);

			expect(info).toHaveLength(2);
			expect(info?.[0]).toMatchObject({
				userId: 100,
				description: "Version 1",
			});
			expect(info?.[1]).toMatchObject({
				userId: 200,
				description: "Version 2",
			});
			expect(info?.[0].timestamp).toBeInstanceOf(Date);
		});

		it("should return undefined for non-existent draft", () => {
			expect(manager.getRevisionInfo(999)).toBeUndefined();
		});
	});

	describe("getCurrentIndex", () => {
		it("should return current index", () => {
			manager.addRevision(1, "content1", 100, "Version 1");
			manager.addRevision(1, "content2", 100, "Version 2");

			expect(manager.getCurrentIndex(1)).toBe(1);
		});

		it("should return -1 for non-existent draft", () => {
			expect(manager.getCurrentIndex(999)).toBe(-1);
		});

		it("should update after undo", () => {
			manager.addRevision(1, "content1", 100, "Version 1");
			manager.addRevision(1, "content2", 100, "Version 2");

			manager.undo(1);

			expect(manager.getCurrentIndex(1)).toBe(0);
		});
	});

	describe("clear", () => {
		it("should clear revision history", () => {
			manager.addRevision(1, "content1", 100, "Version 1");
			manager.addRevision(1, "content2", 100, "Version 2");

			manager.clear(1);

			expect(manager.getCurrentContent(1)).toBeUndefined();
			expect(manager.getRevisionCount(1)).toBe(0);
		});

		it("should handle clearing non-existent draft", () => {
			expect(() => manager.clear(999)).not.toThrow();
		});
	});

	describe("getRevisionCount", () => {
		it("should return number of revisions", () => {
			manager.addRevision(1, "content1", 100, "Version 1");
			manager.addRevision(1, "content2", 100, "Version 2");

			expect(manager.getRevisionCount(1)).toBe(2);
		});

		it("should return 0 for non-existent draft", () => {
			expect(manager.getRevisionCount(999)).toBe(0);
		});
	});

	describe("getRevisionAt", () => {
		it("should return revision at specific index", () => {
			manager.addRevision(1, "content1", 100, "Version 1");
			manager.addRevision(1, "content2", 101, "Version 2");

			const revision = manager.getRevisionAt(1, 0);
			expect(revision).toBeDefined();
			expect(revision?.content).toBe("content1");
			expect(revision?.userId).toBe(100);
			expect(revision?.description).toBe("Version 1");
		});

		it("should return undefined for non-existent draft", () => {
			const revision = manager.getRevisionAt(999, 0);
			expect(revision).toBeUndefined();
		});

		it("should return undefined for negative index", () => {
			manager.addRevision(1, "content1", 100, "Version 1");
			const revision = manager.getRevisionAt(1, -1);
			expect(revision).toBeUndefined();
		});

		it("should return undefined for index out of bounds", () => {
			manager.addRevision(1, "content1", 100, "Version 1");
			const revision = manager.getRevisionAt(1, 10);
			expect(revision).toBeUndefined();
		});
	});
});
