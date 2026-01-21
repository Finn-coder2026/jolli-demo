import { defineUserSpacePreferences } from "./UserSpacePreference";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("UserSpacePreference", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define user_space_preferences model with correct schema", () => {
		defineUserSpacePreferences(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith("user_space_preference", expect.any(Object), {
			timestamps: true,
			createdAt: false,
			indexes: [
				{
					unique: true,
					fields: ["user_id", "space_id"],
					name: "idx_user_space_prefs",
				},
			],
		});

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		// Validate id field
		expect(schema.id).toEqual({
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		});

		// Validate userId field
		expect(schema.userId).toEqual({
			type: DataTypes.INTEGER,
			allowNull: false,
			references: {
				model: "users",
				key: "id",
			},
			onDelete: "CASCADE",
		});

		// Validate spaceId field
		expect(schema.spaceId).toEqual({
			type: DataTypes.INTEGER,
			allowNull: false,
			references: {
				model: "spaces",
				key: "id",
			},
			onDelete: "CASCADE",
		});

		// Validate sort field (combined from sortBy + sortDirection)
		expect(schema.sort).toEqual({
			type: DataTypes.STRING(50),
			allowNull: true,
		});

		// Validate filters field
		expect(schema.filters).toEqual({
			type: DataTypes.JSONB,
			allowNull: true,
		});

		// Validate expandedFolders field
		expect(schema.expandedFolders).toEqual({
			type: DataTypes.JSONB,
			allowNull: false,
			defaultValue: [],
		});
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingUserSpacePreference" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				user_space_preference: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineUserSpacePreferences(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});
});
