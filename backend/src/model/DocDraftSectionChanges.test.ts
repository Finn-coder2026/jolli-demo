import { defineDocDraftChanges } from "./DocDraftSectionChanges";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DocDraftSectionChanges", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define doc_draft_section_changes model with correct schema", () => {
		defineDocDraftChanges(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith("doc_draft_section_changes", expect.any(Object), {
			timestamps: true,
		});

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		// Validate id field
		expect(schema.id).toEqual({
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		});

		// Validate draftId field
		expect(schema.draftId).toEqual({
			type: DataTypes.INTEGER,
			allowNull: false,
			references: { model: "doc_drafts", key: "id" },
			onDelete: "CASCADE",
		});

		// Validate docId field
		expect(schema.docId).toEqual({
			type: DataTypes.INTEGER,
			allowNull: false,
			references: { model: "docs", key: "id" },
			onDelete: "CASCADE",
		});

		// Validate changeType field
		expect(schema.changeType).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
			defaultValue: "pending",
			validate: { isIn: [["insert-before", "insert-after", "update", "delete"]] },
		});

		// Validate path field
		expect(schema.path).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		// Validate sectionId field
		expect(schema.sectionId).toEqual({
			type: DataTypes.STRING,
			allowNull: true,
		});

		// Validate baseContent field
		expect(schema.baseContent).toEqual({
			type: DataTypes.TEXT,
			allowNull: true,
		});

		// Validate content field
		expect(schema.content).toEqual({
			type: DataTypes.TEXT,
			allowNull: true,
		});

		// Validate proposed field
		expect(schema.proposed).toEqual({
			type: DataTypes.JSONB,
			allowNull: false,
			defaultValue: [],
		});

		// Validate comments field
		expect(schema.comments).toEqual({
			type: DataTypes.JSONB,
			allowNull: false,
			defaultValue: [],
		});

		// Validate applied field
		expect(schema.applied).toEqual({
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: false,
		});

		// Validate dismissed field
		expect(schema.dismissed).toEqual({
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: false,
		});

		// Validate dismissedAt field
		expect(schema.dismissedAt).toEqual({
			type: DataTypes.DATE,
			allowNull: true,
		});

		// Validate dismissedBy field
		expect(schema.dismissedBy).toEqual({
			type: DataTypes.INTEGER,
			allowNull: true,
		});
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingDocDraftSectionChanges" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				doc_draft_section_changes: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineDocDraftChanges(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});
});
