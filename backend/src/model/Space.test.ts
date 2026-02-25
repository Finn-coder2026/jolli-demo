import { defineSpaces } from "./Space";
import { DEFAULT_SPACE_FILTERS } from "jolli-common";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Space", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define spaces model with correct schema", () => {
		defineSpaces(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith("space", expect.any(Object), { timestamps: true });

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

		// Validate slug field
		expect(schema.slug).toEqual({
			type: DataTypes.STRING(100),
			allowNull: false,
			unique: "spaces_slug_key",
		});

		// Validate jrn field
		expect(schema.jrn).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
			unique: "spaces_jrn_key",
		});

		// Validate description field
		expect(schema.description).toEqual({
			type: DataTypes.TEXT,
			allowNull: true,
		});

		// Validate ownerId field
		expect(schema.ownerId).toEqual({
			type: DataTypes.INTEGER,
			allowNull: false,
		});

		// Validate isPersonal field
		expect(schema.isPersonal).toEqual({
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: false,
		});

		// Validate defaultSort field (merged from defaultSortBy and defaultSortDirection)
		expect(schema.defaultSort).toEqual({
			type: DataTypes.STRING(50),
			allowNull: false,
			defaultValue: "default",
		});

		// Validate defaultFilters field
		expect(schema.defaultFilters).toEqual({
			type: DataTypes.JSONB,
			allowNull: false,
			defaultValue: { ...DEFAULT_SPACE_FILTERS },
		});
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingSpace" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				space: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineSpaces(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});
});
