import { defineVisits } from "./Visit";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Visit", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
		} as unknown as Sequelize;
	});

	it("should define visits model with correct schema", () => {
		const model = defineVisits(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith(
			"visit",
			expect.objectContaining({
				id: expect.objectContaining({
					type: DataTypes.INTEGER,
					autoIncrement: true,
					primaryKey: true,
				}),
				date: expect.objectContaining({
					type: DataTypes.DATE,
					defaultValue: DataTypes.NOW,
				}),
				visitorId: expect.objectContaining({
					type: DataTypes.STRING,
				}),
				userId: expect.objectContaining({
					type: DataTypes.INTEGER,
					allowNull: true,
				}),
			}),
			{ timestamps: false },
		);
		expect(model).toBeDefined();
	});

	it("should return the model from define", () => {
		const mockModel = { name: "Visit" };
		mockSequelize.define = vi.fn().mockReturnValue(mockModel);

		const model = defineVisits(mockSequelize);

		expect(model).toBe(mockModel);
	});
});
