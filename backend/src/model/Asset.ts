import type { AllowedImageMimeType } from "../util/ImageValidator";
import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Asset types supported by the system.
 * Currently only 'image' is supported, but extensible for future types.
 */
export type AssetType = "image";

/**
 * Asset status for lifecycle management.
 * - active: Asset is in use
 * - orphaned: Asset is not referenced by any article (candidate for cleanup)
 */
export type AssetStatus = "active" | "orphaned";

/**
 * Asset metadata record in the database.
 * Tracks uploaded assets (images, etc.) with their S3 storage keys.
 *
 * S3 key structure: {tenantId}/{orgId}/_default/{uuid}.{ext}
 * The _default placeholder is for the future space concept.
 *
 * Note: Assets are scoped to an org via schema isolation (each org has its own DB schema),
 * so there's no explicit orgId column needed.
 */
export interface Asset {
	/** Auto-incrementing primary key */
	readonly id: number;
	/** S3 object key (full path, e.g., "tenant-uuid/org-uuid/_default/uuid.png") */
	readonly s3Key: string;
	/** Type of asset */
	readonly assetType: AssetType;
	/** MIME type - restricted to allowed image types for security */
	readonly mimeType: AllowedImageMimeType;
	/** File size in bytes */
	readonly size: number;
	/** Original filename if provided during upload */
	readonly originalFilename: string | null;
	/** User ID who uploaded the asset */
	readonly uploadedBy: number;
	/** Asset lifecycle status */
	readonly status: AssetStatus;
	/** Created timestamp */
	readonly createdAt: Date;
	/** Updated timestamp */
	readonly updatedAt: Date;
	/** Soft delete timestamp (null if not deleted) */
	readonly deletedAt: Date | null;
}

/**
 * Fields required to create a new Asset.
 */
export type NewAsset = Omit<Asset, "id" | "createdAt" | "updatedAt" | "deletedAt" | "status"> & {
	status?: AssetStatus;
};

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	s3Key: {
		type: DataTypes.STRING(512),
		allowNull: false,
		unique: true,
	},
	assetType: {
		type: DataTypes.ENUM("image"),
		allowNull: false,
		defaultValue: "image",
	},
	mimeType: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	size: {
		type: DataTypes.INTEGER,
		allowNull: false,
	},
	originalFilename: {
		type: DataTypes.STRING,
		allowNull: true,
	},
	uploadedBy: {
		type: DataTypes.INTEGER,
		allowNull: false,
		references: {
			model: "users",
			key: "id",
		},
	},
	status: {
		type: DataTypes.ENUM("active", "orphaned"),
		allowNull: false,
		defaultValue: "active",
	},
	deletedAt: {
		type: DataTypes.DATE,
		allowNull: true,
	},
};

const indexes = [
	{
		fields: ["s3_key"],
	},
	{
		fields: ["status"],
	},
	{
		fields: ["uploaded_by"],
	},
	{
		fields: ["asset_type"],
	},
	{
		// Most queries filter by deletedAt: null, so index it for performance
		fields: ["deleted_at"],
	},
];

/**
 * Define the Asset model.
 */
export function defineAssets(sequelize: Sequelize): ModelDef<Asset> {
	// Return existing model if already defined to preserve definition order during sync
	const existing = sequelize.models?.asset;
	if (existing) {
		return existing as ModelDef<Asset>;
	}
	return sequelize.define("asset", schema, {
		timestamps: true,
		indexes,
	});
}
