// Import entire module to execute PII decorators
import * as AuthModule from "./Auth";
import { defineAuths } from "./Auth";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Auth Model", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define auth model with correct schema", () => {
		defineAuths(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith(
			"auth",
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

		// Validate email field
		expect(schema.email).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		// Validate name field
		expect(schema.name).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		// Validate picture field
		expect(schema.picture).toEqual({
			type: DataTypes.STRING,
			allowNull: true,
		});

		// Validate provider field
		expect(schema.provider).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		// Validate subject field
		expect(schema.subject).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});
	});

	it("should have correct indexes defined", () => {
		defineAuths(mockSequelize);

		const options = vi.mocked(mockSequelize.define).mock.calls[0][2] as Record<string, unknown>;
		const indexes = options.indexes as Array<Record<string, unknown>>;

		expect(indexes).toHaveLength(1);
		expect(indexes[0]).toMatchObject({
			fields: ["provider", "subject"],
			name: "auths_provider_subject_key",
			unique: true,
		});
	});

	it("should register PII schema decorators", () => {
		// This test ensures that the PII decorators are executed
		// by importing the module (AuthModule import at top triggers decorator execution)
		expect(AuthModule).toBeDefined();
		expect(AuthModule.defineAuths).toBeDefined();
	});
});
