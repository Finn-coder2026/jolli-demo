import { defineSessions } from "./Session";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Session Model", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({
				create: vi.fn(),
				update: vi.fn(),
				destroy: vi.fn(),
				findByPk: vi.fn(),
				findAll: vi.fn(),
			}),
			models: {},
			query: vi.fn().mockResolvedValue(undefined),
			fn: vi.fn((fnName: string, ...args: Array<unknown>) => ({ fn: fnName, args })),
		} as unknown as Sequelize;
	});

	it("should define Session model", () => {
		const result = defineSessions(mockSequelize);
		expect(result).toBeDefined();
		expect(mockSequelize.define).toHaveBeenCalledWith(
			"Session",
			expect.objectContaining({
				id: expect.any(Object),
				userId: expect.any(Object),
				expiresAt: expect.any(Object),
				token: expect.any(Object),
				ipAddress: expect.any(Object),
				userAgent: expect.any(Object),
				createdAt: expect.any(Object),
				updatedAt: expect.any(Object),
			}),
			expect.objectContaining({
				tableName: "sessions",
				timestamps: true,
				underscored: false, // Use camelCase field names to match better-auth
			}),
		);
	});

	it("should define id field as primary key", () => {
		defineSessions(mockSequelize);
		const defineCall = vi.mocked(mockSequelize.define).mock.calls[0];
		const fields = defineCall[1] as Record<string, Record<string, unknown>>;

		expect(fields.id).toBeDefined();
		expect(fields.id.primaryKey).toBe(true);
	});

	it("should define userId field as required", () => {
		defineSessions(mockSequelize);
		const defineCall = vi.mocked(mockSequelize.define).mock.calls[0];
		const fields = defineCall[1] as Record<string, Record<string, unknown>>;

		expect(fields.userId).toBeDefined();
		expect(fields.userId.allowNull).toBe(false);
	});

	it("should define expiresAt field as required", () => {
		defineSessions(mockSequelize);
		const defineCall = vi.mocked(mockSequelize.define).mock.calls[0];
		const fields = defineCall[1] as Record<string, Record<string, unknown>>;

		expect(fields.expiresAt).toBeDefined();
		expect(fields.expiresAt.allowNull).toBe(false);
	});

	it("should define token field as required", () => {
		defineSessions(mockSequelize);
		const defineCall = vi.mocked(mockSequelize.define).mock.calls[0];
		const fields = defineCall[1] as Record<string, Record<string, unknown>>;

		expect(fields.token).toBeDefined();
		expect(fields.token.allowNull).toBe(false);
	});

	it("should define ipAddress field as optional", () => {
		defineSessions(mockSequelize);
		const defineCall = vi.mocked(mockSequelize.define).mock.calls[0];
		const fields = defineCall[1] as Record<string, Record<string, unknown>>;

		expect(fields.ipAddress).toBeDefined();
		expect(fields.ipAddress.allowNull).toBe(true);
	});

	it("should define userAgent field as optional", () => {
		defineSessions(mockSequelize);
		const defineCall = vi.mocked(mockSequelize.define).mock.calls[0];
		const fields = defineCall[1] as Record<string, Record<string, unknown>>;

		expect(fields.userAgent).toBeDefined();
		expect(fields.userAgent.allowNull).toBe(true);
	});

	it("should use camelCase field names to match better-auth", () => {
		defineSessions(mockSequelize);
		const defineCall = vi.mocked(mockSequelize.define).mock.calls[0];
		const options = defineCall[2] as Record<string, unknown>;

		// Session model uses camelCase field names (underscored: false)
		// to match better-auth's default field naming convention
		expect(options.underscored).toBe(false);
	});

	it("should set timestamps to true", () => {
		defineSessions(mockSequelize);
		const defineCall = vi.mocked(mockSequelize.define).mock.calls[0];
		const options = defineCall[2] as Record<string, unknown>;

		expect(options.timestamps).toBe(true);
	});

	it("should set underscored to false for better-auth compatibility", () => {
		defineSessions(mockSequelize);
		const defineCall = vi.mocked(mockSequelize.define).mock.calls[0];
		const options = defineCall[2] as Record<string, unknown>;

		expect(options.underscored).toBe(false);
	});

	it("should return cached model on second call", () => {
		const model1 = defineSessions(mockSequelize);
		(mockSequelize as unknown as { models: Record<string, unknown> }).models = { Session: model1 };

		const model2 = defineSessions(mockSequelize);
		expect(model2).toBe(model1);
		expect(mockSequelize.define).toHaveBeenCalledTimes(1);
	});
});
