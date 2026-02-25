import { defineJobs } from "./Job";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Job Model", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define jobs model with correct schema", () => {
		defineJobs(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith(
			"jobs",
			expect.any(Object),
			expect.objectContaining({ timestamps: true }),
		);

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		expect(schema.id).toEqual({
			type: DataTypes.STRING,
			primaryKey: true,
			allowNull: false,
		});

		expect(schema.name).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		expect(schema.status).toEqual({
			type: DataTypes.ENUM("queued", "active", "completed", "failed", "cancelled"),
			allowNull: false,
			defaultValue: "queued",
		});

		expect(schema.logs).toEqual({
			type: DataTypes.JSONB,
			allowNull: false,
			defaultValue: [],
		});

		expect(schema.retryCount).toEqual({
			type: DataTypes.INTEGER,
			allowNull: false,
			defaultValue: 0,
		});
	});

	it("should have correct indexes defined", () => {
		defineJobs(mockSequelize);

		const options = vi.mocked(mockSequelize.define).mock.calls[0][2] as Record<string, unknown>;
		const indexes = options.indexes as Array<Record<string, unknown>>;

		expect(indexes).toHaveLength(4);
		expect(indexes[0]).toEqual({ fields: ["name"] });
		expect(indexes[1]).toEqual({ fields: ["status"] });
		expect(indexes[2]).toEqual({ fields: ["created_at"] });
		expect(indexes[3]).toEqual({ fields: ["source_job_id"] });
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingJob" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				jobs: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineJobs(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});
});
