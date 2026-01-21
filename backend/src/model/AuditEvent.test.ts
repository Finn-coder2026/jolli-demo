import { defineAuditEvents } from "./AuditEvent";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("AuditEvent model", () => {
	let mockSequelize: Sequelize;
	const mockModel = { name: "audit_event" };

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue(mockModel),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define the audit_event model with correct schema", () => {
		const result = defineAuditEvents(mockSequelize);

		expect(result).toBe(mockModel);
		expect(mockSequelize.define).toHaveBeenCalledWith("audit_event", expect.any(Object), {
			timestamps: true,
			updatedAt: false,
			underscored: true,
		});

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		// Validate key fields
		expect(schema.id).toEqual({
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		});

		expect(schema.timestamp).toEqual({
			type: DataTypes.DATE,
			allowNull: false,
			defaultValue: DataTypes.NOW,
		});

		expect(schema.action).toEqual({
			type: DataTypes.STRING(64),
			allowNull: false,
		});

		expect(schema.resourceType).toEqual({
			type: DataTypes.STRING(64),
			allowNull: false,
		});
	});

	it("should return cached model on second call", () => {
		// Set up models with existing audit_event
		const existingModel = { name: "cached_audit_event" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				audit_event: existingModel,
			},
		} as unknown as Sequelize;

		// Should return the cached model without calling define
		const result = defineAuditEvents(mockSequelize);

		expect(result).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});
});
