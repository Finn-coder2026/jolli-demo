import { type Asset, type AssetStatus, defineAssets, type NewAsset } from "../model/Asset";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import { Op, type Sequelize } from "sequelize";

/**
 * Asset DAO for managing asset metadata.
 */
export interface AssetDao {
	/**
	 * Creates a new asset record.
	 * @param asset The asset to create.
	 * @returns The created asset.
	 */
	createAsset(asset: NewAsset): Promise<Asset>;

	/**
	 * Finds an asset by its S3 key.
	 * @param s3Key The S3 object key.
	 * @returns The asset if found, undefined otherwise.
	 */
	findByS3Key(s3Key: string): Promise<Asset | undefined>;

	/**
	 * Finds an asset by S3 key with space access validation.
	 * Returns the asset only if:
	 * - The asset's spaceId is NULL (org-wide legacy), OR
	 * - The asset's spaceId is in the provided allowedSpaceIds set
	 *
	 * @param s3Key The S3 object key.
	 * @param allowedSpaceIds Set of space IDs the user has access to. Pass null for org-wide access (e.g., site generation).
	 * @returns The asset if found AND accessible, undefined otherwise.
	 */
	findByS3KeyWithSpaceAccess(s3Key: string, allowedSpaceIds: Set<number> | null): Promise<Asset | undefined>;

	/**
	 * Finds an asset by its ID.
	 * @param id The asset ID.
	 * @returns The asset if found, undefined otherwise.
	 */
	findById(id: number): Promise<Asset | undefined>;

	/**
	 * Lists all assets, optionally filtered by status.
	 * Excludes soft-deleted assets by default.
	 * @param options.status Filter by status.
	 * @param options.includeDeleted Include soft-deleted assets.
	 * @returns List of assets.
	 */
	listAssets(options?: { status?: AssetStatus; includeDeleted?: boolean }): Promise<Array<Asset>>;

	/**
	 * Lists assets uploaded by a specific user.
	 * Excludes soft-deleted assets.
	 * @param userId The user ID.
	 * @returns List of assets uploaded by the user.
	 */
	listByUploader(userId: number): Promise<Array<Asset>>;

	/**
	 * Updates an asset's status.
	 * @param s3Key The S3 object key.
	 * @param status The new status.
	 * @returns The updated asset if found, undefined otherwise.
	 */
	updateStatus(s3Key: string, status: AssetStatus): Promise<Asset | undefined>;

	/**
	 * Soft deletes an asset by setting deletedAt.
	 * @param s3Key The S3 object key.
	 * @returns True if the asset was found and deleted, false otherwise.
	 */
	softDelete(s3Key: string): Promise<boolean>;

	/**
	 * Hard deletes an asset from the database.
	 * @param s3Key The S3 object key.
	 * @returns True if the asset was found and deleted, false otherwise.
	 */
	hardDelete(s3Key: string): Promise<boolean>;

	/**
	 * Deletes all assets (for testing).
	 */
	deleteAll(): Promise<void>;

	/**
	 * Lists all active (non-orphaned, non-deleted) assets.
	 * Used by cleanup job to compare against referenced images.
	 * @returns List of active assets.
	 */
	listActiveAssets(): Promise<Array<Asset>>;

	/**
	 * Marks assets as orphaned (sets status="orphaned" and orphanedAt=now).
	 * Only affects assets that are currently active.
	 * @param s3Keys Array of S3 keys to mark as orphaned.
	 * @returns Number of assets actually marked.
	 */
	markAsOrphaned(s3Keys: Array<string>): Promise<number>;

	/**
	 * Restores orphaned assets to active (sets status="active" and orphanedAt=null).
	 * Used when previously orphaned images are re-referenced.
	 * @param s3Keys Array of S3 keys to restore.
	 * @returns Number of assets actually restored.
	 */
	restoreToActive(s3Keys: Array<string>): Promise<number>;

	/**
	 * Finds orphaned assets that have been orphaned for longer than the grace period.
	 * @param olderThan Only return assets orphaned before this date.
	 * @returns Assets ready for deletion.
	 */
	findOrphanedOlderThan(olderThan: Date): Promise<Array<Asset>>;

	/**
	 * Finds assets uploaded recently (within the safety buffer period).
	 * These should not be marked as orphaned even if unreferenced.
	 * @param uploadedAfter Only return assets created after this date.
	 * @returns Recently uploaded assets.
	 */
	findRecentlyUploaded(uploadedAfter: Date): Promise<Array<Asset>>;
}

