// Import entire module to execute PII decorators
import * as SiteModule from "./Site";
import { defineSites, TABLE_NAME_SITES } from "./Site";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Site Model", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define site model with correct schema", () => {
		defineSites(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith(
			TABLE_NAME_SITES,
			expect.any(Object),
			expect.objectContaining({
				timestamps: true,
			}),
		);

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		// Validate id field
		expect(schema.id).toEqual({
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		});

		// Validate name field
		expect(schema.name).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		// Validate displayName field
		expect(schema.displayName).toEqual({
			type: DataTypes.STRING,
			field: "display_name",
			allowNull: false,
		});

		// Validate userId field
		expect(schema.userId).toEqual({
			type: DataTypes.INTEGER,
			field: "user_id",
			allowNull: true,
			references: {
				model: "users",
				key: "id",
			},
			onDelete: "SET NULL",
		});

		// Validate visibility field
		expect(schema.visibility).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
			defaultValue: "internal",
			validate: {
				isIn: [["internal", "external"]],
			},
		});

		// Validate status field
		expect(schema.status).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
			defaultValue: "pending",
			validate: {
				isIn: [["pending", "building", "active", "error"]],
			},
		});

		// Validate metadata field
		expect(schema.metadata).toEqual({
			type: DataTypes.JSONB,
			allowNull: true,
		});

		// Validate lastGeneratedAt field
		expect(schema.lastGeneratedAt).toEqual({
			type: DataTypes.DATE,
			field: "last_generated_at",
			allowNull: true,
		});
	});

	it("should have correct indexes defined", () => {
		defineSites(mockSequelize);

		const options = vi.mocked(mockSequelize.define).mock.calls[0][2] as Record<string, unknown>;
		const indexes = options.indexes as Array<Record<string, unknown>>;

		expect(indexes).toHaveLength(4);

		// Check for unique name index
		expect(indexes[0]).toEqual({
			unique: true,
			fields: ["name"],
		});

		// Check for user_id index
		expect(indexes[1]).toEqual({
			fields: ["user_id"],
		});

		// Check for status index
		expect(indexes[2]).toEqual({
			fields: ["status"],
		});

		// Check for last_generated_at index
		expect(indexes[3]).toEqual({
			fields: ["last_generated_at"],
		});
	});

	it("should register PII schema decorators", () => {
		// This test ensures that the PII decorators are executed
		// by importing the module (SiteModule import at top triggers decorator execution)
		expect(SiteModule).toBeDefined();
		expect(SiteModule.defineSites).toBeDefined();
	});
});
