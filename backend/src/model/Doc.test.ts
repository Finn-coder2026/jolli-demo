// Import entire module to execute PII decorators

import { getRegisteredPiiFields, isRegisteredPiiField } from "../audit/PiiDecorators";
import * as DocModule from "./Doc";
import { defineDocs } from "./Doc";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Doc", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define doc model with correct schema", () => {
		defineDocs(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith("doc", expect.any(Object), { timestamps: true });

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		// Validate id field
		expect(schema.id).toEqual({
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		});

		// Validate jrn field
		expect(schema.jrn).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
			unique: "docs_jrn_key",
		});

		// Validate updatedBy field
		expect(schema.updatedBy).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		// Validate source field
		expect(schema.source).toEqual({
			type: DataTypes.JSONB,
			allowNull: true,
		});

		// Validate sourceMetadata field
		expect(schema.sourceMetadata).toEqual({
			type: DataTypes.JSONB,
			allowNull: true,
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
		});

		// Validate contentMetadata field
		expect(schema.contentMetadata).toEqual({
			type: DataTypes.JSONB,
			allowNull: true,
		});

		// Validate version field
		expect(schema.version).toEqual({
			type: DataTypes.INTEGER,
		});
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingDoc" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				doc: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineDocs(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});

	it("should register PII schema decorators", () => {
		// This test ensures that the PII decorators are executed
		// by importing the module (DocModule import at top triggers decorator execution)
		expect(DocModule).toBeDefined();
		expect(DocModule.defineDocs).toBeDefined();

		// Verify that PII fields were registered for the "doc" resource type
		const piiFields = getRegisteredPiiFields("doc");
		expect(piiFields.size).toBe(2);
		expect(piiFields.has("authorEmail")).toBe(true);
		expect(piiFields.has("authorName")).toBe(true);

		// Verify the field descriptions
		const authorEmailField = piiFields.get("authorEmail");
		expect(authorEmailField?.description).toBe("Document author email (from metadata)");

		const authorNameField = piiFields.get("authorName");
		expect(authorNameField?.description).toBe("Document author name (from metadata)");
	});

	it("should export NewDoc type correctly", () => {
		// This test verifies that the NewDoc type is correctly exported
		// NewDoc should omit: id, createdAt, updatedAt, version, deletedAt, explicitlyDeleted
		// slug, path, jrn are optional (auto-generated)
		const newDoc: DocModule.NewDoc = {
			jrn: "test-jrn",
			updatedBy: "test-user",
			source: { type: "test" },
			sourceMetadata: { meta: "data" },
			content: "test content",
			contentType: "text/plain",
			contentMetadata: { title: "Test" },
			spaceId: undefined,
			parentId: undefined,
			docType: "document",
			sortOrder: 0,
			createdBy: undefined,
		};

		expect(newDoc.jrn).toBe("test-jrn");
		expect(newDoc.updatedBy).toBe("test-user");
		expect(newDoc.content).toBe("test content");
		expect(newDoc.contentType).toBe("text/plain");
		expect(newDoc.docType).toBe("document");
	});

	it("should have complete PII field coverage", () => {
		// This test ensures all PII decorator code paths are executed
		// by verifying all registered fields exist and have descriptions
		const piiFields = getRegisteredPiiFields("doc");

		// Both fields should be registered
		const allFields = Array.from(piiFields.keys());
		expect(allFields).toContain("authorEmail");
		expect(allFields).toContain("authorName");

		// Verify using isRegisteredPiiField
		expect(isRegisteredPiiField("doc", "authorEmail")).toBe(true);
		expect(isRegisteredPiiField("doc", "authorName")).toBe(true);
		expect(isRegisteredPiiField("doc", "nonExistentField")).toBe(false);

		// Each field should have a description
		for (const [fieldName, options] of piiFields) {
			expect(fieldName).toBeTruthy();
			expect(options.description).toBeTruthy();
			expect(typeof options.description).toBe("string");
		}
	});
});
