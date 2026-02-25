import { defineSources, defineSpaceSources } from "./Source";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Source models", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("defines source model with integration foreign key", () => {
		defineSources(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith("source", expect.any(Object), {
			timestamps: true,
			indexes: [
				{
					name: "sources_name_key",
					unique: true,
					fields: ["name"],
				},
			],
		});

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		expect(schema.integrationId).toEqual({
			type: DataTypes.INTEGER,
			allowNull: true,
			references: {
				model: "integrations",
				key: "id",
			},
			onDelete: "SET NULL",
		});
	});

	it("defines space_source model with cascading foreign keys", () => {
		defineSpaceSources(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith("space_source", expect.any(Object), {
			timestamps: true,
			updatedAt: false,
			indexes: [
				{
					name: "space_sources_space_source_key",
					unique: true,
					fields: ["space_id", "source_id"],
				},
			],
		});

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		expect(schema.spaceId).toEqual({
			type: DataTypes.INTEGER,
			allowNull: false,
			primaryKey: true,
			references: {
				model: "spaces",
				key: "id",
			},
			onDelete: "CASCADE",
		});

		expect(schema.sourceId).toEqual({
			type: DataTypes.INTEGER,
			allowNull: false,
			primaryKey: true,
			references: {
				model: "sources",
				key: "id",
			},
			onDelete: "CASCADE",
		});
	});

	it("returns existing models when already defined", () => {
		const existingSourceModel = { name: "ExistingSourceModel" };
		const existingSpaceSourceModel = { name: "ExistingSpaceSourceModel" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				source: existingSourceModel,
				space_source: existingSpaceSourceModel,
			},
		} as unknown as Sequelize;

		expect(defineSources(mockSequelize)).toBe(existingSourceModel);
		expect(defineSpaceSources(mockSequelize)).toBe(existingSpaceSourceModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});
});
