import type { Database } from "../core/Database";
import type { AssetDao } from "../dao/AssetDao";
import type { DocDao } from "../dao/DocDao";
import type { DocDraftDao } from "../dao/DocDraftDao";
import type { Asset } from "../model/Asset";
import type { ImageStorageService } from "../services/ImageStorageService";
import * as TenantContextModule from "../tenant/TenantContext";
import type { JobContext, JobDefinition } from "../types/JobTypes";
import { CLEANUP_ORPHANED_IMAGES, createAssetCleanupJobs, DETECT_ORPHANED_IMAGES } from "./AssetCleanupJobs";
import type { JobScheduler } from "./JobScheduler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tenant/TenantContext", async () => {
	const actual = await vi.importActual<typeof import("../tenant/TenantContext")>("../tenant/TenantContext");
	return {
		...actual,
		getTenantContext: vi.fn(),
	};
});

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
		orphanedAt: null,
		spaceId: null,
		...overrides,
	};
}

function createMockJobContext(): JobContext {
	return {
		jobId: "test-job-id",
		jobName: "test-job",
		emitEvent: vi.fn().mockResolvedValue(undefined),
		log: vi.fn(),
		updateStats: vi.fn().mockResolvedValue(undefined),
		setCompletionInfo: vi.fn().mockResolvedValue(undefined),
	};
}

function createMockAssetDao(): AssetDao {
	return {
		createAsset: vi.fn(),
		findByS3Key: vi.fn(),
		findByS3KeyWithSpaceAccess: vi.fn(),
		findById: vi.fn(),
		listAssets: vi.fn().mockResolvedValue([]),
		listByUploader: vi.fn(),
		updateStatus: vi.fn(),
		softDelete: vi.fn().mockResolvedValue(true),
		hardDelete: vi.fn(),
		deleteAll: vi.fn(),
		listActiveAssets: vi.fn().mockResolvedValue([]),
		markAsOrphaned: vi.fn().mockResolvedValue(0),
		restoreToActive: vi.fn().mockResolvedValue(0),
		findOrphanedOlderThan: vi.fn().mockResolvedValue([]),
		findRecentlyUploaded: vi.fn().mockResolvedValue([]),
	};
}

function createMockDocDao(): DocDao {
	return {
		createDoc: vi.fn(),
		readDoc: vi.fn(),
		readDocsByJrns: vi.fn().mockResolvedValue(new Map()),
		readDocById: vi.fn(),
		listDocs: vi.fn(),
		updateDoc: vi.fn(),
		updateDocIfVersion: vi.fn(),
		deleteDoc: vi.fn(),
		deleteAllDocs: vi.fn(),
		searchDocsByTitle: vi.fn(),
		getTreeContent: vi.fn(),
		getTrashContent: vi.fn(),
		softDelete: vi.fn(),
		restore: vi.fn(),
		getMaxSortOrder: vi.fn(),
		hasDeletedDocs: vi.fn(),
		renameDoc: vi.fn(),
		getAllContent: vi.fn().mockResolvedValue([]),
		searchInSpace: vi.fn().mockResolvedValue({ results: [], total: 0 }),
		reorderDoc: vi.fn(),
		moveDoc: vi.fn(),
		reorderAt: vi.fn(),
		findFolderByName: vi.fn(),
		findDocBySourcePath: vi.fn(),
		findDocBySourcePathAnySpace: vi.fn(),
		searchArticlesForLink: vi.fn(),
	};
}

function createMockDocDraftDao(): DocDraftDao {
	return {
		createDocDraft: vi.fn(),
		getDocDraft: vi.fn(),
		listDocDrafts: vi.fn(),
		listDocDraftsByUser: vi.fn(),
		findByDocId: vi.fn(),
		updateDocDraft: vi.fn(),
		deleteDocDraft: vi.fn(),
		deleteAllDocDrafts: vi.fn(),
		searchDocDraftsByTitle: vi.fn(),
		getDraftsWithPendingChanges: vi.fn(),
		listAccessibleDrafts: vi.fn(),
		findDraftsByExactTitle: vi.fn(),
		findDraftByDocId: vi.fn(),
		shareDraft: vi.fn(),
		listSharedDrafts: vi.fn(),
		countMyNewDrafts: vi.fn(),
		countMySharedNewDrafts: vi.fn(),
		countSharedWithMeDrafts: vi.fn(),
		countArticlesWithAgentSuggestions: vi.fn(),
		getAllContent: vi.fn().mockResolvedValue([]),
	};
}

