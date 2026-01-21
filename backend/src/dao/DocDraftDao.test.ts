import type { DocDraft } from "../model/DocDraft";
import { mockDocDraft, mockNewDocDraft } from "../model/DocDraft.mock";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { createDocDraftDao, createDocDraftDaoProvider, type DocDraftDao } from "./DocDraftDao";
import type { DocDraftSectionChangesDao } from "./DocDraftSectionChangesDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DocDraftDao", () => {
	let mockDocDrafts: ModelDef<DocDraft>;
	let mockDocDraftSectionChangesDao: DocDraftSectionChangesDao;
	let docDraftDao: DocDraftDao;

	beforeEach(() => {
		mockDocDrafts = {
			create: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
			count: vi.fn(),
		} as unknown as ModelDef<DocDraft>;

		mockDocDraftSectionChangesDao = {
			deleteByDraftId: vi.fn().mockResolvedValue(0),
		} as unknown as DocDraftSectionChangesDao;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockDocDrafts),
		} as unknown as Sequelize;

		docDraftDao = createDocDraftDao(mockSequelize, mockDocDraftSectionChangesDao);
	});

	describe("createDocDraft", () => {
		it("should create a draft", async () => {
			const newDraft = mockNewDocDraft({
				docId: undefined,
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
			});

			const createdDraft = mockDocDraft({
				...newDraft,
				id: 1,
			});

			vi.mocked(mockDocDrafts.create).mockResolvedValue(createdDraft as never);

			const result = await docDraftDao.createDocDraft(newDraft);

			expect(mockDocDrafts.create).toHaveBeenCalledWith(newDraft);
			expect(result).toEqual(createdDraft);
		});
	});

	describe("getDocDraft", () => {
		it("should return a draft by ID", async () => {
			const draft = mockDocDraft({ id: 1 });
			const mockGet = vi.fn().mockReturnValue(draft);

			vi.mocked(mockDocDrafts.findOne).mockResolvedValue({
				get: mockGet,
			} as never);

			const result = await docDraftDao.getDocDraft(1);

			expect(mockDocDrafts.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
			expect(mockGet).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(draft);
		});

		it("should return undefined if draft not found", async () => {
			vi.mocked(mockDocDrafts.findOne).mockResolvedValue(null);

			const result = await docDraftDao.getDocDraft(999);

			expect(result).toBeUndefined();
		});
	});

	describe("listDocDrafts", () => {
		it("should list all drafts with default ordering", async () => {
			const drafts = [mockDocDraft({ id: 1 }), mockDocDraft({ id: 2 })];

			vi.mocked(mockDocDrafts.findAll).mockResolvedValue([
				{ get: () => drafts[0] },
				{ get: () => drafts[1] },
			] as never);

			const result = await docDraftDao.listDocDrafts();

			expect(mockDocDrafts.findAll).toHaveBeenCalledWith({
				order: [["updatedAt", "DESC"]],
			});
			expect(result).toHaveLength(2);
		});

		it("should list drafts with pagination", async () => {
			const drafts = [mockDocDraft({ id: 1 })];

			vi.mocked(mockDocDrafts.findAll).mockResolvedValue([{ get: () => drafts[0] }] as never);

			const result = await docDraftDao.listDocDrafts(10, 5);

			expect(mockDocDrafts.findAll).toHaveBeenCalledWith({
				order: [["updatedAt", "DESC"]],
				limit: 10,
				offset: 5,
			});
			expect(result).toHaveLength(1);
		});
	});

	describe("listDocDraftsByUser", () => {
		it("should list drafts for a specific user", async () => {
			const drafts = [mockDocDraft({ id: 1, createdBy: 1 })];

			vi.mocked(mockDocDrafts.findAll).mockResolvedValue([{ get: () => drafts[0] }] as never);

			const result = await docDraftDao.listDocDraftsByUser(1);

			expect(mockDocDrafts.findAll).toHaveBeenCalledWith({
				where: { createdBy: 1 },
				order: [["updatedAt", "DESC"]],
			});
			expect(result).toHaveLength(1);
		});

		it("should list user drafts with pagination", async () => {
			const drafts = [mockDocDraft({ id: 1, createdBy: 1 })];

			vi.mocked(mockDocDrafts.findAll).mockResolvedValue([{ get: () => drafts[0] }] as never);

			const result = await docDraftDao.listDocDraftsByUser(1, 5, 0);

			expect(mockDocDrafts.findAll).toHaveBeenCalledWith({
				where: { createdBy: 1 },
				order: [["updatedAt", "DESC"]],
				limit: 5,
				offset: 0,
			});
			expect(result).toHaveLength(1);
		});
	});

	describe("findByDocId", () => {
		it("should find drafts for a specific document", async () => {
			const drafts = [mockDocDraft({ id: 1, docId: 5 })];

			vi.mocked(mockDocDrafts.findAll).mockResolvedValue([{ get: () => drafts[0] }] as never);

			const result = await docDraftDao.findByDocId(5);

			expect(mockDocDrafts.findAll).toHaveBeenCalledWith({
				where: { docId: 5 },
				order: [["updatedAt", "DESC"]],
			});
			expect(result).toHaveLength(1);
		});
	});

	describe("updateDocDraft", () => {
		it("should update a draft", async () => {
			const draft = mockDocDraft({ id: 1, title: "Old Title" });
			const updatedDraft = mockDocDraft({ id: 1, title: "New Title" });
			const mockGet = vi.fn().mockReturnValue(draft);

			vi.mocked(mockDocDrafts.findOne).mockResolvedValueOnce({
				get: mockGet,
			} as never);

			vi.mocked(mockDocDrafts.update).mockResolvedValue([1] as never);

			vi.mocked(mockDocDrafts.findOne).mockResolvedValueOnce({
				get: () => updatedDraft,
			} as never);

			const result = await docDraftDao.updateDocDraft(1, { title: "New Title" });

			expect(mockDocDrafts.update).toHaveBeenCalledWith({ title: "New Title" }, { where: { id: 1 } });
			expect(result).toEqual(updatedDraft);
		});

		it("should return undefined if draft not found", async () => {
			vi.mocked(mockDocDrafts.findOne).mockResolvedValue(null);

			const result = await docDraftDao.updateDocDraft(999, { title: "New Title" });

			expect(result).toBeUndefined();
			expect(mockDocDrafts.update).not.toHaveBeenCalled();
		});
	});

	describe("deleteDocDraft", () => {
		it("should delete a draft", async () => {
			vi.mocked(mockDocDrafts.destroy).mockResolvedValue(1);
			vi.mocked(mockDocDraftSectionChangesDao.deleteByDraftId).mockResolvedValue(2);

			const result = await docDraftDao.deleteDocDraft(1);

			// Verify section changes are deleted first
			expect(mockDocDraftSectionChangesDao.deleteByDraftId).toHaveBeenCalledWith(1);
			expect(mockDocDrafts.destroy).toHaveBeenCalledWith({ where: { id: 1 } });
			expect(result).toBe(true);
		});

		it("should return false if draft not found", async () => {
			vi.mocked(mockDocDrafts.destroy).mockResolvedValue(0);
			vi.mocked(mockDocDraftSectionChangesDao.deleteByDraftId).mockResolvedValue(0);

			const result = await docDraftDao.deleteDocDraft(999);

			// Section changes deletion should still be attempted
			expect(mockDocDraftSectionChangesDao.deleteByDraftId).toHaveBeenCalledWith(999);
			expect(result).toBe(false);
		});

		it("should delete associated section changes when deleting draft", async () => {
			vi.mocked(mockDocDrafts.destroy).mockResolvedValue(1);
			vi.mocked(mockDocDraftSectionChangesDao.deleteByDraftId).mockResolvedValue(3);

			await docDraftDao.deleteDocDraft(1);

			// Verify the cascading delete was called
			expect(mockDocDraftSectionChangesDao.deleteByDraftId).toHaveBeenCalledWith(1);
			// Verify it was called before the draft deletion
			const deleteByDraftIdCallOrder = vi.mocked(mockDocDraftSectionChangesDao.deleteByDraftId).mock
				.invocationCallOrder[0];
			const destroyCallOrder = vi.mocked(mockDocDrafts.destroy).mock.invocationCallOrder[0];
			expect(deleteByDraftIdCallOrder).toBeLessThan(destroyCallOrder);
		});
	});

	describe("deleteAllDocDrafts", () => {
		it("should delete all drafts", async () => {
			vi.mocked(mockDocDrafts.destroy).mockResolvedValue(5);

			await docDraftDao.deleteAllDocDrafts();

			expect(mockDocDrafts.destroy).toHaveBeenCalledWith({ where: {} });
		});
	});

	describe("getDraftsWithPendingChanges", () => {
		it("should return drafts with pending section changes", async () => {
			const mockSequelize = {
				define: vi.fn().mockReturnValue(mockDocDrafts),
				query: vi.fn().mockResolvedValue([
					{
						id: 1,
						doc_id: 100,
						title: "Test Draft",
						content: "Content",
						created_by: 1,
						createdAt: new Date("2025-01-01"),
						updatedAt: new Date("2025-01-02"),
						content_last_edited_at: new Date("2025-01-03"),
						content_last_edited_by: 2,
						content_metadata: { foo: "bar" },
						pendingChangesCount: "3",
						lastChangeUpdatedAt: new Date("2025-01-04"),
					},
				]),
			} as unknown as Sequelize;

			const dao = createDocDraftDao(mockSequelize, mockDocDraftSectionChangesDao);
			const result = await dao.getDraftsWithPendingChanges();

			expect(mockSequelize.query).toHaveBeenCalled();
			expect(result).toHaveLength(1);
			expect(result[0].draft.id).toBe(1);
			expect(result[0].draft.docId).toBe(100);
			expect(result[0].draft.title).toBe("Test Draft");
			expect(result[0].pendingChangesCount).toBe(3);
			expect(result[0].lastChangeUpdatedAt).toEqual(new Date("2025-01-04"));
		});

		it("should return empty array when no drafts have pending changes", async () => {
			const mockSequelize = {
				define: vi.fn().mockReturnValue(mockDocDrafts),
				query: vi.fn().mockResolvedValue([]),
			} as unknown as Sequelize;

			const dao = createDocDraftDao(mockSequelize, mockDocDraftSectionChangesDao);
			const result = await dao.getDraftsWithPendingChanges();

			expect(result).toEqual([]);
		});
	});

	describe("searchDocDraftsByTitle", () => {
		it("should search drafts by title for specific user", async () => {
			const draft1 = mockDocDraft({ id: 1, title: "My Test Article", createdBy: 1 });
			const draft2 = mockDocDraft({ id: 2, title: "Another Test Article", createdBy: 1 });

			const mockDraftInstances = [
				{ get: vi.fn().mockReturnValue(draft1) },
				{ get: vi.fn().mockReturnValue(draft2) },
			];

			vi.mocked(mockDocDrafts.findAll).mockResolvedValue(mockDraftInstances as never);

			const result = await docDraftDao.searchDocDraftsByTitle("test", 1);

			expect(mockDocDrafts.findAll).toHaveBeenCalledWith({
				where: expect.objectContaining({
					createdBy: 1,
					title: expect.objectContaining({}),
				}),
				order: [["updatedAt", "DESC"]],
			});
			expect(result).toEqual([draft1, draft2]);
		});

		it("should return empty array when no matches found", async () => {
			vi.mocked(mockDocDrafts.findAll).mockResolvedValue([]);

			const result = await docDraftDao.searchDocDraftsByTitle("nonexistent", 1);

			expect(result).toEqual([]);
		});
	});

	describe("listAccessibleDrafts", () => {
		it("should list drafts accessible to user", async () => {
			const drafts = [mockDocDraft({ id: 1, createdBy: 1 }), mockDocDraft({ id: 2, isShared: true })];

			vi.mocked(mockDocDrafts.findAll).mockResolvedValue([
				{ get: () => drafts[0] },
				{ get: () => drafts[1] },
			] as never);

			const result = await docDraftDao.listAccessibleDrafts(1);

			expect(mockDocDrafts.findAll).toHaveBeenCalled();
			expect(result).toHaveLength(2);
		});

		it("should list accessible drafts with pagination", async () => {
			const drafts = [mockDocDraft({ id: 1 })];

			vi.mocked(mockDocDrafts.findAll).mockResolvedValue([{ get: () => drafts[0] }] as never);

			const result = await docDraftDao.listAccessibleDrafts(1, 10, 5);

			expect(mockDocDrafts.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 10,
					offset: 5,
				}),
			);
			expect(result).toHaveLength(1);
		});
	});

	describe("findDraftsByExactTitle", () => {
		it("should find new drafts by exact title match", async () => {
			const drafts = [mockDocDraft({ id: 1, title: "Test Article", docId: undefined })];

			vi.mocked(mockDocDrafts.findAll).mockResolvedValue([{ get: () => drafts[0] }] as never);

			const result = await docDraftDao.findDraftsByExactTitle("Test Article");

			expect(mockDocDrafts.findAll).toHaveBeenCalled();
			expect(result).toHaveLength(1);
			expect(result[0].title).toBe("Test Article");
		});

		it("should return empty array when no matches", async () => {
			vi.mocked(mockDocDrafts.findAll).mockResolvedValue([]);

			const result = await docDraftDao.findDraftsByExactTitle("Nonexistent");

			expect(result).toEqual([]);
		});
	});

	describe("findDraftByDocId", () => {
		it("should find draft for a specific document", async () => {
			const draft = mockDocDraft({ id: 1, docId: 100 });

			vi.mocked(mockDocDrafts.findOne).mockResolvedValue({
				get: () => draft,
			} as never);

			const result = await docDraftDao.findDraftByDocId(100);

			expect(mockDocDrafts.findOne).toHaveBeenCalledWith({
				where: { docId: 100 },
				order: [["updatedAt", "DESC"]],
			});
			expect(result).toEqual(draft);
		});

		it("should return undefined if no draft found", async () => {
			vi.mocked(mockDocDrafts.findOne).mockResolvedValue(null);

			const result = await docDraftDao.findDraftByDocId(999);

			expect(result).toBeUndefined();
		});
	});

	describe("shareDraft", () => {
		it("should share a draft", async () => {
			const draft = mockDocDraft({ id: 1, isShared: false });
			const sharedDraft = mockDocDraft({ id: 1, isShared: true, sharedBy: 2 });

			vi.mocked(mockDocDrafts.findOne).mockResolvedValueOnce({
				get: () => draft,
			} as never);

			vi.mocked(mockDocDrafts.update).mockResolvedValue([1] as never);

			vi.mocked(mockDocDrafts.findOne).mockResolvedValueOnce({
				get: () => sharedDraft,
			} as never);

			const result = await docDraftDao.shareDraft(1, 2);

			expect(mockDocDrafts.update).toHaveBeenCalledWith(
				expect.objectContaining({
					isShared: true,
					sharedBy: 2,
				}),
				{ where: { id: 1 } },
			);
			expect(result?.isShared).toBe(true);
		});

		it("should return undefined if draft not found", async () => {
			vi.mocked(mockDocDrafts.findOne).mockResolvedValue(null);

			const result = await docDraftDao.shareDraft(999, 1);

			expect(result).toBeUndefined();
		});
	});

	describe("listSharedDrafts", () => {
		it("should list shared drafts for user", async () => {
			const drafts = [mockDocDraft({ id: 1, isShared: true, createdBy: 2 })];

			vi.mocked(mockDocDrafts.findAll).mockResolvedValue([{ get: () => drafts[0] }] as never);

			const result = await docDraftDao.listSharedDrafts(1);

			expect(mockDocDrafts.findAll).toHaveBeenCalled();
			expect(result).toHaveLength(1);
		});

		it("should list shared drafts with pagination", async () => {
			const drafts = [mockDocDraft({ id: 1, isShared: true })];

			vi.mocked(mockDocDrafts.findAll).mockResolvedValue([{ get: () => drafts[0] }] as never);

			const result = await docDraftDao.listSharedDrafts(1, 5, 10);

			expect(mockDocDrafts.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 5,
					offset: 10,
				}),
			);
			expect(result).toHaveLength(1);
		});
	});

	describe("countMyNewDrafts", () => {
		it("should count user's unshared new drafts", async () => {
			vi.mocked(mockDocDrafts.count).mockResolvedValue(5);

			const result = await docDraftDao.countMyNewDrafts(1);

			expect(mockDocDrafts.count).toHaveBeenCalled();
			expect(result).toBe(5);
		});
	});

	describe("countMySharedNewDrafts", () => {
		it("should count user's shared new drafts", async () => {
			vi.mocked(mockDocDrafts.count).mockResolvedValue(3);

			const result = await docDraftDao.countMySharedNewDrafts(1);

			expect(mockDocDrafts.count).toHaveBeenCalled();
			expect(result).toBe(3);
		});
	});

	describe("countSharedWithMeDrafts", () => {
		it("should count drafts shared with user", async () => {
			vi.mocked(mockDocDrafts.count).mockResolvedValue(3);

			const result = await docDraftDao.countSharedWithMeDrafts(1);

			expect(mockDocDrafts.count).toHaveBeenCalled();
			expect(result).toBe(3);
		});
	});

	describe("countArticlesWithAgentSuggestions", () => {
		it("should count articles with agent suggestions", async () => {
			const mockSequelize = {
				define: vi.fn().mockReturnValue(mockDocDrafts),
				query: vi.fn().mockResolvedValue([{ count: "7" }]),
			} as unknown as Sequelize;

			const dao = createDocDraftDao(mockSequelize, mockDocDraftSectionChangesDao);
			const result = await dao.countArticlesWithAgentSuggestions();

			expect(mockSequelize.query).toHaveBeenCalled();
			expect(result).toBe(7);
		});

		it("should return 0 when no articles with suggestions", async () => {
			const mockSequelize = {
				define: vi.fn().mockReturnValue(mockDocDrafts),
				query: vi.fn().mockResolvedValue([]),
			} as unknown as Sequelize;

			const dao = createDocDraftDao(mockSequelize, mockDocDraftSectionChangesDao);
			const result = await dao.countArticlesWithAgentSuggestions();

			expect(result).toBe(0);
		});
	});
});

describe("createDocDraftDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as DocDraftDao;
		const provider = createDocDraftDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context docDraftDao when context has database", () => {
		const defaultDao = {} as DocDraftDao;
		const contextDocDraftDao = {} as DocDraftDao;
		const context = {
			database: {
				docDraftDao: contextDocDraftDao,
			},
		} as TenantOrgContext;

		const provider = createDocDraftDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextDocDraftDao);
	});
});
