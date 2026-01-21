import { defineUsers } from "./User";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("User", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define users model with correct schema", () => {
		defineUsers(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith("user", expect.any(Object), { timestamps: true });

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
			unique: "users_email_key",
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

		// Validate isAgent field
		expect(schema.isAgent).toEqual({
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: false,
		});
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingUser" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				user: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineUsers(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});
});
