import { defineDocDrafts } from "./DocDraft";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DocDraft", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define doc_draft model with correct schema", () => {
		defineDocDrafts(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith("doc_draft", expect.any(Object), { timestamps: true });

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		// Validate id field
		expect(schema.id).toEqual({
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		});

		// Validate docId field
		expect(schema.docId).toEqual({
			type: DataTypes.INTEGER,
			allowNull: true,
			references: { model: "docs", key: "id" },
			onDelete: "CASCADE",
		});

		// Validate title field
		expect(schema.title).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		// Validate content field
		expect(schema.content).toEqual({
			type: DataTypes.TEXT,
			allowNull: false,
		});

		// Validate contentType field
		expect(schema.contentType).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
			defaultValue: "text/markdown",
		});

		// Validate createdBy field
		expect(schema.createdBy).toEqual({
			type: DataTypes.INTEGER,
			allowNull: false,
			references: { model: "users", key: "id" },
		});

		// Validate contentLastEditedAt field
		expect(schema.contentLastEditedAt).toEqual({
			type: DataTypes.DATE,
			allowNull: true,
		});

		// Validate contentLastEditedBy field
		expect(schema.contentLastEditedBy).toEqual({
			type: DataTypes.INTEGER,
			allowNull: true,
			references: { model: "users", key: "id" },
		});

		// Validate contentMetadata field
		expect(schema.contentMetadata).toEqual({
			type: DataTypes.JSONB,
			allowNull: true,
		});

		// Validate isShared field
		expect(schema.isShared).toEqual({
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: false,
		});

		// Validate sharedAt field
		expect(schema.sharedAt).toEqual({
			type: DataTypes.DATE,
			allowNull: true,
		});

		// Validate sharedBy field
		expect(schema.sharedBy).toEqual({
			type: DataTypes.INTEGER,
			allowNull: true,
			references: { model: "users", key: "id" },
		});

		// Validate createdByAgent field
		expect(schema.createdByAgent).toEqual({
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: false,
		});
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingDocDraft" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				doc_draft: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineDocDrafts(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});
});
