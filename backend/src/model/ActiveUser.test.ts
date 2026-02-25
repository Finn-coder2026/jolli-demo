import { clearPiiRegistry, getRegisteredPiiFields } from "../audit/PiiDecorators";
import { defineActiveUsers, postSyncActiveUsers } from "./ActiveUser";
import { DataTypes, type Sequelize } from "sequelize";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ActiveUser", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
			query: vi.fn(),
		} as unknown as Sequelize;
	});

	it("should define active_user model with correct schema", () => {
		defineActiveUsers(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith("active_user", expect.any(Object), {
			timestamps: true,
			underscored: true,
			tableName: "active_users",
		});

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		// Validate id field (BIGINT, not auto-increment)
		expect(schema.id).toEqual({
			type: DataTypes.BIGINT,
			primaryKey: true,
		});

		// Validate email field
		expect(schema.email).toEqual({
			type: DataTypes.STRING(255),
			allowNull: false,
		});

		// Validate role field
		expect(schema.role).toEqual({
			type: DataTypes.STRING(50),
			allowNull: false,
		});

		// Validate isActive field
		expect(schema.isActive).toEqual({
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: true,
		});

		// Validate isAgent field
		expect(schema.isAgent).toEqual({
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: false,
		});

		// Validate name field
		expect(schema.name).toEqual({
			type: DataTypes.STRING(255),
			allowNull: true,
		});

		// Validate image field
		expect(schema.image).toEqual({
			type: DataTypes.STRING(500),
			allowNull: true,
		});

		// Validate jobTitle field
		expect(schema.jobTitle).toEqual({
			type: DataTypes.STRING(100),
			allowNull: true,
		});

		// Validate phone field
		expect(schema.phone).toEqual({
			type: DataTypes.STRING(50),
			allowNull: true,
		});

		// Validate language field
		expect(schema.language).toEqual({
			type: DataTypes.STRING(10),
			allowNull: false,
			defaultValue: "en",
		});

		// Validate timezone field
		expect(schema.timezone).toEqual({
			type: DataTypes.STRING(50),
			allowNull: false,
			defaultValue: "UTC",
		});

		// Validate location field
		expect(schema.location).toEqual({
			type: DataTypes.STRING(200),
			allowNull: true,
		});
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingActiveUser" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				active_user: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineActiveUsers(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});

	describe("postSyncActiveUsers", () => {
		it("should run migration and create indexes", async () => {
			// Mock query to return empty arrays for constraint checks
			vi.mocked(mockSequelize.query).mockResolvedValue([[], undefined]);

			await postSyncActiveUsers(mockSequelize);

			// Queries:
			// - 1 for column check (avatar -> image migration)
			// - 1 for index creation (only email index now, removed role and is_active indexes)
			// - 14 for FK constraint existence checks (one per FK to remove, including archived_users)
			expect(mockSequelize.query).toHaveBeenCalledTimes(16);
			expect(mockSequelize.query).toHaveBeenCalledWith(expect.stringContaining("information_schema.columns"));
			expect(mockSequelize.query).toHaveBeenCalledWith(expect.stringContaining("idx_active_users_email"));
			// Note: idx_active_users_role and idx_active_users_is_active indexes were removed
			// because low-cardinality indexes (3 values for role, 2 for boolean) are not efficient
		});

		it("should drop foreign key constraints if they exist", async () => {
			// Mock constraint check to return existing constraint for first FK (archived_users)
			vi.mocked(mockSequelize.query)
				.mockResolvedValueOnce([[], undefined]) // Column check for avatar (not found)
				.mockResolvedValueOnce([[], undefined]) // idx_active_users_email (index creation returns nothing)
				.mockResolvedValueOnce([[{ constraint_name: "archived_users_removed_by_fkey" }], undefined]) // FK exists
				.mockResolvedValueOnce([[], undefined]) // DROP CONSTRAINT result
				.mockResolvedValue([[], undefined]); // All remaining FK checks (not found)

			await postSyncActiveUsers(mockSequelize);

			// Should have called DROP CONSTRAINT for archived_users_removed_by_fkey
			expect(mockSequelize.query).toHaveBeenCalledWith(
				expect.stringContaining('DROP CONSTRAINT "archived_users_removed_by_fkey"'),
			);
		});

		it("should handle non-array result format from query gracefully", async () => {
			// Mock constraint check to return non-array format (result[0] is not an array)
			// This can happen with certain mock configurations or edge cases
			vi.mocked(mockSequelize.query)
				.mockResolvedValueOnce([[], undefined]) // Column check for avatar (not found)
				.mockResolvedValueOnce([[], undefined]) // idx_active_users_email (index creation)
				.mockResolvedValueOnce([undefined, undefined] as never) // FK check returns non-array result[0]
				.mockResolvedValue([[], undefined]); // All remaining FK checks

			// Should not throw - gracefully handles non-array result
			await expect(postSyncActiveUsers(mockSequelize)).resolves.not.toThrow();
		});

		it("should rename avatar column to image if it exists", async () => {
			// Mock the column check to return that avatar column exists, then return empty arrays for all subsequent queries
			vi.mocked(mockSequelize.query)
				.mockResolvedValueOnce([[{ column_name: "avatar" }], undefined]) // Avatar column exists
				.mockResolvedValue([[], undefined]); // All subsequent queries (rename, index, FK checks)

			await postSyncActiveUsers(mockSequelize);

			// Should include the rename query
			expect(mockSequelize.query).toHaveBeenCalledWith(expect.stringContaining("RENAME COLUMN avatar TO image"));
		});

		it("should handle error when checking avatar column gracefully", async () => {
			// Mock: first call throws error, subsequent calls return empty arrays
			let callCount = 0;
			vi.mocked(mockSequelize.query).mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.reject(new Error("Column check failed"));
				}
				return Promise.resolve([[], undefined]) as ReturnType<typeof mockSequelize.query>;
			});

			// Should not throw - error is caught internally
			await expect(postSyncActiveUsers(mockSequelize)).resolves.not.toThrow();
		});
	});

	describe("ActiveUserPII schema", () => {
		afterEach(() => {
			clearPiiRegistry();
		});

		it("should register PII fields for active_user resource type", () => {
			// Re-import to trigger decorators (they run on module load)
			// The decorators have already run when the module was first imported
			const piiFields = getRegisteredPiiFields("active_user");

			expect(piiFields.size).toBe(4);
			expect(piiFields.has("email")).toBe(true);
			expect(piiFields.has("name")).toBe(true);
			expect(piiFields.has("phone")).toBe(true);
			expect(piiFields.has("location")).toBe(true);

			// Verify field descriptions
			expect(piiFields.get("email")?.description).toBe("User email address");
			expect(piiFields.get("name")?.description).toBe("User display name");
			expect(piiFields.get("phone")?.description).toBe("User phone number");
			expect(piiFields.get("location")?.description).toBe("User location");
		});
	});
});
