import { clearPiiRegistry, getRegisteredPiiFields } from "../audit/PiiDecorators";
import { defineArchivedUsers, postSyncArchivedUsers } from "./ArchivedUser";
import { DataTypes, type Sequelize } from "sequelize";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ArchivedUser", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
			query: vi.fn(),
		} as unknown as Sequelize;
	});

	it("should define archived_user model with correct schema", () => {
		defineArchivedUsers(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith("archived_user", expect.any(Object), {
			timestamps: false,
			underscored: true,
			tableName: "archived_users",
		});

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		// Validate id field
		expect(schema.id).toEqual({
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		});

		// Validate userId field
		expect(schema.userId).toEqual({
			type: DataTypes.BIGINT,
			allowNull: false,
		});

		// Validate email field
		expect(schema.email).toEqual({
			type: DataTypes.STRING(255),
			allowNull: false,
		});

		// Validate name field
		expect(schema.name).toEqual({
			type: DataTypes.STRING(200),
			allowNull: true,
		});

		// Validate role field
		expect(schema.role).toEqual({
			type: DataTypes.STRING(50),
			allowNull: true,
		});

		// Validate removedBy field (no FK constraint to allow deleting the remover user)
		expect(schema.removedBy).toEqual({
			type: DataTypes.BIGINT,
			allowNull: false,
		});

		// Validate reason field
		expect(schema.reason).toEqual({
			type: DataTypes.STRING(500),
			allowNull: true,
		});

		// Validate removedAt field
		expect(schema.removedAt).toEqual({
			type: DataTypes.DATE,
			allowNull: false,
			defaultValue: DataTypes.NOW,
		});
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingArchivedUser" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				archived_user: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineArchivedUsers(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});

	it("should define new model when models is undefined", () => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: undefined,
		} as unknown as Sequelize;

		defineArchivedUsers(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalled();
	});

	describe("postSyncArchivedUsers", () => {
		it("should create indexes", async () => {
			await postSyncArchivedUsers(mockSequelize);

			// Only 1 index now (removed idx_archived_users_user_id as user_id lookups are rare)
			// Note: FK constraint removal is handled in ActiveUser.ts postSyncActiveUsers
			expect(mockSequelize.query).toHaveBeenCalledTimes(1);
			expect(mockSequelize.query).toHaveBeenCalledWith(expect.stringContaining("idx_archived_users_removed_at"));
		});
	});

	describe("ArchivedUserPII schema", () => {
		afterEach(() => {
			clearPiiRegistry();
		});

		it("should register PII fields for archived_user resource type", () => {
			const piiFields = getRegisteredPiiFields("archived_user");

			expect(piiFields.size).toBe(2);
			expect(piiFields.has("email")).toBe(true);
			expect(piiFields.has("name")).toBe(true);

			// Verify field descriptions
			expect(piiFields.get("email")?.description).toBe("Archived user email address");
			expect(piiFields.get("name")?.description).toBe("Archived user name");
		});
	});
});
