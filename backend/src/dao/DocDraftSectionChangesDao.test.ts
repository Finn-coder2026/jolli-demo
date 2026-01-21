import type { DocDraftSectionChanges, NewDocDraftSectionChanges } from "../model/DocDraftSectionChanges";
import { mockDocDraftSectionChanges, mockNewDocDraftSectionChanges } from "../model/DocDraftSectionChanges.mock";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import {
	createDocDraftSectionChangesDao,
	createDocDraftSectionChangesDaoProvider,
	type DocDraftSectionChangesDao,
} from "./DocDraftSectionChangesDao";
import type { DocDraftSectionChange, DocDraftSectionComment } from "jolli-common";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DocDraftSectionChangesDao", () => {
	let mockModel: ModelDef<DocDraftSectionChanges>;
	let mockDraftModel: ModelDef<unknown>;
	let dao: DocDraftSectionChangesDao;

	beforeEach(() => {
		mockModel = {
			create: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<DocDraftSectionChanges>;

		mockDraftModel = {
			findOne: vi.fn(),
		} as unknown as ModelDef<unknown>;

		const mockSequelize = {
			define: vi.fn((tableName: string) => {
				// Return the right model based on table name
				if (tableName === "doc_draft") {
					return mockDraftModel;
				}
				return mockModel;
			}),
		} as unknown as Sequelize;

		dao = createDocDraftSectionChangesDao(mockSequelize);
	});

	describe("createDocDraftSectionChanges", () => {
		it("should create section changes", async () => {
			const newChanges = mockNewDocDraftSectionChanges({
				draftId: 1,
				docId: 1,
				changeType: "update",
				path: "/sections/0",
				content: "Original content",
			});

			const createdChanges = mockDocDraftSectionChanges({
				...newChanges,
				id: 1,
			});

			// Mock draft lookup
			vi.mocked(mockDraftModel.findOne).mockResolvedValue({
				get: () => ({ id: 1, docId: 1 }),
			} as never);

			vi.mocked(mockModel.create).mockResolvedValue(createdChanges as never);

			const result = await dao.createDocDraftSectionChanges(newChanges);

			expect(mockDraftModel.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
			expect(mockModel.create).toHaveBeenCalledWith(newChanges);
			expect(result).toEqual(createdChanges);
		});

		it("should create section changes with insert-before type", async () => {
			// biome-ignore lint/correctness/noUnusedVariables: content is intentionally removed
			const { content, ...newChangesWithoutContent } = mockNewDocDraftSectionChanges({
				draftId: 1,
				docId: 1,
				changeType: "insert-before",
				path: "/sections/1",
			});
			const newChanges = newChangesWithoutContent as NewDocDraftSectionChanges;

			const createdChanges = mockDocDraftSectionChanges({
				...newChanges,
				id: 2,
			});

			// Mock draft lookup
			vi.mocked(mockDraftModel.findOne).mockResolvedValue({
				get: () => ({ id: 1, docId: 1 }),
			} as never);

			vi.mocked(mockModel.create).mockResolvedValue(createdChanges as never);

			const result = await dao.createDocDraftSectionChanges(newChanges);

			expect(result).toEqual(createdChanges);
		});

		it("should create section changes with empty arrays", async () => {
			const newChanges = mockNewDocDraftSectionChanges({
				draftId: 1,
				docId: 1,
				changeType: "insert-after",
				path: "/sections/2",
				proposed: [],
				comments: [],
			});

			const createdChanges = mockDocDraftSectionChanges({
				...newChanges,
				id: 3,
			});

			// Mock draft lookup
			vi.mocked(mockDraftModel.findOne).mockResolvedValue({
				get: () => ({ id: 1, docId: 1 }),
			} as never);

			vi.mocked(mockModel.create).mockResolvedValue(createdChanges as never);

			const result = await dao.createDocDraftSectionChanges(newChanges);

			expect(result.proposed).toEqual([]);
			expect(result.comments).toEqual([]);
		});

		it("should throw error if draft not found", async () => {
			const newChanges = mockNewDocDraftSectionChanges({
				draftId: 999,
				docId: 1,
			});

			vi.mocked(mockDraftModel.findOne).mockResolvedValue(null);

			await expect(dao.createDocDraftSectionChanges(newChanges)).rejects.toThrow(
				"Cannot create section changes: Draft 999 not found",
			);
		});

		it("should throw error if draft has no docId", async () => {
			const newChanges = mockNewDocDraftSectionChanges({
				draftId: 1,
				docId: 1,
			});

			vi.mocked(mockDraftModel.findOne).mockResolvedValue({
				get: () => ({ id: 1, docId: null }),
			} as never);

			await expect(dao.createDocDraftSectionChanges(newChanges)).rejects.toThrow(
				"Cannot create section changes: Draft 1 does not have a docId",
			);
		});

		it("should throw error if provided docId does not match draft docId", async () => {
			const newChanges = mockNewDocDraftSectionChanges({
				draftId: 1,
				docId: 2,
			});

			vi.mocked(mockDraftModel.findOne).mockResolvedValue({
				get: () => ({ id: 1, docId: 1 }),
			} as never);

			await expect(dao.createDocDraftSectionChanges(newChanges)).rejects.toThrow(
				"Cannot create section changes: Provided docId 2 does not match draft's docId 1",
			);
		});
	});

	describe("getDocDraftSectionChanges", () => {
		it("should return section changes by ID", async () => {
			const changes = mockDocDraftSectionChanges({ id: 1 });
			const mockGet = vi.fn().mockReturnValue(changes);

			vi.mocked(mockModel.findOne).mockResolvedValue({
				get: mockGet,
			} as never);

			const result = await dao.getDocDraftSectionChanges(1);

			expect(mockModel.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
			expect(mockGet).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(changes);
		});

		it("should return undefined if section changes not found", async () => {
			vi.mocked(mockModel.findOne).mockResolvedValue(null);

			const result = await dao.getDocDraftSectionChanges(999);

			expect(result).toBeUndefined();
		});
	});

	describe("listDocDraftSectionChanges", () => {
		it("should list all section changes with default ordering", async () => {
			const changes = [mockDocDraftSectionChanges({ id: 1 }), mockDocDraftSectionChanges({ id: 2 })];

			vi.mocked(mockModel.findAll).mockResolvedValue([
				{ get: () => changes[0] },
				{ get: () => changes[1] },
			] as never);

			const result = await dao.listDocDraftSectionChanges();

			expect(mockModel.findAll).toHaveBeenCalledWith({
				order: [["updatedAt", "DESC"]],
			});
			expect(result).toHaveLength(2);
		});

		it("should list section changes with pagination", async () => {
			const changes = [mockDocDraftSectionChanges({ id: 1 })];

			vi.mocked(mockModel.findAll).mockResolvedValue([{ get: () => changes[0] }] as never);

			const result = await dao.listDocDraftSectionChanges(10, 5);

			expect(mockModel.findAll).toHaveBeenCalledWith({
				order: [["updatedAt", "DESC"]],
				limit: 10,
				offset: 5,
			});
			expect(result).toHaveLength(1);
		});

		it("should list section changes with only limit", async () => {
			const changes = [mockDocDraftSectionChanges({ id: 1 })];

			vi.mocked(mockModel.findAll).mockResolvedValue([{ get: () => changes[0] }] as never);

			const result = await dao.listDocDraftSectionChanges(5);

			expect(mockModel.findAll).toHaveBeenCalledWith({
				order: [["updatedAt", "DESC"]],
				limit: 5,
			});
			expect(result).toHaveLength(1);
		});
	});

	describe("findByDraftId", () => {
		it("should find section changes for a specific draft", async () => {
			const changes = [mockDocDraftSectionChanges({ id: 1, draftId: 5 })];

			vi.mocked(mockModel.findAll).mockResolvedValue([{ get: () => changes[0] }] as never);

			const result = await dao.findByDraftId(5);

			expect(mockModel.findAll).toHaveBeenCalledWith({
				where: { draftId: 5 },
				order: [["updatedAt", "DESC"]],
			});
			expect(result).toHaveLength(1);
		});

		it("should return empty array when no changes found", async () => {
			vi.mocked(mockModel.findAll).mockResolvedValue([]);

			const result = await dao.findByDraftId(999);

			expect(result).toEqual([]);
		});
	});

	describe("updateDocDraftSectionChanges", () => {
		it("should update section changes", async () => {
			const changes = mockDocDraftSectionChanges({ id: 1, path: "/sections/0" });
			const updatedChanges = mockDocDraftSectionChanges({ id: 1, path: "/sections/1" });
			const mockGet = vi.fn().mockReturnValue(changes);

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: mockGet,
			} as never);

			vi.mocked(mockModel.update).mockResolvedValue([1] as never);

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => updatedChanges,
			} as never);

			const result = await dao.updateDocDraftSectionChanges(1, { path: "/sections/1" });

			expect(mockModel.update).toHaveBeenCalledWith({ path: "/sections/1" }, { where: { id: 1 } });
			expect(result).toEqual(updatedChanges);
		});

		it("should update change type", async () => {
			const changes = mockDocDraftSectionChanges({ id: 1, changeType: "update" });
			const updatedChanges = mockDocDraftSectionChanges({ id: 1, changeType: "insert-before" });

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => changes,
			} as never);

			vi.mocked(mockModel.update).mockResolvedValue([1] as never);

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => updatedChanges,
			} as never);

			const result = await dao.updateDocDraftSectionChanges(1, { changeType: "insert-before" });

			expect(result?.changeType).toBe("insert-before");
		});

		it("should update content", async () => {
			const changes = mockDocDraftSectionChanges({ id: 1, content: "Old content" });
			const updatedChanges = mockDocDraftSectionChanges({ id: 1, content: "New content" });

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => changes,
			} as never);

			vi.mocked(mockModel.update).mockResolvedValue([1] as never);

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => updatedChanges,
			} as never);

			const result = await dao.updateDocDraftSectionChanges(1, { content: "New content" });

			expect(result?.content).toBe("New content");
		});

		it("should update proposed changes array", async () => {
			const changes = mockDocDraftSectionChanges({ id: 1, proposed: [] });
			const newProposed: Array<DocDraftSectionChange> = [
				{
					for: "content",
					who: { type: "agent", id: 1 },
					description: "Test change",
					value: "Test value",
					appliedAt: undefined,
				},
			];
			const updatedChanges = mockDocDraftSectionChanges({ id: 1, proposed: newProposed });

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => changes,
			} as never);

			vi.mocked(mockModel.update).mockResolvedValue([1] as never);

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => updatedChanges,
			} as never);

			const result = await dao.updateDocDraftSectionChanges(1, { proposed: newProposed });

			expect(result?.proposed).toEqual(newProposed);
		});

		it("should update comments array", async () => {
			const changes = mockDocDraftSectionChanges({ id: 1, comments: [] });
			const newComments: Array<DocDraftSectionComment> = [
				{
					content: "Test comment",
					userId: 1,
					timestamp: "2025-01-01T00:00:00Z",
				},
			];
			const updatedChanges = mockDocDraftSectionChanges({ id: 1, comments: newComments });

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => changes,
			} as never);

			vi.mocked(mockModel.update).mockResolvedValue([1] as never);

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => updatedChanges,
			} as never);

			const result = await dao.updateDocDraftSectionChanges(1, { comments: newComments });

			expect(result?.comments).toEqual(newComments);
		});

		it("should return undefined if section changes not found", async () => {
			vi.mocked(mockModel.findOne).mockResolvedValue(null);

			const result = await dao.updateDocDraftSectionChanges(999, { path: "/sections/1" });

			expect(result).toBeUndefined();
			expect(mockModel.update).not.toHaveBeenCalled();
		});
	});

	describe("addComment", () => {
		it("should add a comment to section changes", async () => {
			const changes = mockDocDraftSectionChanges({
				id: 1,
				comments: [],
			});

			const newComment: DocDraftSectionComment = {
				content: "This is a comment",
				userId: 1,
				timestamp: "2025-01-01T00:00:00Z",
			};

			const updatedChanges = mockDocDraftSectionChanges({
				id: 1,
				comments: [newComment],
			});

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => changes,
			} as never);

			vi.mocked(mockModel.update).mockResolvedValue([1] as never);

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => updatedChanges,
			} as never);

			const result = await dao.addComment(1, newComment);

			expect(mockModel.update).toHaveBeenCalledWith({ comments: [newComment] }, { where: { id: 1 } });
			expect(result?.comments).toHaveLength(1);
			expect(result?.comments[0]).toEqual(newComment);
		});

		it("should append comment to existing comments", async () => {
			const existingComment: DocDraftSectionComment = {
				content: "First comment",
				userId: 1,
				timestamp: "2025-01-01T00:00:00Z",
			};

			const changes = mockDocDraftSectionChanges({
				id: 1,
				comments: [existingComment],
			});

			const newComment: DocDraftSectionComment = {
				content: "Second comment",
				userId: 2,
				timestamp: "2025-01-02T00:00:00Z",
			};

			const updatedChanges = mockDocDraftSectionChanges({
				id: 1,
				comments: [existingComment, newComment],
			});

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => changes,
			} as never);

			vi.mocked(mockModel.update).mockResolvedValue([1] as never);

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => updatedChanges,
			} as never);

			const result = await dao.addComment(1, newComment);

			expect(result?.comments).toHaveLength(2);
			expect(result?.comments[1]).toEqual(newComment);
		});

		it("should return undefined if section changes not found", async () => {
			vi.mocked(mockModel.findOne).mockResolvedValue(null);

			const newComment: DocDraftSectionComment = {
				content: "Test comment",
				userId: 1,
				timestamp: "2025-01-01T00:00:00Z",
			};

			const result = await dao.addComment(999, newComment);

			expect(result).toBeUndefined();
			expect(mockModel.update).not.toHaveBeenCalled();
		});
	});

	describe("addProposedChange", () => {
		it("should add a proposed change to section changes", async () => {
			const changes = mockDocDraftSectionChanges({
				id: 1,
				proposed: [],
			});

			const newChange: DocDraftSectionChange = {
				for: "content",
				who: { type: "agent", id: 1 },
				description: "Add new section",
				value: "New section content",
				appliedAt: undefined,
			};

			const updatedChanges = mockDocDraftSectionChanges({
				id: 1,
				proposed: [newChange],
			});

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => changes,
			} as never);

			vi.mocked(mockModel.update).mockResolvedValue([1] as never);

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => updatedChanges,
			} as never);

			const result = await dao.addProposedChange(1, newChange);

			expect(mockModel.update).toHaveBeenCalledWith({ proposed: [newChange] }, { where: { id: 1 } });
			expect(result?.proposed).toHaveLength(1);
			expect(result?.proposed[0]).toEqual(newChange);
		});

		it("should append proposed change to existing changes", async () => {
			const existingChange: DocDraftSectionChange = {
				for: "content",
				who: { type: "user", id: 1 },
				description: "First change",
				value: "First value",
				appliedAt: undefined,
			};

			const changes = mockDocDraftSectionChanges({
				id: 1,
				proposed: [existingChange],
			});

			const newChange: DocDraftSectionChange = {
				for: "content",
				who: { type: "agent", id: 2 },
				description: "Second change",
				value: "Second value",
				appliedAt: undefined,
			};

			const updatedChanges = mockDocDraftSectionChanges({
				id: 1,
				proposed: [existingChange, newChange],
			});

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => changes,
			} as never);

			vi.mocked(mockModel.update).mockResolvedValue([1] as never);

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => updatedChanges,
			} as never);

			const result = await dao.addProposedChange(1, newChange);

			expect(result?.proposed).toHaveLength(2);
			expect(result?.proposed[1]).toEqual(newChange);
		});

		it("should return undefined if section changes not found", async () => {
			vi.mocked(mockModel.findOne).mockResolvedValue(null);

			const newChange: DocDraftSectionChange = {
				for: "content",
				who: { type: "agent", id: 1 },
				description: "Test change",
				value: "Test value",
				appliedAt: undefined,
			};

			const result = await dao.addProposedChange(999, newChange);

			expect(result).toBeUndefined();
			expect(mockModel.update).not.toHaveBeenCalled();
		});
	});

	describe("dismissDocDraftSectionChange", () => {
		it("should dismiss a section change", async () => {
			const changes = mockDocDraftSectionChanges({
				id: 1,
				dismissed: false,
				dismissedAt: null,
				dismissedBy: null,
			});

			const dismissedChanges = mockDocDraftSectionChanges({
				id: 1,
				dismissed: true,
				dismissedAt: new Date("2025-01-15T10:00:00Z"),
				dismissedBy: 123,
			});

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => changes,
			} as never);

			vi.mocked(mockModel.update).mockResolvedValue([1] as never);

			vi.mocked(mockModel.findOne).mockResolvedValueOnce({
				get: () => dismissedChanges,
			} as never);

			const result = await dao.dismissDocDraftSectionChange(1, 123);

			expect(result?.dismissed).toBe(true);
			expect(result?.dismissedBy).toBe(123);
			expect(result?.dismissedAt).toEqual(new Date("2025-01-15T10:00:00Z"));
		});

		it("should return undefined if section changes not found", async () => {
			vi.mocked(mockModel.findOne).mockResolvedValue(null);

			const result = await dao.dismissDocDraftSectionChange(999, 123);

			expect(result).toBeUndefined();
			expect(mockModel.update).not.toHaveBeenCalled();
		});
	});

	describe("deleteDocDraftSectionChanges", () => {
		it("should delete section changes", async () => {
			vi.mocked(mockModel.destroy).mockResolvedValue(1);

			const result = await dao.deleteDocDraftSectionChanges(1);

			expect(mockModel.destroy).toHaveBeenCalledWith({ where: { id: 1 } });
			expect(result).toBe(true);
		});

		it("should return false if section changes not found", async () => {
			vi.mocked(mockModel.destroy).mockResolvedValue(0);

			const result = await dao.deleteDocDraftSectionChanges(999);

			expect(result).toBe(false);
		});
	});

	describe("deleteByDraftId", () => {
		it("should delete all section changes for a draft", async () => {
			vi.mocked(mockModel.destroy).mockResolvedValue(3);

			const result = await dao.deleteByDraftId(1);

			expect(mockModel.destroy).toHaveBeenCalledWith({ where: { draftId: 1 } });
			expect(result).toBe(3);
		});

		it("should return 0 if no section changes found", async () => {
			vi.mocked(mockModel.destroy).mockResolvedValue(0);

			const result = await dao.deleteByDraftId(999);

			expect(result).toBe(0);
		});
	});

	describe("deleteAllDocDraftSectionChanges", () => {
		it("should delete all section changes", async () => {
			vi.mocked(mockModel.destroy).mockResolvedValue(10);

			await dao.deleteAllDocDraftSectionChanges();

			expect(mockModel.destroy).toHaveBeenCalledWith({ where: {} });
		});
	});
});

describe("createDocDraftSectionChangesDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as DocDraftSectionChangesDao;
		const provider = createDocDraftSectionChangesDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context docDraftSectionChangesDao when context has database", () => {
		const defaultDao = {} as DocDraftSectionChangesDao;
		const contextDao = {} as DocDraftSectionChangesDao;
		const context = {
			database: {
				docDraftSectionChangesDao: contextDao,
			},
		} as TenantOrgContext;

		const provider = createDocDraftSectionChangesDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextDao);
	});
});
