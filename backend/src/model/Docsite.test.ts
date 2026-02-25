import { defineDocsites, TABLE_NAME_DOCSITES } from "./Docsite";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Docsite Model", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define docsites model with correct schema", () => {
		defineDocsites(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith(
			TABLE_NAME_DOCSITES,
			expect.any(Object),
			expect.objectContaining({ timestamps: true }),
		);

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		expect(schema.id).toEqual({
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		});

		expect(schema.name).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		expect(schema.displayName).toEqual({
			type: DataTypes.STRING,
			field: "display_name",
			allowNull: false,
		});

		expect(schema.userId).toEqual({
			type: DataTypes.INTEGER,
			field: "user_id",
			allowNull: true,
		});

		expect(schema.visibility).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
			defaultValue: "internal",
			validate: { isIn: [["internal", "external"]] },
		});

		expect(schema.status).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
			defaultValue: "pending",
			validate: { isIn: [["pending", "building", "active", "error", "archived"]] },
		});

		expect(schema.metadata).toEqual({
			type: DataTypes.JSONB,
			allowNull: true,
		});
	});

	it("should have correct indexes defined", () => {
		defineDocsites(mockSequelize);

		const options = vi.mocked(mockSequelize.define).mock.calls[0][2] as Record<string, unknown>;
		const indexes = options.indexes as Array<Record<string, unknown>>;

		expect(indexes).toHaveLength(5);
		expect(indexes[0]).toEqual({ name: "docsites_name_key", unique: true, fields: ["name"] });
		expect(indexes[1]).toEqual({ fields: ["user_id"] });
		expect(indexes[2]).toEqual({ fields: ["visibility"] });
		expect(indexes[3]).toEqual({ fields: ["status"] });
		expect(indexes[4]).toEqual({ fields: ["visibility", "status"] });
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingDocsite" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				docsites: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineDocsites(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});
});
