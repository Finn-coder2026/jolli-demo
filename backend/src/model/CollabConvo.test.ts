import { defineCollabConvos } from "./CollabConvo";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("CollabConvo Model", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define collab_convo model with correct schema", () => {
		defineCollabConvos(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith(
			"collab_convo",
			expect.any(Object),
			expect.objectContaining({ timestamps: true }),
		);

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		expect(schema.id).toEqual({
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		});

		expect(schema.artifactType).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		expect(schema.artifactId).toEqual({
			type: DataTypes.INTEGER,
			allowNull: true,
		});

		expect(schema.messages).toEqual({
			type: DataTypes.JSONB,
			allowNull: false,
			defaultValue: [],
		});

		expect(schema.metadata).toEqual({
			type: DataTypes.JSONB,
			allowNull: true,
			defaultValue: null,
		});
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingCollabConvo" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				collab_convo: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineCollabConvos(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});
});
