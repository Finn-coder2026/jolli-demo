// Import entire module to execute PII decorators
import { getRegisteredPiiFields } from "../audit/PiiDecorators";
import * as IntegrationModule from "./Integration";
import { defineIntegrations } from "./Integration";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Integration Model", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define integration model with correct schema", () => {
		defineIntegrations(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith(
			"integrations",
			expect.any(Object),
			expect.objectContaining({
				timestamps: true,
			}),
		);

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		// Validate id field
		expect(schema.id).toEqual({
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		});

		// Validate type field
		expect(schema.type).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		// Validate name field
		expect(schema.name).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		// Validate status field
		expect(schema.status).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
			defaultValue: "active",
		});

		// Validate metadata field
		expect(schema.metadata).toEqual({
			type: DataTypes.JSONB,
			allowNull: true,
		});
	});

	it("should have correct indexes defined", () => {
		defineIntegrations(mockSequelize);

		const options = vi.mocked(mockSequelize.define).mock.calls[0][2] as Record<string, unknown>;
		const indexes = options.indexes as Array<Record<string, unknown>>;

		expect(indexes).toHaveLength(1);
		expect(indexes[0]).toEqual({
			name: "integrations_type_name_key",
			unique: true,
			fields: ["type", "name"],
		});
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingIntegration" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				integrations: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineIntegrations(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});

	it("should register PII schema decorators", () => {
		// This test ensures that the PII decorators are executed
		// by importing the module (IntegrationModule import at top triggers decorator execution)
		expect(IntegrationModule).toBeDefined();
		expect(IntegrationModule.defineIntegrations).toBeDefined();
	});

	it("should register all PII fields in the integration resource type", () => {
		// Verify that the PII decorators registered all expected fields
		const integrationPiiFields = getRegisteredPiiFields("integration");

		// Check that accountEmail and accountName fields are registered
		expect(integrationPiiFields.has("accountEmail")).toBe(true);
		expect(integrationPiiFields.has("accountName")).toBe(true);

		// Verify descriptions
		expect(integrationPiiFields.get("accountEmail")?.description).toBe("Integration account email (from metadata)");
		expect(integrationPiiFields.get("accountName")?.description).toBe("Integration account name (from metadata)");
	});
});
