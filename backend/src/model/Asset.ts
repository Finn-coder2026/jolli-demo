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
 * S3 key structure: {tenantId}/{orgId}/{spaceSlug}/{uuid}.{ext}
 * Legacy images use "_default" as the space slug and have spaceId = NULL.
 *
 * Note: Assets are scoped to an org via schema isolation (each org has its own DB schema),
 * so there's no explicit orgId column needed.
 */
export interface Asset {
	/** Auto-incrementing primary key */
	readonly id: number;
	/** S3 object key (full path, e.g., "tenant-uuid/org-uuid/space-slug/uuid.png") */
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
	/**
	 * Space ID this asset belongs to.
	 * NULL = org-wide asset (legacy images uploaded before space scoping).
	 * When set, asset is only accessible from articles in that space.
	 */
	readonly spaceId: number | null;
	/** Asset lifecycle status */
	readonly status: AssetStatus;
	/** Created timestamp */
	readonly createdAt: Date;
	/** Updated timestamp */
	readonly updatedAt: Date;
	/** Soft delete timestamp (null if not deleted) */
	readonly deletedAt: Date | null;
	/** Timestamp when asset was first marked as orphaned (null if active) */
	readonly orphanedAt: Date | null;
}

/**
 * Fields required to create a new Asset.
 * spaceId is optional for backwards compatibility - NULL means org-wide access.
 */
export type NewAsset = Omit<
	Asset,
	"id" | "createdAt" | "updatedAt" | "deletedAt" | "orphanedAt" | "status" | "spaceId"
> & {
	status?: AssetStatus;
	spaceId?: number | null;
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
		unique: "assets_s3_key_key",
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
	},
	spaceId: {
		type: DataTypes.INTEGER,
		allowNull: true, // NULL = org-wide (legacy images)
		references: {
			model: "spaces",
			key: "id",
		},
		onDelete: "SET NULL", // Space deleted → image becomes org-wide
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
	orphanedAt: {
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
	{
		// Composite index for orphan cleanup queries (find orphans older than X)
		fields: ["status", "orphaned_at"],
	},
	{
		// Index for space-scoped asset queries
		fields: ["space_id"],
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
