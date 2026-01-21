import { defineAssets } from "./Asset";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Asset", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define asset model with correct schema", () => {
		defineAssets(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith("asset", expect.any(Object), {
			timestamps: true,
			indexes: expect.any(Array),
		});

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		// Validate id field
		expect(schema.id).toEqual({
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		});

		// Validate s3Key field (increased to 512 for tenant/org/_default/uuid.ext paths)
		expect(schema.s3Key).toEqual({
			type: DataTypes.STRING(512),
			allowNull: false,
			unique: true,
		});

		// Validate assetType field
		expect(schema.assetType).toEqual({
			type: DataTypes.ENUM("image"),
			allowNull: false,
			defaultValue: "image",
		});

		// Validate mimeType field
		expect(schema.mimeType).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		// Validate size field
		expect(schema.size).toEqual({
			type: DataTypes.INTEGER,
			allowNull: false,
		});

		// Validate originalFilename field
		expect(schema.originalFilename).toEqual({
			type: DataTypes.STRING,
			allowNull: true,
		});

		// Validate uploadedBy field
		expect(schema.uploadedBy).toEqual({
			type: DataTypes.INTEGER,
			allowNull: false,
			references: {
				model: "users",
				key: "id",
			},
		});

		// Validate status field
		expect(schema.status).toEqual({
			type: DataTypes.ENUM("active", "orphaned"),
			allowNull: false,
			defaultValue: "active",
		});

		// Validate deletedAt field
		expect(schema.deletedAt).toEqual({
			type: DataTypes.DATE,
			allowNull: true,
		});
	});

	it("should define correct indexes", () => {
		defineAssets(mockSequelize);

		const options = vi.mocked(mockSequelize.define).mock.calls[0][2] as {
			indexes: Array<{ fields: Array<string> }>;
		};

		expect(options.indexes).toContainEqual({ fields: ["s3_key"] });
		expect(options.indexes).toContainEqual({ fields: ["status"] });
		expect(options.indexes).toContainEqual({ fields: ["uploaded_by"] });
		expect(options.indexes).toContainEqual({ fields: ["asset_type"] });
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingAsset" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				asset: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineAssets(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});
});
