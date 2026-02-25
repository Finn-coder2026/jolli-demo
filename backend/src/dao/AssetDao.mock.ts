import type { Asset } from "../model/Asset";
import type { AssetDao } from "./AssetDao";
import { vi } from "vitest";

function mockAsset(overrides: Partial<Asset> = {}): Asset {
	return {
		id: 1,
		s3Key: "1/100/_default/test-uuid-1234.png",
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

export function mockAssetDao(): AssetDao {
	return {
		createAsset: vi.fn().mockResolvedValue(mockAsset()),
		findByS3Key: vi.fn().mockResolvedValue(mockAsset()),
		findByS3KeyWithSpaceAccess: vi.fn().mockResolvedValue(mockAsset()),
		findById: vi.fn().mockResolvedValue(mockAsset()),
		listAssets: vi.fn().mockResolvedValue([mockAsset()]),
		listByUploader: vi.fn().mockResolvedValue([mockAsset()]),
		updateStatus: vi.fn().mockResolvedValue(mockAsset()),
		softDelete: vi.fn().mockResolvedValue(true),
		hardDelete: vi.fn().mockResolvedValue(true),
		deleteAll: vi.fn().mockResolvedValue(undefined),
		listActiveAssets: vi.fn().mockResolvedValue([mockAsset()]),
		markAsOrphaned: vi.fn().mockResolvedValue(0),
		restoreToActive: vi.fn().mockResolvedValue(0),
		findOrphanedOlderThan: vi.fn().mockResolvedValue([]),
		findRecentlyUploaded: vi.fn().mockResolvedValue([]),
	};
}
