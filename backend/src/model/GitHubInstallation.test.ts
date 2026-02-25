import { defineGitHubInstallations, TABLE_NAME_GITHUB_INSTALLATIONS } from "./GitHubInstallation";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GitHubInstallation Model", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define github_installations model with correct schema", () => {
		defineGitHubInstallations(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith(
			TABLE_NAME_GITHUB_INSTALLATIONS,
			expect.any(Object),
			expect.objectContaining({ timestamps: true }),
		);

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		expect(schema.id).toEqual({
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		});

		expect(schema.containerType).toEqual({
			type: DataTypes.STRING,
			field: "container_type",
			allowNull: false,
			validate: { isIn: [["org", "user"]] },
		});

		expect(schema.name).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		expect(schema.installationId).toEqual({
			type: DataTypes.INTEGER,
			field: "installation_id",
		});

		expect(schema.repos).toEqual({
			type: DataTypes.JSONB,
			allowNull: false,
			defaultValue: [],
		});
	});

	it("should have correct indexes defined", () => {
		defineGitHubInstallations(mockSequelize);

		const options = vi.mocked(mockSequelize.define).mock.calls[0][2] as Record<string, unknown>;
		const indexes = options.indexes as Array<Record<string, unknown>>;

		expect(indexes).toHaveLength(3);
		expect(indexes[0]).toEqual({ name: "github_installations_name_key", unique: true, fields: ["name"] });
		expect(indexes[1]).toEqual({ fields: ["installation_id"] });
		expect(indexes[2]).toEqual({ fields: ["container_type"] });
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingGitHubInstallation" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				github_installations: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineGitHubInstallations(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});
});
