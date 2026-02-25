import { defineVerifications } from "./Verification";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Verification Model", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({
				create: vi.fn(),
				update: vi.fn(),
				get: vi.fn(),
			}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define Verification model", () => {
		const result = defineVerifications(mockSequelize);
		expect(result).toBeDefined();
		expect(mockSequelize.define).toHaveBeenCalledWith(
			"Verification",
			expect.objectContaining({
				id: expect.any(Object),
				identifier: expect.any(Object),
				tokenHash: expect.any(Object),
				value: expect.any(Object),
				type: expect.any(Object),
				expiresAt: expect.any(Object),
				usedAt: expect.any(Object),
			}),
			expect.objectContaining({
				tableName: "verifications",
				timestamps: true,
				underscored: true,
			}),
		);
	});

	it("should return existing model if already defined", () => {
		const existingModel = {
			create: vi.fn(),
			update: vi.fn(),
			get: vi.fn(),
		};

		// Create a mockSequelize with existing Verification model
		const mockSequelizeWithExisting = {
			define: vi.fn(),
			models: {
				Verification: existingModel,
			},
		} as unknown as Sequelize;

		const result = defineVerifications(mockSequelizeWithExisting);

		// Should return existing model without calling define
		expect(result).toBe(existingModel);
		expect(mockSequelizeWithExisting.define).not.toHaveBeenCalled();
	});

	it("should define identifier field", () => {
		defineVerifications(mockSequelize);
		const defineCall = vi.mocked(mockSequelize.define).mock.calls[0];
		const fields = defineCall[1] as Record<string, unknown>;

		expect(fields.identifier).toBeDefined();
		expect((fields.identifier as Record<string, unknown>).allowNull).toBe(false);
	});

	it("should define tokenHash field (nullable for better-auth compatibility)", () => {
		defineVerifications(mockSequelize);
		const defineCall = vi.mocked(mockSequelize.define).mock.calls[0];
		const fields = defineCall[1] as Record<string, unknown>;

		expect(fields.tokenHash).toBeDefined();
		expect((fields.tokenHash as Record<string, unknown>).allowNull).toBe(true); // Nullable for better-auth compatibility
	});

	it("should define unique index on tokenHash via indexes option", () => {
		defineVerifications(mockSequelize);
		const defineCall = vi.mocked(mockSequelize.define).mock.calls[0];
		const options = defineCall[2] as { indexes: Array<{ name: string; unique?: boolean; fields: Array<string> }> };

		const tokenHashIndex = options.indexes.find(idx => idx.name === "verifications_token_hash_key");
		expect(tokenHashIndex).toBeDefined();
		expect(tokenHashIndex?.unique).toBe(true);
		expect(tokenHashIndex?.fields).toContain("token_hash");
	});

	it("should define value field as nullable", () => {
		defineVerifications(mockSequelize);
		const defineCall = vi.mocked(mockSequelize.define).mock.calls[0];
		const fields = defineCall[1] as Record<string, unknown>;

		expect(fields.value).toBeDefined();
		expect((fields.value as Record<string, unknown>).allowNull).toBe(true);
	});

	it("should define type field with enum constraint (nullable for better-auth compatibility)", () => {
		defineVerifications(mockSequelize);
		const defineCall = vi.mocked(mockSequelize.define).mock.calls[0];
		const fields = defineCall[1] as Record<string, unknown>;

		expect(fields.type).toBeDefined();
		expect((fields.type as Record<string, unknown>).allowNull).toBe(true); // Nullable for better-auth compatibility
	});

	it("should use underscored naming convention", () => {
		defineVerifications(mockSequelize);
		const defineCall = vi.mocked(mockSequelize.define).mock.calls[0];
		const options = defineCall[2] as Record<string, unknown>;

		expect(options.underscored).toBe(true);
	});

	it("should define composite index on identifier and type via indexes option", () => {
		defineVerifications(mockSequelize);
		const defineCall = vi.mocked(mockSequelize.define).mock.calls[0];
		const options = defineCall[2] as { indexes: Array<{ name: string; unique?: boolean; fields: Array<string> }> };

		const identifierTypeIndex = options.indexes.find(idx => idx.name === "idx_verifications_identifier_type");
		expect(identifierTypeIndex).toBeDefined();
		expect(identifierTypeIndex?.fields).toContain("identifier");
		expect(identifierTypeIndex?.fields).toContain("type");
	});
});
