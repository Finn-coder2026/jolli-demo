import { defineRememberMeTokens } from "./RememberMeToken";
import type { Sequelize } from "sequelize";
import { describe, expect, it, vi } from "vitest";

describe("RememberMeToken", () => {
	describe("defineRememberMeTokens", () => {
		it("should return existing model if already defined", () => {
			const mockExistingModel = { name: "RememberMeToken" };
			const mockSequelize = {
				models: {
					RememberMeToken: mockExistingModel,
				},
				define: vi.fn(),
			} as unknown as Sequelize;

			const result = defineRememberMeTokens(mockSequelize);

			// Should return the existing model without calling define
			expect(result).toBe(mockExistingModel);
			expect(mockSequelize.define).not.toHaveBeenCalled();
		});

		it("should define and return new model if not already defined", () => {
			const mockNewModel = { name: "RememberMeToken" };
			const mockSequelize = {
				models: {},
				define: vi.fn().mockReturnValue(mockNewModel),
			} as unknown as Sequelize;

			const result = defineRememberMeTokens(mockSequelize);

			// Should call define and return the new model
			expect(mockSequelize.define).toHaveBeenCalledWith(
				"RememberMeToken",
				expect.any(Object),
				expect.objectContaining({
					tableName: "rememberme_tokens",
					timestamps: false,
					underscored: true,
					indexes: expect.any(Array),
				}),
			);
			expect(result).toBe(mockNewModel);
		});

		it("should handle undefined models property", () => {
			const mockNewModel = { name: "RememberMeToken" };
			const mockSequelize = {
				models: undefined,
				define: vi.fn().mockReturnValue(mockNewModel),
			} as unknown as Sequelize;

			const result = defineRememberMeTokens(mockSequelize);

			// Should call define since models is undefined
			expect(mockSequelize.define).toHaveBeenCalled();
			expect(result).toBe(mockNewModel);
		});
	});
});
