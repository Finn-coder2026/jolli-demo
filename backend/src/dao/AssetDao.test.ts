import type { Asset, NewAsset } from "../model/Asset";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { type AssetDao, createAssetDao, createAssetDaoProvider } from "./AssetDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

function mockAsset(overrides: Partial<Asset> = {}): Asset {
	return {
		id: 1,
		s3Key: "tenant/org/_default/abc123.png",
		assetType: "image",
		mimeType: "image/png",
		size: 1024,
		originalFilename: null,
		uploadedBy: 1,
		status: "active",
		createdAt: new Date("2024-01-01"),
		updatedAt: new Date("2024-01-01"),
		deletedAt: null,
		...overrides,
	};
}

describe("AssetDao", () => {
	let mockAssets: ModelDef<Asset>;
	let assetDao: AssetDao;

	beforeEach(() => {
		mockAssets = {
			create: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<Asset>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockAssets),
		} as unknown as Sequelize;

		assetDao = createAssetDao(mockSequelize);
	});

	describe("createAsset", () => {
		it("should create an asset with default status", async () => {
			const newAsset: NewAsset = {
				s3Key: "tenant/org/_default/abc123.png",
				assetType: "image",
				mimeType: "image/png",
				size: 1024,
				originalFilename: "test.png",
				uploadedBy: 1,
			};

			const createdAsset = mockAsset({ ...newAsset, id: 1 });
			const mockInstance = { get: vi.fn().mockReturnValue(createdAsset) };
			vi.mocked(mockAssets.create).mockResolvedValue(mockInstance as never);

			const result = await assetDao.createAsset(newAsset);

			expect(mockAssets.create).toHaveBeenCalledWith({
				...newAsset,
				status: "active",
			});
			expect(result).toEqual(createdAsset);
		});

		it("should create an asset with specified status", async () => {
			const newAsset: NewAsset = {
				s3Key: "tenant/org/_default/abc123.png",
				assetType: "image",
				mimeType: "image/png",
				size: 1024,
				originalFilename: null,
				uploadedBy: 1,
				status: "orphaned",
			};

			const createdAsset = mockAsset({ ...newAsset, id: 1 });
			const mockInstance = { get: vi.fn().mockReturnValue(createdAsset) };
			vi.mocked(mockAssets.create).mockResolvedValue(mockInstance as never);

			const result = await assetDao.createAsset(newAsset);

			expect(mockAssets.create).toHaveBeenCalledWith({
				...newAsset,
				status: "orphaned",
			});
			expect(result).toEqual(createdAsset);
		});
	});

	describe("findByS3Key", () => {
		it("should return asset when found", async () => {
			const asset = mockAsset();
			const mockInstance = { get: vi.fn().mockReturnValue(asset) };
			vi.mocked(mockAssets.findOne).mockResolvedValue(mockInstance as never);

			const result = await assetDao.findByS3Key("tenant/org/_default/abc123.png");

			expect(mockAssets.findOne).toHaveBeenCalledWith({
				where: { s3Key: "tenant/org/_default/abc123.png", deletedAt: null },
			});
			expect(result).toEqual(asset);
		});

		it("should return undefined when not found", async () => {
			vi.mocked(mockAssets.findOne).mockResolvedValue(null);

			const result = await assetDao.findByS3Key("tenant/org/_default/nonexistent.png");

			expect(result).toBeUndefined();
		});
	});

	describe("findById", () => {
		it("should return asset when found", async () => {
			const asset = mockAsset();
			const mockInstance = { get: vi.fn().mockReturnValue(asset) };
			vi.mocked(mockAssets.findOne).mockResolvedValue(mockInstance as never);

			const result = await assetDao.findById(1);

			expect(mockAssets.findOne).toHaveBeenCalledWith({
				where: { id: 1, deletedAt: null },
			});
			expect(result).toEqual(asset);
		});

		it("should return undefined when not found", async () => {
			vi.mocked(mockAssets.findOne).mockResolvedValue(null);

			const result = await assetDao.findById(999);

			expect(result).toBeUndefined();
		});
	});

	describe("listAssets", () => {
		it("should return all non-deleted assets ordered by createdAt DESC", async () => {
			const asset1 = mockAsset({ id: 1, s3Key: "a.png" });
			const asset2 = mockAsset({ id: 2, s3Key: "b.png" });

			const mockInstances = [{ get: vi.fn().mockReturnValue(asset1) }, { get: vi.fn().mockReturnValue(asset2) }];
			vi.mocked(mockAssets.findAll).mockResolvedValue(mockInstances as never);

			const result = await assetDao.listAssets();

			expect(mockAssets.findAll).toHaveBeenCalledWith({
				where: { deletedAt: null },
				order: [["createdAt", "DESC"]],
			});
			expect(result).toEqual([asset1, asset2]);
		});

		it("should filter by status when provided", async () => {
			const asset = mockAsset({ status: "orphaned" });
			const mockInstance = { get: vi.fn().mockReturnValue(asset) };
			vi.mocked(mockAssets.findAll).mockResolvedValue([mockInstance] as never);

			const result = await assetDao.listAssets({ status: "orphaned" });

			expect(mockAssets.findAll).toHaveBeenCalledWith({
				where: { deletedAt: null, status: "orphaned" },
				order: [["createdAt", "DESC"]],
			});
			expect(result).toEqual([asset]);
		});

		it("should include deleted assets when includeDeleted is true", async () => {
			const asset = mockAsset({ deletedAt: new Date() });
			const mockInstance = { get: vi.fn().mockReturnValue(asset) };
			vi.mocked(mockAssets.findAll).mockResolvedValue([mockInstance] as never);

			const result = await assetDao.listAssets({ includeDeleted: true });

			expect(mockAssets.findAll).toHaveBeenCalledWith({
				where: {},
				order: [["createdAt", "DESC"]],
			});
			expect(result).toEqual([asset]);
		});

		it("should return empty array when no assets exist", async () => {
			vi.mocked(mockAssets.findAll).mockResolvedValue([]);

			const result = await assetDao.listAssets();

			expect(result).toEqual([]);
		});
	});

	describe("listByUploader", () => {
		it("should return assets uploaded by specific user", async () => {
			const asset = mockAsset({ uploadedBy: 42 });
			const mockInstance = { get: vi.fn().mockReturnValue(asset) };
			vi.mocked(mockAssets.findAll).mockResolvedValue([mockInstance] as never);

			const result = await assetDao.listByUploader(42);

			expect(mockAssets.findAll).toHaveBeenCalledWith({
				where: { uploadedBy: 42, deletedAt: null },
				order: [["createdAt", "DESC"]],
			});
			expect(result).toEqual([asset]);
		});

		it("should return empty array when user has no assets", async () => {
			vi.mocked(mockAssets.findAll).mockResolvedValue([]);

			const result = await assetDao.listByUploader(999);

			expect(result).toEqual([]);
		});
	});

	describe("updateStatus", () => {
		it("should update status and return updated asset", async () => {
			const updatedAsset = mockAsset({ status: "orphaned" });
			const mockInstance = { get: vi.fn().mockReturnValue(updatedAsset) };

			vi.mocked(mockAssets.update).mockResolvedValue([1] as never);
			vi.mocked(mockAssets.findOne).mockResolvedValue(mockInstance as never);

			const result = await assetDao.updateStatus("tenant/org/_default/abc123.png", "orphaned");

			expect(mockAssets.update).toHaveBeenCalledWith(
				{ status: "orphaned" },
				{ where: { s3Key: "tenant/org/_default/abc123.png", deletedAt: null } },
			);
			expect(result).toEqual(updatedAsset);
		});

		it("should return undefined when asset not found", async () => {
			vi.mocked(mockAssets.update).mockResolvedValue([0] as never);

			const result = await assetDao.updateStatus("tenant/org/_default/nonexistent.png", "orphaned");

			expect(result).toBeUndefined();
		});
	});

	describe("softDelete", () => {
		it("should set deletedAt and return true", async () => {
			vi.mocked(mockAssets.update).mockResolvedValue([1] as never);

			const result = await assetDao.softDelete("tenant/org/_default/abc123.png");

			expect(mockAssets.update).toHaveBeenCalledWith(
				{ deletedAt: expect.any(Date) },
				{ where: { s3Key: "tenant/org/_default/abc123.png", deletedAt: null } },
			);
			expect(result).toBe(true);
		});

		it("should return false when asset not found", async () => {
			vi.mocked(mockAssets.update).mockResolvedValue([0] as never);

			const result = await assetDao.softDelete("tenant/org/_default/nonexistent.png");

			expect(result).toBe(false);
		});
	});

	describe("hardDelete", () => {
		it("should destroy asset and return true", async () => {
			vi.mocked(mockAssets.destroy).mockResolvedValue(1 as never);

			const result = await assetDao.hardDelete("tenant/org/_default/abc123.png");

			expect(mockAssets.destroy).toHaveBeenCalledWith({ where: { s3Key: "tenant/org/_default/abc123.png" } });
			expect(result).toBe(true);
		});

		it("should return false when asset not found", async () => {
			vi.mocked(mockAssets.destroy).mockResolvedValue(0 as never);

			const result = await assetDao.hardDelete("tenant/org/_default/nonexistent.png");

			expect(result).toBe(false);
		});
	});

	describe("deleteAll", () => {
		it("should delete all assets", async () => {
			vi.mocked(mockAssets.destroy).mockResolvedValue(5 as never);

			await assetDao.deleteAll();

			expect(mockAssets.destroy).toHaveBeenCalledWith({ where: {} });
		});

		it("should not throw when no assets exist", async () => {
			vi.mocked(mockAssets.destroy).mockResolvedValue(0 as never);

			await expect(assetDao.deleteAll()).resolves.not.toThrow();
		});
	});
});

describe("createAssetDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as AssetDao;
		const provider = createAssetDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context assetDao when context has database", () => {
		const defaultDao = {} as AssetDao;
		const contextAssetDao = {} as AssetDao;
		const context = {
			database: {
				assetDao: contextAssetDao,
			},
		} as TenantOrgContext;

		const provider = createAssetDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextAssetDao);
	});
});
