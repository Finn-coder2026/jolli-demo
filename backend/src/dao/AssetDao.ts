import { type Asset, type AssetStatus, defineAssets, type NewAsset } from "../model/Asset";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import type { Sequelize } from "sequelize";

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
}

export function createAssetDao(sequelize: Sequelize): AssetDao {
	const Assets = defineAssets(sequelize);

	return {
		createAsset,
		findByS3Key,
		findById,
		listAssets,
		listByUploader,
		updateStatus,
		softDelete,
		hardDelete,
		deleteAll,
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
}

export function createAssetDaoProvider(defaultDao: AssetDao): DaoProvider<AssetDao> {
	return {
		getDao(context: TenantOrgContext | undefined): AssetDao {
			return context?.database.assetDao ?? defaultDao;
		},
	};
}