export function createAssetDao(sequelize: Sequelize): AssetDao {
	const Assets = defineAssets(sequelize);

	return {
		createAsset,
		findByS3Key,
		findByS3KeyWithSpaceAccess,
		findById,
		listAssets,
		listByUploader,
		updateStatus,
		softDelete,
		hardDelete,
		deleteAll,
		listActiveAssets,
		markAsOrphaned,
		restoreToActive,
		findOrphanedOlderThan,
		findRecentlyUploaded,
	};

	async function createAsset(asset: NewAsset): Promise<Asset> {
		// Cast needed because Sequelize types expect all fields but auto-generated ones are handled by DB
		const created = await Assets.create({ ...asset, status: asset.status ?? "active" } as Asset);
		return created.get({ plain: true });
	}

	async function findByS3Key(s3Key: string): Promise<Asset | undefined> {
		const asset = await Assets.findOne({
			where: { s3Key, deletedAt: null },
		});
		return asset ? asset.get({ plain: true }) : undefined;
	}

	async function findByS3KeyWithSpaceAccess(
		s3Key: string,
		allowedSpaceIds: Set<number> | null,
	): Promise<Asset | undefined> {
		const asset = await findByS3Key(s3Key);
		if (!asset) {
			return;
		}

		// Org-wide access (e.g., site generation) - allow all assets
		if (allowedSpaceIds === null) {
			return asset;
		}

		// Legacy org-wide assets (spaceId = NULL) are accessible from any space
		if (asset.spaceId === null) {
			return asset;
		}

		// Check if asset's space is in the allowed set
		if (allowedSpaceIds.has(asset.spaceId)) {
			return asset;
		}

		// Asset exists but user doesn't have access to its space
		return;
	}

	async function findById(id: number): Promise<Asset | undefined> {
		const asset = await Assets.findOne({
			where: { id, deletedAt: null },
		});
		return asset ? asset.get({ plain: true }) : undefined;
	}

	async function listAssets(options?: { status?: AssetStatus; includeDeleted?: boolean }): Promise<Array<Asset>> {
		const { status, includeDeleted = false } = options ?? {};
		const where: Record<string, unknown> = {};

		if (!includeDeleted) {
			where.deletedAt = null;
		}

		if (status) {
			where.status = status;
		}

		const assets = await Assets.findAll({
			where,
			order: [["createdAt", "DESC"]],
		});
		return assets.map(asset => asset.get({ plain: true }));
	}

	async function listByUploader(userId: number): Promise<Array<Asset>> {
		const assets = await Assets.findAll({
			where: { uploadedBy: userId, deletedAt: null },
			order: [["createdAt", "DESC"]],
		});
		return assets.map(asset => asset.get({ plain: true }));
	}

	async function updateStatus(s3Key: string, status: AssetStatus): Promise<Asset | undefined> {
		const [affectedCount] = await Assets.update({ status }, { where: { s3Key, deletedAt: null } });
		if (affectedCount === 0) {
			return;
		}
		return findByS3Key(s3Key);
	}

	async function softDelete(s3Key: string): Promise<boolean> {
		const [affectedCount] = await Assets.update({ deletedAt: new Date() }, { where: { s3Key, deletedAt: null } });
		return affectedCount > 0;
	}

	async function hardDelete(s3Key: string): Promise<boolean> {
		const affectedCount = await Assets.destroy({ where: { s3Key } });
		return affectedCount > 0;
	}

	async function deleteAll(): Promise<void> {
		await Assets.destroy({ where: {} });
	}

	async function listActiveAssets(): Promise<Array<Asset>> {
		const assets = await Assets.findAll({
			where: { status: "active", deletedAt: null },
			order: [["createdAt", "ASC"]],
		});
		return assets.map(asset => asset.get({ plain: true }));
	}

	async function markAsOrphaned(s3Keys: Array<string>): Promise<number> {
		if (s3Keys.length === 0) {
			return 0;
		}
		const [affectedCount] = await Assets.update(
			{ status: "orphaned", orphanedAt: new Date() },
			{ where: { s3Key: { [Op.in]: s3Keys }, status: "active", deletedAt: null } },
		);
		return affectedCount;
	}

	async function restoreToActive(s3Keys: Array<string>): Promise<number> {
		if (s3Keys.length === 0) {
			return 0;
		}
		const [affectedCount] = await Assets.update(
			{ status: "active", orphanedAt: null },
			{ where: { s3Key: { [Op.in]: s3Keys }, status: "orphaned", deletedAt: null } },
		);
		return affectedCount;
	}

	async function findOrphanedOlderThan(olderThan: Date): Promise<Array<Asset>> {
		const assets = await Assets.findAll({
			where: {
				status: "orphaned",
				orphanedAt: { [Op.lt]: olderThan },
				deletedAt: null,
			},
			order: [["orphanedAt", "ASC"]],
		});
		return assets.map(asset => asset.get({ plain: true }));
	}

	async function findRecentlyUploaded(uploadedAfter: Date): Promise<Array<Asset>> {
		const assets = await Assets.findAll({
			where: {
				createdAt: { [Op.gte]: uploadedAfter },
				deletedAt: null,
			},
		});
		return assets.map(asset => asset.get({ plain: true }));
	}
}

export function createAssetDaoProvider(defaultDao: AssetDao): DaoProvider<AssetDao> {
	return {
		getDao(context: TenantOrgContext | undefined): AssetDao {
			return context?.database.assetDao ?? defaultDao;
		},
	};
}
