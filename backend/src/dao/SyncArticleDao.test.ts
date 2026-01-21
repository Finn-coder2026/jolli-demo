import type { SyncArticle } from "../model/SyncArticle";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { createSyncArticleDao, createSyncArticleDaoProvider, type SyncArticleDao } from "./SyncArticleDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("SyncArticleDao", () => {
	let mockSyncArticles: ModelDef<SyncArticle>;
	let mockSequelize: Sequelize;
	let syncArticleDao: SyncArticleDao;

	beforeEach(() => {
		mockSyncArticles = {
			findByPk: vi.fn(),
			findAll: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<SyncArticle>;

		mockSequelize = {
			define: vi.fn().mockReturnValue(mockSyncArticles),
			query: vi.fn(),
			literal: vi.fn().mockImplementation(str => str),
		} as unknown as Sequelize;

		syncArticleDao = createSyncArticleDao(mockSequelize);
	});

	describe("postSync", () => {
		it("should create sequence and index", async () => {
			vi.mocked(mockSequelize.query).mockResolvedValue([[], undefined]);

			// Access the postSync hook
			const daoWithHook = syncArticleDao as SyncArticleDao & { postSync: () => Promise<void> };
			await daoWithHook.postSync();

			expect(mockSequelize.query).toHaveBeenCalledWith(
				expect.stringContaining("CREATE SEQUENCE IF NOT EXISTS sync_articles_cursor_seq"),
			);
			expect(mockSequelize.query).toHaveBeenCalledWith(
				expect.stringContaining("CREATE INDEX IF NOT EXISTS sync_articles_last_seq_idx"),
			);
		});
	});

	describe("getSyncArticle", () => {
		it("should return sync article when found", async () => {
			const syncArticle: SyncArticle = {
				docJrn: "jrn:/global:docs:article/sync-test",
				lastSeq: 5,
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(syncArticle),
			};

			vi.mocked(mockSyncArticles.findByPk).mockResolvedValue(mockInstance as never);

			const result = await syncArticleDao.getSyncArticle("jrn:/global:docs:article/sync-test");

			expect(mockSyncArticles.findByPk).toHaveBeenCalledWith("jrn:/global:docs:article/sync-test");
			expect(result).toEqual(syncArticle);
		});

		it("should return undefined when not found", async () => {
			vi.mocked(mockSyncArticles.findByPk).mockResolvedValue(null);

			const result = await syncArticleDao.getSyncArticle("jrn:/global:docs:article/sync-missing");

			expect(result).toBeUndefined();
		});
	});

	describe("upsertSyncArticle", () => {
		it("should insert and return sync article with new cursor", async () => {
			vi.mocked(mockSequelize.query).mockResolvedValue([[{ last_seq: "10" }], undefined] as never);

			const result = await syncArticleDao.upsertSyncArticle("jrn:/global:docs:article/sync-test");

			expect(mockSequelize.query).toHaveBeenCalledWith(
				expect.stringContaining("INSERT INTO sync_articles"),
				expect.objectContaining({
					replacements: { docJrn: "jrn:/global:docs:article/sync-test" },
				}),
			);
			expect(result).toEqual({
				docJrn: "jrn:/global:docs:article/sync-test",
				lastSeq: 10,
			});
		});
	});

	describe("getSyncArticlesSince", () => {
		it("should return articles with lastSeq greater than cursor", async () => {
			const articles: Array<SyncArticle> = [
				{ docJrn: "jrn:/global:docs:article/sync-1", lastSeq: 3 },
				{ docJrn: "jrn:/global:docs:article/sync-2", lastSeq: 4 },
			];

			const mockInstances = articles.map(a => ({
				get: vi.fn().mockReturnValue(a),
			}));

			vi.mocked(mockSyncArticles.findAll).mockResolvedValue(mockInstances as never);

			const result = await syncArticleDao.getSyncArticlesSince(2);

			expect(mockSyncArticles.findAll).toHaveBeenCalledWith({
				where: "last_seq > 2",
				order: [["lastSeq", "ASC"]],
			});
			expect(result).toEqual(articles);
		});
	});

	describe("getCurrentCursor", () => {
		it("should return current cursor value", async () => {
			vi.mocked(mockSequelize.query).mockResolvedValue([[{ last_value: "15" }], undefined] as never);

			const result = await syncArticleDao.getCurrentCursor();

			expect(mockSequelize.query).toHaveBeenCalledWith("SELECT last_value FROM sync_articles_cursor_seq");
			expect(result).toBe(15);
		});

		it("should return 0 when sequence is empty", async () => {
			vi.mocked(mockSequelize.query).mockResolvedValue([[], undefined] as never);

			const result = await syncArticleDao.getCurrentCursor();

			expect(result).toBe(0);
		});
	});

	describe("advanceCursor", () => {
		it("should upsert and return new cursor value", async () => {
			vi.mocked(mockSequelize.query).mockResolvedValue([[{ last_seq: "20" }], undefined] as never);

			const result = await syncArticleDao.advanceCursor("jrn:/global:docs:article/sync-test");

			expect(result).toBe(20);
		});
	});

	describe("deleteAllSyncArticles", () => {
		it("should delete all sync articles and reset sequence", async () => {
			vi.mocked(mockSyncArticles.destroy).mockResolvedValue(5);
			vi.mocked(mockSequelize.query).mockResolvedValue([[], undefined] as never);

			await syncArticleDao.deleteAllSyncArticles();

			expect(mockSyncArticles.destroy).toHaveBeenCalledWith({ where: {} });
			expect(mockSequelize.query).toHaveBeenCalledWith(
				"ALTER SEQUENCE IF EXISTS sync_articles_cursor_seq RESTART WITH 1",
			);
		});
	});
});

describe("createSyncArticleDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as SyncArticleDao;
		const provider = createSyncArticleDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context syncArticleDao when context has database", () => {
		const defaultDao = {} as SyncArticleDao;
		const contextSyncArticleDao = {} as SyncArticleDao;
		const context = {
			database: {
				syncArticleDao: contextSyncArticleDao,
			},
		} as TenantOrgContext;

		const provider = createSyncArticleDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextSyncArticleDao);
	});
});
