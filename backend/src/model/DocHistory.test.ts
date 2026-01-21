import { defineDocHistories } from "./DocHistory";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DocHistory", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define doc_history model with correct schema", () => {
		defineDocHistories(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith(
			"doc_history",
			expect.any(Object),
			expect.objectContaining({
				timestamps: false,
				indexes: expect.any(Array),
			}),
		);

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		// Validate id field
		expect(schema.id).toEqual({
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		});

		// Validate docId field with foreign key reference
		expect(schema.docId).toEqual({
			type: DataTypes.INTEGER,
			allowNull: false,
			references: {
				model: "docs",
				key: "id",
			},
			onDelete: "CASCADE",
		});

		// Validate docSnapshot field
		expect(schema.docSnapshot).toEqual({
			type: DataTypes.BLOB,
			allowNull: false,
		});

		// Validate version field
		expect(schema.version).toEqual({
			type: DataTypes.INTEGER,
			allowNull: false,
		});

		// Validate createdAt field
		expect(schema.createdAt).toEqual({
			type: DataTypes.DATE,
			allowNull: false,
			defaultValue: DataTypes.NOW,
		});
	});

	it("should define indexes for doc_id and unique composite index", () => {
		defineDocHistories(mockSequelize);

		const options = vi.mocked(mockSequelize.define).mock.calls[0][2] as { indexes: Array<unknown> };

		expect(options.indexes).toEqual([{ fields: ["doc_id"] }, { fields: ["doc_id", "version"], unique: true }]);
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingDocHistory" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				doc_history: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineDocHistories(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});
});
