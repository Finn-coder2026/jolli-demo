import type { Database } from "../core/Database";
import type { DocDraftEditHistory, NewDocDraftEditHistory } from "../model/DocDraftEditHistory";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import {
	createDocDraftEditHistoryDao,
	createDocDraftEditHistoryDaoProvider,
	type DocDraftEditHistoryDao,
} from "./DocDraftEditHistoryDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DocDraftEditHistoryDao", () => {
	let mockEditHistory: ModelDef<DocDraftEditHistory>;
	let dao: DocDraftEditHistoryDao;

	beforeEach(() => {
		mockEditHistory = {
			create: vi.fn(),
			findAll: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<DocDraftEditHistory>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockEditHistory),
		} as unknown as Sequelize;

		dao = createDocDraftEditHistoryDao(mockSequelize);
	});

	describe("createEditHistory", () => {
		it("creates an edit history entry", async () => {
			const newEntry: NewDocDraftEditHistory = {
				draftId: 1,
				userId: 1,
				editType: "content",
				description: "Updated section content",
				editedAt: new Date(),
			};

			const createdEntry: DocDraftEditHistory = {
				id: 1,
				...newEntry,
				createdAt: new Date(),
			};

			vi.mocked(mockEditHistory.create).mockResolvedValue(createdEntry as never);

			const result = await dao.createEditHistory(newEntry);

			expect(mockEditHistory.create).toHaveBeenCalledWith(newEntry);
			expect(result).toEqual(createdEntry);
		});
	});

	describe("listByDraftId", () => {
		it("lists edit history entries for a draft", async () => {
			const entries: Array<DocDraftEditHistory> = [
				{
					id: 1,
					draftId: 1,
					userId: 1,
					editType: "content",
					description: "Updated section",
					editedAt: new Date(),
					createdAt: new Date(),
				},
				{
					id: 2,
					draftId: 1,
					userId: 1,
					editType: "title",
					description: "Changed title",
					editedAt: new Date(),
					createdAt: new Date(),
				},
			];

			vi.mocked(mockEditHistory.findAll).mockResolvedValue(entries.map(e => ({ get: () => e })) as never);

			const result = await dao.listByDraftId(1);

			expect(mockEditHistory.findAll).toHaveBeenCalledWith({
				where: { draftId: 1 },
				order: [["editedAt", "DESC"]],
				limit: 50,
			});
			expect(result).toEqual(entries);
		});

		it("uses custom limit when provided", async () => {
			vi.mocked(mockEditHistory.findAll).mockResolvedValue([]);

			await dao.listByDraftId(1, 10);

			expect(mockEditHistory.findAll).toHaveBeenCalledWith({
				where: { draftId: 1 },
				order: [["editedAt", "DESC"]],
				limit: 10,
			});
		});
	});

	describe("deleteByDraftId", () => {
		it("deletes all edit history entries for a draft", async () => {
			vi.mocked(mockEditHistory.destroy).mockResolvedValue(undefined as never);

			await dao.deleteByDraftId(1);

			expect(mockEditHistory.destroy).toHaveBeenCalledWith({ where: { draftId: 1 } });
		});
	});

	describe("deleteAll", () => {
		it("deletes all edit history entries", async () => {
			vi.mocked(mockEditHistory.destroy).mockResolvedValue(undefined as never);

			await dao.deleteAll();

			expect(mockEditHistory.destroy).toHaveBeenCalledWith({ where: {} });
		});
	});

	describe("createDocDraftEditHistoryDaoProvider", () => {
		it("returns default DAO when context is undefined", () => {
			const defaultDao = {} as DocDraftEditHistoryDao;
			const provider = createDocDraftEditHistoryDaoProvider(defaultDao);

			const result = provider.getDao(undefined);

			expect(result).toBe(defaultDao);
		});

		it("returns tenant DAO when context has database with docDraftEditHistoryDao", () => {
			const defaultDao = {} as DocDraftEditHistoryDao;
			const tenantDao = {} as DocDraftEditHistoryDao;
			const context = {
				database: { docDraftEditHistoryDao: tenantDao } as unknown as Database,
			} as TenantOrgContext;
			const provider = createDocDraftEditHistoryDaoProvider(defaultDao);

			const result = provider.getDao(context);

			expect(result).toBe(tenantDao);
		});

		it("returns default DAO when context database has no docDraftEditHistoryDao", () => {
			const defaultDao = {} as DocDraftEditHistoryDao;
			const context = {
				database: {} as unknown as Database,
			} as TenantOrgContext;
			const provider = createDocDraftEditHistoryDaoProvider(defaultDao);

			const result = provider.getDao(context);

			expect(result).toBe(defaultDao);
		});
	});
});
