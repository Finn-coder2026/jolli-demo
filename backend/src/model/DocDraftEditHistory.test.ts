import { defineDocDraftEditHistory } from "./DocDraftEditHistory";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DocDraftEditHistory Model", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define doc_draft_edit_history model with correct schema", () => {
		defineDocDraftEditHistory(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith(
			"doc_draft_edit_history",
			expect.any(Object),
			expect.objectContaining({ timestamps: true, updatedAt: false }),
		);

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		expect(schema.id).toEqual({
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		});

		expect(schema.draftId).toEqual({
			type: DataTypes.INTEGER,
			allowNull: false,
			references: { model: "doc_drafts", key: "id" },
			onDelete: "CASCADE",
		});

		expect(schema.userId).toEqual({
			type: DataTypes.INTEGER,
			allowNull: false,
		});

		expect(schema.editType).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		expect(schema.description).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		expect(schema.editedAt).toEqual({
			type: DataTypes.DATE,
			allowNull: false,
		});
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingDocDraftEditHistory" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				doc_draft_edit_history: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineDocDraftEditHistory(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});
});