function createMockImageStorageService(): ImageStorageService {
	return {
		uploadImage: vi.fn(),
		getSignedUrl: vi.fn(),
		downloadImage: vi.fn(),
		deleteImage: vi.fn().mockResolvedValue(undefined),
		imageExists: vi.fn(),
	};
}

describe("AssetCleanupJobs", () => {
	let mockDb: Database;
	let mockAssetDao: AssetDao;
	let mockDocDao: DocDao;
	let mockDocDraftDao: DocDraftDao;
	let mockImageStorageService: ImageStorageService;

	beforeEach(() => {
		vi.clearAllMocks();

		mockAssetDao = createMockAssetDao();
		mockDocDao = createMockDocDao();
		mockDocDraftDao = createMockDocDraftDao();

		mockDb = {
			assetDao: mockAssetDao,
			docDao: mockDocDao,
			docDraftDao: mockDocDraftDao,
		} as unknown as Database;

		mockImageStorageService = createMockImageStorageService();
	});

	describe("getDefinitions", () => {
		it("should return two job definitions", () => {
			const assetCleanupJobs = createAssetCleanupJobs(mockDb, mockImageStorageService);
			const definitions = assetCleanupJobs.getDefinitions();

			expect(definitions).toHaveLength(2);
			expect(definitions[0].name).toBe(DETECT_ORPHANED_IMAGES);
			expect(definitions[1].name).toBe(CLEANUP_ORPHANED_IMAGES);
		});

		it("should be visible in dashboard", () => {
			const assetCleanupJobs = createAssetCleanupJobs(mockDb, mockImageStorageService);
			const definitions = assetCleanupJobs.getDefinitions();

			expect(definitions[0].showInDashboard).toBe(true);
			expect(definitions[1].showInDashboard).toBe(true);
		});
	});

	describe("registerJobs", () => {
		it("should register both jobs with scheduler", () => {
			const assetCleanupJobs = createAssetCleanupJobs(mockDb, mockImageStorageService);
			const mockScheduler = {
				registerJob: vi.fn(),
			} as unknown as JobScheduler;

			assetCleanupJobs.registerJobs(mockScheduler);

			expect(mockScheduler.registerJob).toHaveBeenCalledTimes(2);
		});
	});

	describe("queueJobs", () => {
		it("should queue both jobs with singleton keys", async () => {
			const assetCleanupJobs = createAssetCleanupJobs(mockDb, mockImageStorageService);
			const mockScheduler = {
				queueJob: vi.fn().mockResolvedValue({ jobId: "test", name: "test" }),
			} as unknown as JobScheduler;

			await assetCleanupJobs.queueJobs(mockScheduler);

			expect(mockScheduler.queueJob).toHaveBeenCalledTimes(2);
			expect(mockScheduler.queueJob).toHaveBeenCalledWith({
				name: DETECT_ORPHANED_IMAGES,
				params: {},
				options: {
					cron: "0 3 * * *",
					singletonKey: DETECT_ORPHANED_IMAGES,
				},
			});
			expect(mockScheduler.queueJob).toHaveBeenCalledWith({
				name: CLEANUP_ORPHANED_IMAGES,
				params: {},
				options: {
					cron: "0 4 * * *",
					singletonKey: CLEANUP_ORPHANED_IMAGES,
				},
			});
		});
	});

	describe("detect orphaned images job handler", () => {
		function getDetectHandler(): JobDefinition["handler"] {
			const assetCleanupJobs = createAssetCleanupJobs(mockDb, mockImageStorageService);
			const definitions = assetCleanupJobs.getDefinitions();
			return definitions[0].handler;
		}

		it("should mark unreferenced assets as orphaned", async () => {
			const asset1 = mockAsset({ id: 1, s3Key: "tenant/org/_default/unreferenced.png" });
			const asset2 = mockAsset({ id: 2, s3Key: "tenant/org/_default/referenced.png" });

			vi.mocked(mockAssetDao.listActiveAssets).mockResolvedValue([asset1, asset2]);
			vi.mocked(mockAssetDao.findRecentlyUploaded).mockResolvedValue([]);
			vi.mocked(mockAssetDao.listAssets).mockResolvedValue([]);
			vi.mocked(mockDocDao.getAllContent).mockResolvedValue([
				{ content: "![image](/api/images/tenant/org/_default/referenced.png)" },
			]);
			vi.mocked(mockDocDraftDao.getAllContent).mockResolvedValue([]);
			vi.mocked(mockAssetDao.markAsOrphaned).mockResolvedValue(1);

			const handler = getDetectHandler();
			const context = createMockJobContext();

			await handler({}, context);

			expect(mockAssetDao.markAsOrphaned).toHaveBeenCalledWith(["tenant/org/_default/unreferenced.png"]);
		});

		it("should not orphan recently uploaded assets", async () => {
			const recentAsset = mockAsset({
				id: 1,
				s3Key: "tenant/org/_default/recent.png",
				createdAt: new Date(),
			});

			vi.mocked(mockAssetDao.listActiveAssets).mockResolvedValue([recentAsset]);
			vi.mocked(mockAssetDao.findRecentlyUploaded).mockResolvedValue([recentAsset]);
			vi.mocked(mockAssetDao.listAssets).mockResolvedValue([]);
			vi.mocked(mockDocDao.getAllContent).mockResolvedValue([]);
			vi.mocked(mockDocDraftDao.getAllContent).mockResolvedValue([]);

			const handler = getDetectHandler();
			const context = createMockJobContext();

			await handler({}, context);

			expect(mockAssetDao.markAsOrphaned).toHaveBeenCalledWith([]);
		});

		it("should restore orphaned assets that are now referenced", async () => {
			const orphanedAsset = mockAsset({
				id: 1,
				s3Key: "tenant/org/_default/restored.png",
				status: "orphaned",
				orphanedAt: new Date("2024-01-01"),
			});

			vi.mocked(mockAssetDao.listActiveAssets).mockResolvedValue([]);
			vi.mocked(mockAssetDao.findRecentlyUploaded).mockResolvedValue([]);
			vi.mocked(mockAssetDao.listAssets).mockResolvedValue([orphanedAsset]);
			vi.mocked(mockDocDao.getAllContent).mockResolvedValue([
				{ content: "![image](/api/images/tenant/org/_default/restored.png)" },
			]);
			vi.mocked(mockDocDraftDao.getAllContent).mockResolvedValue([]);
			vi.mocked(mockAssetDao.restoreToActive).mockResolvedValue(1);

			const handler = getDetectHandler();
			const context = createMockJobContext();

			await handler({}, context);

			expect(mockAssetDao.restoreToActive).toHaveBeenCalledWith(["tenant/org/_default/restored.png"]);
		});

		it("should check both docs and drafts for references", async () => {
			const asset = mockAsset({ id: 1, s3Key: "tenant/org/_default/in-draft.png" });

			vi.mocked(mockAssetDao.listActiveAssets).mockResolvedValue([asset]);
			vi.mocked(mockAssetDao.findRecentlyUploaded).mockResolvedValue([]);
			vi.mocked(mockAssetDao.listAssets).mockResolvedValue([]);
			vi.mocked(mockDocDao.getAllContent).mockResolvedValue([]);
			vi.mocked(mockDocDraftDao.getAllContent).mockResolvedValue([
				{ content: "![image](/api/images/tenant/org/_default/in-draft.png)" },
			]);

			const handler = getDetectHandler();
			const context = createMockJobContext();

			await handler({}, context);

			// Asset is referenced in draft, so it should not be orphaned
			expect(mockAssetDao.markAsOrphaned).toHaveBeenCalledWith([]);
		});
	});

	describe("cleanup orphaned images job handler", () => {
		function getCleanupHandler(): JobDefinition["handler"] {
			const assetCleanupJobs = createAssetCleanupJobs(mockDb, mockImageStorageService);
			const definitions = assetCleanupJobs.getDefinitions();
			return definitions[1].handler;
		}

		it("should delete orphans older than grace period", async () => {
			const oldOrphan = mockAsset({
				id: 1,
				s3Key: "tenant/org/_default/old-orphan.png",
				status: "orphaned",
				orphanedAt: new Date("2024-01-01"),
			});

			vi.mocked(mockAssetDao.findOrphanedOlderThan).mockResolvedValue([oldOrphan]);

			const handler = getCleanupHandler();
			const context = createMockJobContext();

			await handler({}, context);

			expect(mockImageStorageService.deleteImage).toHaveBeenCalledWith("tenant/org/_default/old-orphan.png");
			expect(mockAssetDao.softDelete).toHaveBeenCalledWith("tenant/org/_default/old-orphan.png");
		});

		it("should continue on S3 deletion error and log error", async () => {
			const orphan1 = mockAsset({
				id: 1,
				s3Key: "tenant/org/_default/orphan1.png",
				status: "orphaned",
			});
			const orphan2 = mockAsset({
				id: 2,
				s3Key: "tenant/org/_default/orphan2.png",
				status: "orphaned",
			});

			vi.mocked(mockAssetDao.findOrphanedOlderThan).mockResolvedValue([orphan1, orphan2]);
			vi.mocked(mockImageStorageService.deleteImage)
				.mockRejectedValueOnce(new Error("S3 error"))
				.mockResolvedValueOnce(undefined);

			const handler = getCleanupHandler();
			const context = createMockJobContext();

			await handler({}, context);

			// Should attempt to delete both
			expect(mockImageStorageService.deleteImage).toHaveBeenCalledTimes(2);
			// Only the second one should succeed with soft delete
			expect(mockAssetDao.softDelete).toHaveBeenCalledTimes(1);
			expect(mockAssetDao.softDelete).toHaveBeenCalledWith("tenant/org/_default/orphan2.png");
		});

		it("should handle non-Error thrown values during deletion", async () => {
			const orphan = mockAsset({
				id: 1,
				s3Key: "tenant/org/_default/orphan-str-err.png",
				status: "orphaned",
			});

			vi.mocked(mockAssetDao.findOrphanedOlderThan).mockResolvedValue([orphan]);
			vi.mocked(mockImageStorageService.deleteImage).mockRejectedValueOnce("string error");

			const handler = getCleanupHandler();
			const context = createMockJobContext();

			await handler({}, context);

			expect(mockImageStorageService.deleteImage).toHaveBeenCalledTimes(1);
			// Deletion failed, so soft delete should not be called
			expect(mockAssetDao.softDelete).not.toHaveBeenCalled();
		});

		it("should do nothing when no orphans past grace period", async () => {
			vi.mocked(mockAssetDao.findOrphanedOlderThan).mockResolvedValue([]);

			const handler = getCleanupHandler();
			const context = createMockJobContext();

			await handler({}, context);

			expect(mockImageStorageService.deleteImage).not.toHaveBeenCalled();
			expect(mockAssetDao.softDelete).not.toHaveBeenCalled();
		});
	});

	describe("tenant context database selection", () => {
		afterEach(() => {
			vi.mocked(TenantContextModule.getTenantContext).mockReturnValue(undefined);
		});

		it("should use tenant context database when available", async () => {
			const tenantAssetDao = createMockAssetDao();
			const tenantDocDao = createMockDocDao();
			const tenantDocDraftDao = createMockDocDraftDao();
			const tenantDb = {
				assetDao: tenantAssetDao,
				docDao: tenantDocDao,
				docDraftDao: tenantDocDraftDao,
			} as unknown as Database;

			vi.mocked(TenantContextModule.getTenantContext).mockReturnValue({
				tenant: { id: "tenant-1" } as never,
				org: { id: "org-1" } as never,
				schemaName: "tenant_org",
				database: tenantDb,
			});

			vi.mocked(tenantAssetDao.listActiveAssets).mockResolvedValue([]);
			vi.mocked(tenantAssetDao.findRecentlyUploaded).mockResolvedValue([]);
			vi.mocked(tenantAssetDao.listAssets).mockResolvedValue([]);
			vi.mocked(tenantDocDao.getAllContent).mockResolvedValue([]);
			vi.mocked(tenantDocDraftDao.getAllContent).mockResolvedValue([]);

			const assetCleanupJobs = createAssetCleanupJobs(mockDb, mockImageStorageService);
			const definitions = assetCleanupJobs.getDefinitions();
			const handler = definitions[0].handler;
			const context = createMockJobContext();

			await handler({}, context);

			// Should use tenant database, not default
			expect(tenantAssetDao.listActiveAssets).toHaveBeenCalled();
			expect(mockAssetDao.listActiveAssets).not.toHaveBeenCalled();
		});

		it("should fall back to default database when no tenant context", async () => {
			vi.mocked(TenantContextModule.getTenantContext).mockReturnValue(undefined);

			vi.mocked(mockAssetDao.listActiveAssets).mockResolvedValue([]);
			vi.mocked(mockAssetDao.findRecentlyUploaded).mockResolvedValue([]);
			vi.mocked(mockAssetDao.listAssets).mockResolvedValue([]);
			vi.mocked(mockDocDao.getAllContent).mockResolvedValue([]);
			vi.mocked(mockDocDraftDao.getAllContent).mockResolvedValue([]);

			const assetCleanupJobs = createAssetCleanupJobs(mockDb, mockImageStorageService);
			const definitions = assetCleanupJobs.getDefinitions();
			const handler = definitions[0].handler;
			const context = createMockJobContext();

			await handler({}, context);

			// Should use default database
			expect(mockAssetDao.listActiveAssets).toHaveBeenCalled();
		});
	});
});
